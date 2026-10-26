import {
  Appliance,
  DELIVERY,
  DISH_FRESH_S,
  INGREDIENTS,
  MAX_HELD_INGREDIENTS,
  Message,
  PASS,
  PassDish,
  RECIPES,
  STARTING_EQUIPMENT,
  Ticket,
  cellCenter,
  freeTicketSlot,
  heldDish,
  heldPrep,
  ingredientsAfterCooking,
  isFinalStep,
  isIngredient,
  isMenuItem,
  isNearAppliance,
  isNearPhone,
  isNearStorage,
  isNearTicketSlot,
  prepItem,
  readyMadeDish,
  stepMs,
  unlockedIngredients,
  unlockedMenu,
  upgradePrice,
  type DiscardTicketMessage,
  type DishSpoiledMessage,
  type EquipmentId,
  type IngredientId,
  type MenuItemId,
  type OrderSuppliesMessage,
  type Player,
  type StartRecipeMessage,
  type TakeIngredientMessage,
  type UpgradeApplianceMessage,
} from "@cacao/shared";
import type { OnMessage, RoomContext } from "./context.ts";

/**
 * Everything on the cook's side: tickets, stock and deliveries, the appliances and the recipe steps
 * on them, the pass, and dishes going stale until the waiter picks them up.
 */
export class Kitchen {
  // Server-only bookkeeping, not part of the synced state. Times are in room clock milliseconds.
  /** When the step in progress on each appliance is done, by appliance id. */
  private applianceReadyAt = new Map<string, number>();
  /** When the supplier's truck reaches the bay, while a delivery is on the way. */
  private deliveryArrivesAt = 0;
  private applianceCount = 0;
  private ticketCount = 0;

  constructor(private ctx: RoomContext) {}

  register(onShift: OnMessage) {
    const { state } = this.ctx;
    const cook = (sessionId: string) => {
      const player = state.players.get(sessionId);
      return player?.role === "kitchen" ? player : null;
    };

    onShift(Message.DiscardTicket, (client, message: DiscardTicketMessage) => {
      const player = cook(client.sessionId);
      const ticket = state.tickets.get(String(message?.ticketId));
      if (!player || !ticket || !isNearTicketSlot(player, ticket.slot)) return;
      state.tickets.delete(ticket.id);
    });

    onShift(Message.TakeIngredient, (client, message: TakeIngredientMessage) => {
      const player = cook(client.sessionId);
      const ingredient = message?.ingredient;
      if (!player || !isIngredient(ingredient)) return;
      if (!isNearStorage(state, player, INGREDIENTS[ingredient].storage)) return;
      const stock = state.stock.get(ingredient) ?? 0;
      if (stock <= 0 || heldDish(player.holding) || heldPrep(player.holding)) return;

      // Served as it is (a can of cola): it comes out as the finished dish, so it needs empty hands.
      const dish = readyMadeDish(ingredient);
      if (dish) {
        if (player.holding.length) return;
        player.holding.push(dish);
        player.freshness = 1;
      } else {
        if (player.holding.length >= MAX_HELD_INGREDIENTS) return;
        player.holding.push(ingredient);
      }
      state.stock.set(ingredient, stock - 1);
    });

    onShift(Message.PutBackIngredient, (client, message: TakeIngredientMessage) => {
      const player = cook(client.sessionId);
      const ingredient = message?.ingredient;
      const index = player?.holding.indexOf(String(ingredient)) ?? -1;
      if (!player || !isIngredient(ingredient) || index < 0) return;
      if (!isNearStorage(state, player, INGREDIENTS[ingredient].storage)) return;
      player.holding.splice(index, 1);
      state.stock.set(ingredient, (state.stock.get(ingredient) ?? 0) + 1);
    });

    onShift(Message.OrderSupplies, (client, message: OrderSuppliesMessage) => {
      const player = cook(client.sessionId);
      if (!player || !isNearPhone(player) || state.delivery.status !== "none") return;

      // Validate the whole order before charging anything.
      const available = unlockedIngredients(state);
      const order: Array<[IngredientId, number]> = [];
      for (const [ingredient, packs] of Object.entries(message?.packs ?? {})) {
        if (!isIngredient(ingredient) || !available.includes(ingredient)) return;
        if (!Number.isInteger(packs) || packs < 0 || packs > DELIVERY.maxPacks) return;
        if (packs > 0) order.push([ingredient, packs]);
      }
      const cost = order.reduce((sum, [ingredient, packs]) => sum + INGREDIENTS[ingredient].pack.priceCents * packs, 0);
      if (order.length === 0 || state.money < cost) return;

      state.money -= cost;
      state.shift.report.ingredientsCents += cost;
      state.delivery.items.clear();
      for (const [ingredient, packs] of order) {
        state.delivery.items.set(ingredient, INGREDIENTS[ingredient].pack.units * packs);
      }
      state.delivery.status = "onTheWay";
      const { min, max } = DELIVERY.arrivalS;
      this.deliveryArrivesAt = this.ctx.clock.currentTime + (min + Math.random() * (max - min)) * 1000;
    });

    onShift(Message.StartRecipe, (client, message: StartRecipeMessage) => {
      const player = cook(client.sessionId);
      const appliance = state.appliances.get(String(message?.applianceId));
      const dish = message?.dish;
      if (!player || !appliance || !isNearAppliance(player, appliance)) return;
      if (!isMenuItem(dish) || !unlockedMenu(state).includes(dish)) return;
      if (appliance.status !== "idle" || RECIPES[dish].steps[0]?.at !== appliance.kind) return;
      const leftover = ingredientsAfterCooking(dish, player.holding);
      if (!leftover) return;

      // The recipe's ingredients go on the appliance; anything else stays in hand.
      player.holding.clear();
      player.holding.push(...leftover);
      this.startStep(appliance, dish, 0);
    });

    onShift(Message.UpgradeAppliance, (client, message: UpgradeApplianceMessage) => {
      const player = cook(client.sessionId);
      const appliance = state.appliances.get(String(message?.applianceId));
      if (!player || !appliance || !isNearAppliance(player, appliance)) return;
      const price = upgradePrice(appliance.kind, appliance.tier);
      if (price === null || state.money < price) return;

      // A step already in progress keeps its time; the next ones are quicker.
      state.money -= price;
      state.shift.report.improvementsCents += price;
      appliance.tier++;
    });
  }

  /** A new ticket on the wall, in the first free slot (the caller checks there is one). */
  addTicket(tableId: string, item: MenuItemId) {
    const ticket = new Ticket();
    ticket.number = ++this.ticketCount;
    ticket.id = `k${ticket.number}`;
    ticket.slot = freeTicketSlot(this.ctx.state)!;
    ticket.tableId = tableId;
    ticket.item = item;
    this.ctx.state.tickets.set(ticket.id, ticket);
  }

  addAppliance(kind: EquipmentId, col: number, row: number) {
    const appliance = new Appliance();
    appliance.id = `a${++this.applianceCount}`;
    appliance.kind = kind;
    const { x, y } = cellCenter(col, row);
    appliance.x = x;
    appliance.y = y;
    this.ctx.state.appliances.set(appliance.id, appliance);
  }

  /** Back to the kitchen the restaurant opens with. */
  resetAppliances() {
    this.ctx.state.appliances.clear();
    for (const { kind, col, row } of STARTING_EQUIPMENT) this.addAppliance(kind, col, row);
  }

  /**
   * Yesterday's food is gone: stock, deliveries, tickets, dishes on the pass and in progress. The
   * appliances themselves stay.
   */
  clearDay() {
    const { state } = this.ctx;
    for (const ingredient of state.stock.keys()) state.stock.set(ingredient, 0);
    state.delivery.status = "none";
    state.delivery.items.clear();
    state.tickets.clear();
    state.pass.clear();
    for (const appliance of state.appliances.values()) this.empty(appliance);
    this.applianceReadyAt.clear();
  }

  // What the cook (and, at the pass, the waiter) does with dishes (see KitchenRoom.interact).

  /** Puts the half-made dish the cook carries on the appliance for its next step. */
  continueRecipe(player: Player, appliance: Appliance, dish: MenuItemId, step: number) {
    player.holding.clear();
    this.startStep(appliance, dish, step);
  }

  /** Takes what's on the appliance: the finished dish, or the dish halfway through its recipe. */
  takeFromAppliance(player: Player, appliance: Appliance, dish: MenuItemId, step: number) {
    if (isFinalStep(dish, step)) {
      player.holding.push(dish);
      player.freshness = appliance.freshness;
    } else {
      player.holding.push(prepItem({ dish, stepsDone: step + 1 }));
    }
    this.empty(appliance);
  }

  placeOnPass(player: Player, dish: MenuItemId) {
    const onPass = new PassDish();
    onPass.dish = dish;
    onPass.freshness = player.freshness;
    this.ctx.state.pass.push(onPass);
    player.holding.clear();
    player.freshness = 0;
  }

  takeFromPass(player: Player, dish: MenuItemId) {
    player.freshness = this.ctx.state.pass.shift()!.freshness;
    player.holding.push(dish);
  }

  /** The cook unloaded the truck: everything goes into storage. */
  receiveDelivery() {
    const { state } = this.ctx;
    state.delivery.items.forEach((units, ingredient) => {
      state.stock.set(ingredient, (state.stock.get(ingredient) ?? 0) + units);
    });
    state.delivery.items.clear();
    state.delivery.status = "none";
  }

  update(dt: number) {
    const { state, clock } = this.ctx;
    for (const appliance of state.appliances.values()) {
      if (appliance.status === "working" && clock.currentTime >= (this.applianceReadyAt.get(appliance.id) ?? 0)) {
        appliance.status = "ready";
        // Only a finished dish goes stale; a half-made one waits as long as it takes.
        if (this.holdsFinishedDish(appliance)) appliance.freshness = 1;
      }
    }
    this.updateFreshness(dt);

    if (state.delivery.status === "onTheWay" && clock.currentTime >= this.deliveryArrivesAt) {
      state.delivery.status = "arrived";
    }
  }

  /** Puts `dish` on the appliance for the given step of its recipe. */
  private startStep(appliance: Appliance, dish: MenuItemId, step: number) {
    appliance.status = "working";
    appliance.dish = dish;
    appliance.step = step;
    appliance.freshness = 0;
    const readyAt = this.ctx.clock.currentTime + stepMs(RECIPES[dish].steps[step].ms, appliance.tier);
    this.applianceReadyAt.set(appliance.id, readyAt);
  }

  private empty(appliance: Appliance) {
    appliance.status = "idle";
    appliance.dish = "";
    appliance.step = 0;
    appliance.freshness = 0;
  }

  /** Whether what's on the appliance is a finished dish rather than one halfway through its recipe. */
  private holdsFinishedDish(appliance: Appliance) {
    return !!appliance.dish && isFinalStep(appliance.dish, appliance.step);
  }

  /** Finished dishes go stale until the waiter picks them up; stale ones are thrown away. */
  private updateFreshness(dt: number) {
    const { state } = this.ctx;
    const loss = dt / DISH_FRESH_S;

    for (const appliance of state.appliances.values()) {
      if (appliance.status !== "ready" || !this.holdsFinishedDish(appliance)) continue;
      appliance.freshness = Math.max(0, appliance.freshness - loss);
      if (appliance.freshness > 0) continue;
      this.empty(appliance);
      this.dishSpoiled(appliance.x, appliance.y, "kitchen");
    }

    // Only in the cook's hands: once the waiter has it, the clock stops.
    for (const player of state.players.values()) {
      if (player.role !== "kitchen" || !heldDish(player.holding)) continue;
      player.freshness = Math.max(0, player.freshness - loss);
      if (player.freshness > 0) continue;
      player.holding.clear();
      this.dishSpoiled(player.x, player.y, "kitchen");
    }

    for (let i = state.pass.length - 1; i >= 0; i--) {
      const onPass = state.pass[i];
      onPass.freshness = Math.max(0, onPass.freshness - loss);
      if (onPass.freshness > 0) continue;
      state.pass.splice(i, 1);
      this.dishSpoiled(PASS.x, PASS.y, "everyone");
    }
  }

  private dishSpoiled(x: number, y: number, seenBy: DishSpoiledMessage["seenBy"]) {
    this.ctx.broadcast(Message.DishSpoiled, { x, y, seenBy } satisfies DishSpoiledMessage);
  }
}
