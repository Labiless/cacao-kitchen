import { Room, type Client } from "colyseus";
import {
  ACTIONS,
  CUSTOMER_SIZE,
  CUSTOMER_SPEED,
  CUSTOMER_TIMING,
  Customer,
  FOLLOW_GAP,
  KitchenState,
  ENTRANCE_LINE_LENGTH,
  MAX_PLAYERS,
  MENU,
  Message,
  PLAYER_SIZE,
  Player,
  QUEUE_SPOTS,
  RECIPES,
  ROLES,
  ROLE_INFO,
  TABLE_LAYOUT,
  Table,
  Ticket,
  WORLD,
  attendedCustomer,
  availableInteraction,
  canReachCustomer,
  entranceLine,
  entranceSpot,
  cleanName,
  customerReadyToPay,
  unlockedMenu,
  orderChoices,
  INGREDIENTS,
  INGREDIENT_IDS,
  STARTING_MONEY_CENTS,
  SHIFT,
  nextLevel,
  ShiftReport,
  tipFor,
  REVIEWED_WAITS,
  hallBeauty,
  reviewStars,
  DECORATIONS,
  Decoration,
  canPlaceDecoration,
  isDecoration,
  patienceSeconds,
  type BuyDecorationMessage,
  type ReviewedWait,
  MAX_HELD_INGREDIENTS,
  heldDish,
  heldPrep,
  ingredientsAfterCooking,
  isIngredient,
  isMenuItem,
  isNearPhone,
  isNearDeliveryBay,
  isNearStorage,
  DELIVERY,
  isNearAppliance,
  isNearComputer,
  prepItem,
  readyMadeDish,
  unlockedIngredients,
  isEquipment,
  canBuyEquipment,
  canPlaceEquipment,
  cellCenter,
  EQUIPMENT,
  STARTING_EQUIPMENT,
  stepMs,
  upgradePrice,
  Appliance,
  PassDish,
  PASS,
  DISH_FRESH_S,
  freeTicketSlot,
  isNearTicketSlot,
  isNearRegister,
  isNearTable,
  isRole,
  overlapsHallFurniture,
  overlapsTable,
  overlapsKitchenFurniture,
  seatPosition,
  tableActionFor,
  zoneFor,
  type InputState,
  type EquipmentId,
  type StartRecipeMessage,
  type UpgradeApplianceMessage,
  type CustomerStatus,
  type BuyEquipmentMessage,
  type DishSpoiledMessage,
  type OrderSuppliesMessage,
  type DiscardTicketMessage,
  type IngredientId,
  type MenuItemId,
  type TakeIngredientMessage,
  type JoinOptions,
  type PlaceOrderMessage,
  type Role,
} from "@cacao/shared";

const NO_INPUT: InputState = { left: false, right: false, up: false, down: false };

/** What a seated customer will base their review on, from the moment they sit down. */
interface Visit {
  /** Patience left at the end of each reviewed wait. */
  waits: Partial<Record<ReviewedWait, number>>;
  /** Seconds in the restaurant, and the same weighted by hallBeauty: their ratio is the average beauty. */
  seconds: number;
  beautySeconds: number;
}

/** Delay before the first customer of a shift, so the cook has a moment to order ingredients. */
const FIRST_CUSTOMER_DELAY_MS = 3000;

/** Customer statuses that end on their own after a while, and what comes next. */
const TIMED_STATUSES: Partial<Record<CustomerStatus, { seconds: number; next: CustomerStatus }>> = {
  readingMenu: { seconds: CUSTOMER_TIMING.readingMenuS, next: "readyToOrder" },
  eating: { seconds: CUSTOMER_TIMING.eatingS, next: "queuing" },
};

export class KitchenRoom extends Room<{ state: KitchenState }> {
  maxClients = MAX_PLAYERS;
  state = new KitchenState();

  // Server-only bookkeeping, not part of the synced state. Times are in room clock milliseconds.
  /** Latest input per sessionId. */
  private heldKeys = new Map<string, InputState>();
  /** When each player's current action completes. */
  private actionEndsAt = new Map<string, number>();
  /** When each customer in a TIMED_STATUSES status moves on to the next one. */
  private statusEndsAt = new Map<string, number>();
  /** Seated customers' experience so far, by customer id; those never seated don't review. */
  private visits = new Map<string, Visit>();
  private nextCustomerAt = 0;
  /** When the current shift stops letting customers in. */
  private closesAt = 0;
  /** When the supplier's truck reaches the bay, while a delivery is on the way. */
  private deliveryArrivesAt = 0;
  /** When the step in progress on each appliance is done, by appliance id. */
  private applianceReadyAt = new Map<string, number>();
  private applianceCount = 0;
  private decorationCount = 0;
  private customerCount = 0;
  private ticketCount = 0;

  onCreate() {
    // The room opens on a break: the first shift starts once everyone is ready.
    this.state.money = STARTING_MONEY_CENTS;
    for (const ingredient of INGREDIENT_IDS) this.state.stock.set(ingredient, 0);
    for (const { kind, col, row } of STARTING_EQUIPMENT) this.addAppliance(kind, col, row);

    for (const { id, x, y } of TABLE_LAYOUT) {
      const table = new Table();
      table.id = id;
      table.x = x;
      table.y = y;
      table.status = "free";
      this.state.tables.set(id, table);
    }

    this.onMessage(Message.Input, (client, input: Partial<InputState>) => {
      // Never trust the client: coerce everything to booleans.
      this.heldKeys.set(client.sessionId, {
        left: !!input?.left,
        right: !!input?.right,
        up: !!input?.up,
        down: !!input?.down,
      });
    });

    this.onMessage(Message.SetName, (client, name: string) => {
      const player = this.state.players.get(client.sessionId);
      const cleaned = cleanName(name);
      if (player && cleaned) player.name = cleaned;
    });

    this.onShiftMessage(Message.Interact, (client) => this.interact(client.sessionId));

    this.onShiftMessage(Message.PlaceOrder, (client, message: PlaceOrderMessage) => {
      const customer = attendedCustomer(this.state, client.sessionId, "ordering");
      const slot = freeTicketSlot(this.state);
      if (!customer || !isMenuItem(message?.item) || slot === null) return;
      // Only one of the dishes the dialog offered (which may not be the one the customer showed).
      if (!orderChoices(customer.id, customer.wants, unlockedMenu(this.state)).includes(message.item)) return;

      const ticket = new Ticket();
      ticket.number = ++this.ticketCount;
      ticket.id = `k${ticket.number}`;
      ticket.slot = slot;
      ticket.tableId = customer.tableId;
      ticket.item = message.item;
      this.state.tickets.set(ticket.id, ticket);

      customer.waiterId = "";
      this.setCustomerStatus(customer, "waitingFood");
    });

    this.onMessage(Message.Ready, (client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || this.state.shift.phase !== "break") return;
      player.ready = true;
      this.startShiftIfReady();
    });

    // Anyone can start over, at any time (the client asks for confirmation first).
    this.onMessage(Message.Restart, () => this.restartGame());

    this.onMessage(Message.CancelOrder, (client) => {
      const customer = attendedCustomer(this.state, client.sessionId, "ordering");
      if (customer) this.stopOrdering(customer);
    });

    this.onShiftMessage(Message.DiscardTicket, (client, message: DiscardTicketMessage) => {
      const player = this.state.players.get(client.sessionId);
      const ticket = this.state.tickets.get(String(message?.ticketId));
      if (player?.role !== "kitchen" || !ticket || !isNearTicketSlot(player, ticket.slot)) return;
      this.state.tickets.delete(ticket.id);
    });

    this.onShiftMessage(Message.TakeIngredient, (client, message: TakeIngredientMessage) => {
      const player = this.state.players.get(client.sessionId);
      const ingredient = message?.ingredient;
      if (player?.role !== "kitchen" || !isIngredient(ingredient)) return;
      if (!isNearStorage(this.state, player, INGREDIENTS[ingredient].storage)) return;
      const stock = this.state.stock.get(ingredient) ?? 0;
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
      this.state.stock.set(ingredient, stock - 1);
    });

    this.onShiftMessage(Message.PutBackIngredient, (client, message: TakeIngredientMessage) => {
      const player = this.state.players.get(client.sessionId);
      const ingredient = message?.ingredient;
      const index = player?.holding.indexOf(String(ingredient)) ?? -1;
      if (player?.role !== "kitchen" || !isIngredient(ingredient) || index < 0) return;
      if (!isNearStorage(this.state, player, INGREDIENTS[ingredient].storage)) return;
      player.holding.splice(index, 1);
      this.state.stock.set(ingredient, (this.state.stock.get(ingredient) ?? 0) + 1);
    });

    this.onShiftMessage(Message.OrderSupplies, (client, message: OrderSuppliesMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (player?.role !== "kitchen" || !isNearPhone(player) || this.state.delivery.status !== "none") return;

      // Validate the whole order before charging anything.
      const available = unlockedIngredients(this.state);
      const order: Array<[IngredientId, number]> = [];
      for (const [ingredient, packs] of Object.entries(message?.packs ?? {})) {
        if (!isIngredient(ingredient) || !available.includes(ingredient)) return;
        if (!Number.isInteger(packs) || packs < 0 || packs > DELIVERY.maxPacks) return;
        if (packs > 0) order.push([ingredient, packs]);
      }
      const cost = order.reduce((sum, [ingredient, packs]) => sum + INGREDIENTS[ingredient].pack.priceCents * packs, 0);
      if (order.length === 0 || this.state.money < cost) return;

      this.state.money -= cost;
      this.state.shift.report.ingredientsCents += cost;
      this.state.delivery.items.clear();
      for (const [ingredient, packs] of order) {
        this.state.delivery.items.set(ingredient, INGREDIENTS[ingredient].pack.units * packs);
      }
      this.state.delivery.status = "onTheWay";
      const { min, max } = DELIVERY.arrivalS;
      this.deliveryArrivesAt = this.clock.currentTime + (min + Math.random() * (max - min)) * 1000;
    });

    this.onShiftMessage(Message.StartRecipe, (client, message: StartRecipeMessage) => {
      const player = this.state.players.get(client.sessionId);
      const appliance = this.state.appliances.get(String(message?.applianceId));
      const dish = message?.dish;
      if (player?.role !== "kitchen" || !appliance || !isNearAppliance(player, appliance)) return;
      if (!isMenuItem(dish) || !unlockedMenu(this.state).includes(dish)) return;
      if (appliance.status !== "idle" || RECIPES[dish].steps[0]?.at !== appliance.kind) return;
      const leftover = ingredientsAfterCooking(dish, player.holding);
      if (!leftover) return;

      // The recipe's ingredients go on the appliance; anything else stays in hand.
      player.holding.clear();
      player.holding.push(...leftover);
      this.startStep(appliance, dish, 0);
    });

    this.onShiftMessage(Message.UpgradeAppliance, (client, message: UpgradeApplianceMessage) => {
      const player = this.state.players.get(client.sessionId);
      const appliance = this.state.appliances.get(String(message?.applianceId));
      if (player?.role !== "kitchen" || !appliance || !isNearAppliance(player, appliance)) return;
      const price = upgradePrice(appliance.kind, appliance.tier);
      if (price === null || this.state.money < price) return;

      // A step already in progress keeps its time; the next ones are quicker.
      this.state.money -= price;
      this.state.shift.report.improvementsCents += price;
      appliance.tier++;
    });

    this.onShiftMessage(Message.BuyDecoration, (client, message: BuyDecorationMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (player?.role !== "hall" || !isNearComputer(player) || !isDecoration(message?.item)) return;
      const { priceCents } = DECORATIONS[message.item];
      if (this.state.money < priceCents || !canPlaceDecoration(this.state, message.slot)) return;

      this.state.money -= priceCents;
      this.state.shift.report.improvementsCents += priceCents;
      const decoration = new Decoration();
      decoration.id = `d${++this.decorationCount}`;
      decoration.kind = message.item;
      decoration.slot = message.slot;
      this.state.decorations.set(decoration.id, decoration);
    });

    this.onShiftMessage(Message.BuyEquipment, (client, message: BuyEquipmentMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (player?.role !== "hall" || !isNearComputer(player) || !isEquipment(message?.item)) return;
      const { priceCents } = EQUIPMENT[message.item];
      if (this.state.money < priceCents || !canBuyEquipment(this.state, message.item)) return;
      if (!canPlaceEquipment(this.state, message.col, message.row)) return;

      this.state.money -= priceCents;
      this.state.shift.report.improvementsCents += priceCents;
      this.addAppliance(message.item, message.col, message.row);
    });

    this.setSimulationInterval((deltaMs) => this.update(deltaMs / 1000));
  }

  onJoin(client: Client, options: JoinOptions) {
    const role = this.pickRole(options?.role);
    const player = new Player();
    player.role = role;
    player.name = cleanName(options?.name) || ROLE_INFO[role].label;
    player.color = ROLE_INFO[role].color;
    this.moveToStart(player);

    this.state.players.set(client.sessionId, player);
    this.heldKeys.set(client.sessionId, NO_INPUT);
    console.log(`[${this.roomId}] ${player.name} joined as ${role}`);
  }

  /** The requested role if it's still free, otherwise whichever one is left. */
  private pickRole(preferred: unknown): Role {
    const taken = new Set([...this.state.players.values()].map((p) => p.role));
    if (isRole(preferred) && !taken.has(preferred)) return preferred;
    return ROLES.find((role) => !taken.has(role)) ?? ROLES[0];
  }

  onLeave(client: Client) {
    // A customer they were leading is released in updateCustomers().
    this.state.players.delete(client.sessionId);
    this.heldKeys.delete(client.sessionId);
    this.actionEndsAt.delete(client.sessionId);
    // Whoever is left may have been waiting only for them.
    this.startShiftIfReady();
  }

  /** Like onMessage, but drops the message outside a shift: nothing can be done while a report is up. */
  private onShiftMessage<T>(type: string, handler: (client: Client, message: T) => void) {
    this.onMessage(type, (client, message: T) => {
      const { phase } = this.state.shift;
      if (phase === "open" || phase === "closing") handler(client, message);
    });
  }

  /** In the middle of their side of the map. */
  private moveToStart(player: Player) {
    const zone = zoneFor(player.role);
    player.x = (zone.minX + zone.maxX) / 2;
    player.y = WORLD.height / 2;
  }

  private startShiftIfReady() {
    const players = [...this.state.players.values()];
    if (this.state.shift.phase === "break" && players.length && players.every((p) => p.ready)) this.startShift();
  }

  /**
   * A new day: money, appliances and recipes carry over, everything else starts fresh. Yesterday's
   * food is gone (stock, deliveries, dishes in progress), so ingredients have to be ordered again.
   */
  private startShift() {
    const { shift } = this.state;
    shift.day++;
    shift.phase = "open";
    shift.secondsLeft = SHIFT.durationS;
    shift.report = new ShiftReport();
    this.closesAt = this.clock.currentTime + SHIFT.durationS * 1000;
    this.nextCustomerAt = this.clock.currentTime + FIRST_CUSTOMER_DELAY_MS;
    this.clearDay();
  }

  /** Everything that doesn't carry over from one shift to the next: food, customers, tickets, hands. */
  private clearDay() {
    for (const ingredient of this.state.stock.keys()) this.state.stock.set(ingredient, 0);
    this.state.delivery.status = "none";
    this.state.delivery.items.clear();
    this.state.tickets.clear();
    this.state.pass.clear();
    this.state.queue.clear();
    this.state.customers.clear();
    this.statusEndsAt.clear();
    this.visits.clear();
    for (const table of this.state.tables.values()) table.status = "free";
    for (const appliance of this.state.appliances.values()) {
      appliance.status = "idle";
      appliance.dish = "";
      appliance.step = 0;
      appliance.freshness = 0;
    }
    this.applianceReadyAt.clear();
    this.state.players.forEach((player, sessionId) => {
      player.ready = false;
      player.holding.clear();
      player.freshness = 0;
      this.clearAction(sessionId, player);
      this.moveToStart(player);
    });
  }

  /** Everyone has left and the hall is clean: wages and bills are paid and the report goes up. */
  private endShift() {
    const { shift } = this.state;
    const { report } = shift;
    report.staffCents = SHIFT.staffCents;
    // The fridge isn't in the appliances map but uses electricity too.
    report.billsCents = (this.state.appliances.size + 1) * SHIFT.billPerApplianceCents;
    this.state.money -= report.staffCents + report.billsCents;
    // In the red: the restaurant closes for good.
    const bankrupt = this.state.money < 0;

    // The shift's score joins the restaurant's average; a shift without reviews doesn't count.
    if (report.ratingCount) {
      const score = report.ratingSum / report.ratingCount;
      this.state.stars = (this.state.stars * this.state.ratedShifts + score) / (this.state.ratedShifts + 1);
      this.state.ratedShifts++;
    }
    // A shift passed is a level passed, and new recipes on the menu.
    if (!bankrupt && nextLevel(this.state.level) > this.state.level) {
      this.state.level = nextLevel(this.state.level);
      report.newLevel = this.state.level;
    }
    shift.phase = bankrupt ? "gameOver" : "break";
    shift.secondsLeft = 0;
  }

  /** A brand new restaurant, as when the room was created; the players stay. */
  private restartGame() {
    const { state } = this;
    state.money = STARTING_MONEY_CENTS;
    state.level = 1;
    state.stars = 0;
    state.ratedShifts = 0;
    state.decorations.clear();
    state.appliances.clear();
    for (const { kind, col, row } of STARTING_EQUIPMENT) this.addAppliance(kind, col, row);
    state.shift.day = 0;
    state.shift.phase = "break";
    state.shift.secondsLeft = 0;
    state.shift.report = new ShiftReport();
    this.clearDay();
  }

  /** Runs the shift clock: open → closing when time's up, closing → break once the restaurant is empty. */
  private updateShift() {
    const { shift } = this.state;
    if (shift.phase === "open") {
      const left = Math.max(0, Math.ceil((this.closesAt - this.clock.currentTime) / 1000));
      if (left !== shift.secondsLeft) shift.secondsLeft = left;
      if (left === 0) shift.phase = "closing";
    } else if (shift.phase === "closing") {
      const dirty = [...this.state.tables.values()].some((table) => table.status !== "free");
      if (this.state.customers.size === 0 && !dirty) this.endShift();
    }
  }

  private addAppliance(kind: EquipmentId, col: number, row: number) {
    const appliance = new Appliance();
    appliance.id = `a${++this.applianceCount}`;
    appliance.kind = kind;
    const { x, y } = cellCenter(col, row);
    appliance.x = x;
    appliance.y = y;
    this.state.appliances.set(appliance.id, appliance);
  }

  /** Puts `dish` on the appliance for the given step of its recipe. */
  private startStep(appliance: Appliance, dish: MenuItemId, step: number) {
    appliance.status = "working";
    appliance.dish = dish;
    appliance.step = step;
    appliance.freshness = 0;
    this.applianceReadyAt.set(appliance.id, this.clock.currentTime + stepMs(RECIPES[dish].steps[step].ms, appliance.tier));
  }

  /** Whether the step on the appliance is the last of its recipe, so what's on it is the finished dish. */
  private isLastStep(appliance: Appliance) {
    return !!appliance.dish && appliance.step === RECIPES[appliance.dish].steps.length - 1;
  }

  /** E was pressed: do whatever the shared rules say is possible from where the player stands. */
  private interact(sessionId: string) {
    const player = this.state.players.get(sessionId);
    const interaction = availableInteraction(this.state, sessionId);
    if (!player || !interaction) return;

    switch (interaction.kind) {
      case "lead": {
        const customer = this.state.customers.get(interaction.customerId)!;
        customer.waiterId = sessionId;
        this.setCustomerStatus(customer, "following");
        break;
      }
      case "release": {
        const customer = this.state.customers.get(interaction.customerId)!;
        customer.waiterId = "";
        // Back to waiting, keeping the patience they had left.
        customer.status = "waiting";
        break;
      }
      case "takeOrder": {
        const customer = this.state.customers.get(interaction.customerId)!;
        customer.waiterId = sessionId;
        this.setCustomerStatus(customer, "ordering");
        break;
      }
      case "seat": {
        const customer = this.state.customers.get(interaction.customerId)!;
        const table = this.state.tables.get(interaction.tableId)!;
        const seat = seatPosition(table);
        customer.waiterId = "";
        customer.tableId = table.id;
        customer.x = seat.x;
        customer.y = seat.y;
        table.status = "occupied";
        this.visits.set(customer.id, { waits: {}, seconds: 0, beautySeconds: 0 });
        this.setCustomerStatus(customer, "readingMenu");
        break;
      }
      case "continueRecipe": {
        const appliance = this.state.appliances.get(interaction.applianceId)!;
        player.holding.clear();
        this.startStep(appliance, interaction.dish, interaction.step);
        break;
      }
      case "takeFromAppliance": {
        const appliance = this.state.appliances.get(interaction.applianceId)!;
        if (this.isLastStep(appliance)) {
          player.holding.push(interaction.dish);
          player.freshness = appliance.freshness;
        } else {
          player.holding.push(prepItem({ dish: interaction.dish, stepsDone: interaction.step + 1 }));
        }
        appliance.status = "idle";
        appliance.dish = "";
        appliance.step = 0;
        appliance.freshness = 0;
        break;
      }
      case "placeOnPass": {
        const onPass = new PassDish();
        onPass.dish = interaction.dish;
        onPass.freshness = player.freshness;
        this.state.pass.push(onPass);
        player.holding.clear();
        player.freshness = 0;
        break;
      }
      case "takeFromPass":
        player.freshness = this.state.pass.shift()!.freshness;
        player.holding.push(interaction.dish);
        break;
      case "serve": {
        const customer = this.state.customers.get(interaction.customerId)!;
        player.holding.clear();
        player.freshness = 0;
        if (interaction.dish === customer.wants) {
          customer.bill += MENU[interaction.dish].priceCents;
          // The more patience they had left, the bigger the tip.
          customer.tip += tipFor(MENU[interaction.dish].priceCents, customer.patience);
          this.setCustomerStatus(customer, "eating");
        } else {
          // Not what they asked for: they storm out.
          customer.patience = 0;
          this.sendAway(customer);
        }
        break;
      }
      case "readTicket":
      case "openStorage":
      case "openAppliance":
      case "openPhone":
      case "openComputer":
      case "openRecipeBook":
      case "blocked":
        // Nothing to do on the server: these only open a popup (or explain why E does nothing).
        break;
      case "action":
        player.action = interaction.action;
        player.actionTarget = interaction.targetId;
        this.actionEndsAt.set(sessionId, this.clock.currentTime + ACTIONS[interaction.action].durationMs);
        break;
    }
  }

  /** Completes the player's action when its time is up, or cancels it if it's no longer possible. */
  private updateAction(sessionId: string, player: Player) {
    if (!player.action) return;

    // Walked away, or the target changed under us: the action is lost.
    if (!this.canContinueAction(player)) {
      this.clearAction(sessionId, player);
      return;
    }
    if (this.clock.currentTime < (this.actionEndsAt.get(sessionId) ?? 0)) return;

    switch (player.action) {
      case "cleanTable":
        this.state.tables.get(player.actionTarget)!.status = "free";
        break;
      case "checkout": {
        const customer = this.state.customers.get(player.actionTarget)!;
        const { report } = this.state.shift;
        this.state.money += customer.bill + customer.tip;
        report.salesCents += customer.bill;
        report.tipsCents += customer.tip;
        report.paid++;
        this.sendAway(customer);
        break;
      }
      case "receiveDelivery": {
        const { delivery } = this.state;
        delivery.items.forEach((units, ingredient) => {
          this.state.stock.set(ingredient, (this.state.stock.get(ingredient) ?? 0) + units);
        });
        delivery.items.clear();
        delivery.status = "none";
        break;
      }
    }
    this.clearAction(sessionId, player);
  }

  private canContinueAction(player: Player) {
    switch (player.action) {
      case "cleanTable": {
        const table = this.state.tables.get(player.actionTarget);
        return !!table && isNearTable(player, table) && tableActionFor(table.status) === "cleanTable";
      }
      case "checkout":
        return isNearRegister(player) && customerReadyToPay(this.state)?.id === player.actionTarget;
      case "receiveDelivery":
        return isNearDeliveryBay(player) && this.state.delivery.status === "arrived";
      default:
        return false;
    }
  }

  private clearAction(sessionId: string, player: Player) {
    player.action = "";
    player.actionTarget = "";
    this.actionEndsAt.delete(sessionId);
  }

  private update(dt: number) {
    this.updateShift();
    this.state.players.forEach((player, sessionId) => {
      this.movePlayer(player, this.heldKeys.get(sessionId) ?? NO_INPUT, dt);
      this.updateAction(sessionId, player);
    });
    this.updateCustomers(dt);

    for (const appliance of this.state.appliances.values()) {
      if (appliance.status === "working" && this.clock.currentTime >= (this.applianceReadyAt.get(appliance.id) ?? 0)) {
        appliance.status = "ready";
        // Only a finished dish goes stale; a half-made one waits as long as it takes.
        if (this.isLastStep(appliance)) appliance.freshness = 1;
      }
    }
    this.updateFreshness(dt);

    if (this.state.delivery.status === "onTheWay" && this.clock.currentTime >= this.deliveryArrivesAt) {
      this.state.delivery.status = "arrived";
    }
  }

  /** Cooked dishes go stale until the waiter picks them up; stale ones are thrown away. */
  private updateFreshness(dt: number) {
    const loss = dt / DISH_FRESH_S;

    for (const appliance of this.state.appliances.values()) {
      if (appliance.status !== "ready" || !this.isLastStep(appliance)) continue;
      appliance.freshness = Math.max(0, appliance.freshness - loss);
      if (appliance.freshness > 0) continue;
      appliance.status = "idle";
      appliance.dish = "";
      appliance.step = 0;
      this.dishSpoiled(appliance.x, appliance.y, "kitchen");
    }

    // Only in the cook's hands: once the waiter has it, the clock stops.
    for (const player of this.state.players.values()) {
      if (player.role !== "kitchen" || !heldDish(player.holding)) continue;
      player.freshness = Math.max(0, player.freshness - loss);
      if (player.freshness > 0) continue;
      player.holding.clear();
      this.dishSpoiled(player.x, player.y, "kitchen");
    }

    for (let i = this.state.pass.length - 1; i >= 0; i--) {
      const onPass = this.state.pass[i];
      onPass.freshness = Math.max(0, onPass.freshness - loss);
      if (onPass.freshness > 0) continue;
      this.state.pass.splice(i, 1);
      this.dishSpoiled(PASS.x, PASS.y, "everyone");
    }
  }

  private dishSpoiled(x: number, y: number, seenBy: DishSpoiledMessage["seenBy"]) {
    this.broadcast(Message.DishSpoiled, { x, y, seenBy } satisfies DishSpoiledMessage);
  }

  private movePlayer(player: Player, input: InputState, dt: number) {
    let dx = Number(input.right) - Number(input.left);
    let dy = Number(input.down) - Number(input.up);
    if (dx === 0 && dy === 0) return;

    // Normalize so diagonal movement isn't faster.
    const length = Math.hypot(dx, dy);
    dx /= length;
    dy /= length;

    // One axis at a time, so a player blocked by an obstacle can still slide along it.
    const zone = zoneFor(player.role);
    const half = PLAYER_SIZE / 2;
    const speed = ROLE_INFO[player.role].speed;
    const nextX = clamp(player.x + dx * speed * dt, zone.minX, zone.maxX);
    if (!this.hitsObstacle(nextX, player.y)) player.x = nextX;
    const nextY = clamp(player.y + dy * speed * dt, half, WORLD.height - half);
    if (!this.hitsObstacle(player.x, nextY)) player.y = nextY;
  }

  private hitsObstacle(x: number, y: number) {
    if (overlapsKitchenFurniture({ x, y }, this.state.appliances.values()) || overlapsHallFurniture({ x, y })) return true;
    for (const table of this.state.tables.values()) {
      if (overlapsTable({ x, y }, table)) return true;
    }
    return false;
  }

  private updateCustomers(dt: number) {
    const now = this.clock.currentTime;
    // Customers turn up at random intervals while the restaurant is open, someone can serve them and
    // there's room in line.
    const hasWaiter = [...this.state.players.values()].some((p) => p.role === "hall");
    if (this.state.shift.phase === "open" && hasWaiter && entranceLine(this.state).length < ENTRANCE_LINE_LENGTH && now >= this.nextCustomerAt) {
      this.spawnCustomer();
      const { min, max } = CUSTOMER_TIMING.spawnIntervalS;
      this.nextCustomerAt = now + (min + Math.random() * (max - min)) * 1000;
    }

    const line = entranceLine(this.state);
    const beauty = hallBeauty(this.state);
    for (const visit of this.visits.values()) {
      visit.seconds += dt;
      visit.beautySeconds += dt * beauty;
    }

    this.state.customers.forEach((customer) => {
      const patienceS = patienceSeconds(customer.status, customer.wants);
      if (patienceS) {
        // The longer the line they're in, the faster they lose patience.
        const lineLength = customer.status === "waiting" ? line.length
          : customer.status === "queuing" ? this.state.queue.length
          : 1;
        const crowding = 1 + CUSTOMER_TIMING.crowdImpatience * Math.max(0, lineLength - 1);
        customer.patience = Math.max(0, customer.patience - (dt * crowding) / patienceS);
        if (customer.patience === 0) {
          this.sendAway(customer);
          return;
        }
      }

      const timed = TIMED_STATUSES[customer.status];
      if (timed && now >= (this.statusEndsAt.get(customer.id) ?? 0)) {
        if (timed.next === "queuing") this.joinQueue(customer);
        else this.setCustomerStatus(customer, timed.next);
        return;
      }

      switch (customer.status) {
        case "following": {
          const leader = this.state.players.get(customer.waiterId);
          if (leader) {
            this.follow(customer, leader, dt);
          } else {
            // Their waiter left the room: back to the entrance to wait for someone else,
            // keeping the patience they had left.
            customer.waiterId = "";
            customer.status = "waiting";
          }
          break;
        }

        case "waiting":
          this.walkTowards(customer, entranceSpot(Math.max(0, line.indexOf(customer))), dt);
          break;

        case "queuing": {
          const spot = QUEUE_SPOTS[Math.max(0, this.state.queue.indexOf(customer.id))];
          this.walkTowards(customer, spot, dt);
          break;
        }

        case "ordering": {
          // The dialog was abandoned: the waiter left the room or walked off.
          const waiter = this.state.players.get(customer.waiterId);
          if (!waiter || !canReachCustomer(this.state, waiter, customer)) this.stopOrdering(customer);
          break;
        }
      }
    });
  }

  /** Changes status, refilling patience if it drains in the new status and starting its timer if it has one. */
  private setCustomerStatus(customer: Customer, status: CustomerStatus) {
    this.recordWait(customer);
    customer.status = status;
    if (patienceSeconds(status, customer.wants)) customer.patience = 1;

    const timed = TIMED_STATUSES[status];
    if (timed) this.statusEndsAt.set(customer.id, this.clock.currentTime + timed.seconds * 1000);
    else this.statusEndsAt.delete(customer.id);
  }

  /**
   * About to leave a status: if it's a wait that counts for the review, note how much patience is left.
   * A wait left and entered again (an order dialog closed without ordering) keeps the latest value.
   */
  private recordWait(customer: Customer) {
    const visit = this.visits.get(customer.id);
    const status = customer.status as ReviewedWait;
    if (visit && REVIEWED_WAITS.includes(status)) visit.waits[status] = customer.patience;
  }

  /** Back to waiting for the waiter, keeping the patience they had left. */
  private stopOrdering(customer: Customer) {
    customer.status = "readyToOrder";
    customer.waiterId = "";
  }

  private spawnCustomer() {
    // One random item off the menu, whether or not there's anything in the fridge to make it.
    const menu = unlockedMenu(this.state);
    if (menu.length === 0) return;

    const customer = new Customer();
    customer.id = `c${++this.customerCount}`;
    // They come in through the door and walk to the back of the line.
    customer.x = WORLD.width + CUSTOMER_SIZE;
    customer.y = entranceSpot(0).y;
    customer.wants = menu[Math.floor(Math.random() * menu.length)];
    this.setCustomerStatus(customer, "waiting");
    this.state.customers.set(customer.id, customer);
  }

  /** Done eating: they get up (leaving the table dirty) and join the queue at the till. */
  private joinQueue(customer: Customer) {
    const table = this.state.tables.get(customer.tableId);
    if (table) table.status = "dirty";
    customer.tableId = "";
    this.state.queue.push(customer.id);
    this.setCustomerStatus(customer, "queuing");
  }

  /** Moves the customer straight towards `target`, at most one step's worth. */
  private walkTowards(customer: Customer, target: { x: number; y: number }, dt: number) {
    const dx = target.x - customer.x;
    const dy = target.y - customer.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 0.5) return;
    const step = Math.min(distance, CUSTOMER_SPEED * dt);
    customer.x += (dx / distance) * step;
    customer.y += (dy / distance) * step;
  }

  /** Walks towards the leader, stopping just behind them. */
  private follow(customer: Customer, leader: Player, dt: number) {
    const dx = leader.x - customer.x;
    const dy = leader.y - customer.y;
    const distance = Math.hypot(dx, dy);
    const gap = (PLAYER_SIZE + CUSTOMER_SIZE) / 2 + FOLLOW_GAP;
    if (distance <= gap) return;

    const step = Math.min(distance - gap, CUSTOMER_SPEED * dt);
    customer.x += (dx / distance) * step;
    customer.y += (dy / distance) * step;
  }

  /** Marks the customer as leaving, then removes them. Their ticket stays. */
  private sendAway(customer: Customer) {
    const { report } = this.state.shift;
    // Patience 0: they left unhappy, without paying.
    const angry = customer.patience === 0;
    if (angry) report.lost++;

    // Their review, if they got as far as a table. Set before the status, so it's there when clients see them leave.
    this.recordWait(customer);
    const visit = this.visits.get(customer.id);
    if (visit) {
      const beauty = visit.seconds > 0 ? visit.beautySeconds / visit.seconds : hallBeauty(this.state);
      customer.rating = reviewStars(visit.waits, beauty, angry);
      report.ratingSum += customer.rating;
      report.ratingCount++;
      this.visits.delete(customer.id);
    }

    customer.status = "leaving";
    customer.waiterId = "";
    this.statusEndsAt.delete(customer.id);

    // Whoever was behind them in the queue moves up.
    const queued = this.state.queue.indexOf(customer.id);
    if (queued >= 0) this.state.queue.splice(queued, 1);

    // A table they were still sitting at needs cleaning.
    const table = this.state.tables.get(customer.tableId);
    if (table) table.status = "dirty";

    this.clock.setTimeout(() => this.state.customers.delete(customer.id), CUSTOMER_TIMING.leavingS * 1000);
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
