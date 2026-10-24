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
  PLAYER_SPEED,
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
  INGREDIENTS,
  INGREDIENT_IDS,
  STARTING_MONEY_CENTS,
  STARTING_RECIPES,
  isIngredient,
  isMenuItem,
  isNearFridge,
  isNearPhone,
  isNearStove,
  isNearComputer,
  isNearRecipeBook,
  unlockedIngredients,
  isEquipment,
  canPlaceEquipment,
  cellCenter,
  EQUIPMENT,
  STARTING_STOVES,
  Stove,
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
  type CookMessage,
  type CustomerStatus,
  type BuyEquipmentMessage,
  type BuyRecipeMessage,
  type DishSpoiledMessage,
  type BuyIngredientMessage,
  type DiscardTicketMessage,
  type TakeIngredientMessage,
  type JoinOptions,
  type PlaceOrderMessage,
  type Role,
} from "@cacao/shared";

const NO_INPUT: InputState = { left: false, right: false, up: false, down: false };

/** Delay before the very first customer, so players have a moment to look around. */
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
  private nextCustomerAt = 0;
  /** When the dish on each stove is done, by stove id. */
  private stoveReadyAt = new Map<string, number>();
  private stoveCount = 0;
  private customerCount = 0;
  private ticketCount = 0;

  onCreate() {
    this.nextCustomerAt = this.clock.currentTime + FIRST_CUSTOMER_DELAY_MS;
    this.state.money = STARTING_MONEY_CENTS;
    for (const ingredient of INGREDIENT_IDS) this.state.fridge.set(ingredient, 0);
    this.state.unlockedRecipes.push(...STARTING_RECIPES);
    for (const { col, row } of STARTING_STOVES) this.addStove(col, row);

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

    this.onMessage(Message.Interact, (client) => this.interact(client.sessionId));

    this.onMessage(Message.PlaceOrder, (client, message: PlaceOrderMessage) => {
      const customer = attendedCustomer(this.state, client.sessionId, "ordering");
      const slot = freeTicketSlot(this.state);
      if (!customer || !isMenuItem(message?.item) || !unlockedMenu(this.state).includes(message.item)) return;
      if (slot === null) return;

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

    this.onMessage(Message.CancelOrder, (client) => {
      const customer = attendedCustomer(this.state, client.sessionId, "ordering");
      if (customer) this.stopOrdering(customer);
    });

    this.onMessage(Message.DiscardTicket, (client, message: DiscardTicketMessage) => {
      const player = this.state.players.get(client.sessionId);
      const ticket = this.state.tickets.get(String(message?.ticketId));
      if (player?.role !== "kitchen" || !ticket || !isNearTicketSlot(player, ticket.slot)) return;
      this.state.tickets.delete(ticket.id);
    });

    this.onMessage(Message.TakeIngredient, (client, message: TakeIngredientMessage) => {
      const player = this.state.players.get(client.sessionId);
      const ingredient = message?.ingredient;
      if (player?.role !== "kitchen" || player.holding || !isNearFridge(player) || !isIngredient(ingredient)) return;
      const stock = this.state.fridge.get(ingredient) ?? 0;
      if (stock <= 0) return;
      this.state.fridge.set(ingredient, stock - 1);
      player.holding = ingredient;
    });

    this.onMessage(Message.BuyIngredient, (client, message: BuyIngredientMessage) => {
      const player = this.state.players.get(client.sessionId);
      const ingredient = message?.ingredient;
      if (player?.role !== "hall" || !isNearPhone(player) || !isIngredient(ingredient)) return;
      if (!unlockedIngredients(this.state).includes(ingredient)) return;
      const { units, priceCents } = INGREDIENTS[ingredient].pack;
      if (this.state.money < priceCents) return;
      this.state.money -= priceCents;
      this.state.fridge.set(ingredient, (this.state.fridge.get(ingredient) ?? 0) + units);
    });

    this.onMessage(Message.Cook, (client, message: CookMessage) => {
      const player = this.state.players.get(client.sessionId);
      const stove = this.state.stoves.get(String(message?.stoveId));
      const recipe = isMenuItem(message?.dish) && unlockedMenu(this.state).includes(message.dish)
        ? RECIPES[message.dish]
        : null;
      if (player?.role !== "kitchen" || !recipe || !stove || !isNearStove(player, stove)) return;
      if (stove.status !== "idle" || player.holding !== recipe.ingredient) return;

      player.holding = "";
      stove.status = "cooking";
      stove.dish = message.dish;
      this.stoveReadyAt.set(stove.id, this.clock.currentTime + recipe.cookMs);
    });

    this.onMessage(Message.BuyRecipe, (client, message: BuyRecipeMessage) => {
      const player = this.state.players.get(client.sessionId);
      const recipe = message?.recipe;
      if (player?.role !== "hall" || !isNearRecipeBook(player) || !isMenuItem(recipe)) return;
      const price = RECIPES[recipe].unlockPriceCents;
      if (price === undefined || this.state.unlockedRecipes.includes(recipe) || this.state.money < price) return;
      this.state.money -= price;
      this.state.unlockedRecipes.push(recipe);
    });

    this.onMessage(Message.BuyEquipment, (client, message: BuyEquipmentMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (player?.role !== "hall" || !isNearComputer(player) || !isEquipment(message?.item)) return;
      const { priceCents } = EQUIPMENT[message.item];
      if (this.state.money < priceCents || !canPlaceEquipment(this.state, message.col, message.row)) return;

      this.state.money -= priceCents;
      switch (message.item) {
        case "stove":
          this.addStove(message.col, message.row);
          break;
      }
    });

    this.setSimulationInterval((deltaMs) => this.update(deltaMs / 1000));
  }

  onJoin(client: Client, options: JoinOptions) {
    const role = this.pickRole(options?.role);
    const zone = zoneFor(role);

    const player = new Player();
    player.role = role;
    player.name = cleanName(options?.name) || ROLE_INFO[role].label;
    player.color = ROLE_INFO[role].color;
    player.x = (zone.minX + zone.maxX) / 2;
    player.y = WORLD.height / 2;

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
  }

  private addStove(col: number, row: number) {
    const stove = new Stove();
    stove.id = `s${++this.stoveCount}`;
    const { x, y } = cellCenter(col, row);
    stove.x = x;
    stove.y = y;
    this.state.stoves.set(stove.id, stove);
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
        this.setCustomerStatus(customer, "readingMenu");
        break;
      }
      case "putBack":
        if (isIngredient(player.holding)) {
          this.state.fridge.set(player.holding, (this.state.fridge.get(player.holding) ?? 0) + 1);
        }
        player.holding = "";
        break;
      case "takeDish": {
        const stove = this.state.stoves.get(interaction.stoveId)!;
        player.holding = interaction.dish;
        player.freshness = stove.freshness;
        stove.status = "idle";
        stove.dish = "";
        stove.freshness = 0;
        break;
      }
      case "placeOnPass": {
        const onPass = new PassDish();
        onPass.dish = interaction.dish;
        onPass.freshness = player.freshness;
        this.state.pass.push(onPass);
        player.holding = "";
        player.freshness = 0;
        break;
      }
      case "takeFromPass":
        player.freshness = this.state.pass.shift()!.freshness;
        player.holding = interaction.dish;
        break;
      case "serve": {
        const customer = this.state.customers.get(interaction.customerId)!;
        player.holding = "";
        player.freshness = 0;
        if (interaction.dish === customer.wants) {
          customer.bill += MENU[interaction.dish].priceCents;
          this.setCustomerStatus(customer, "eating");
        } else {
          // Not what they asked for: they storm out.
          customer.patience = 0;
          this.sendAway(customer);
        }
        break;
      }
      case "readTicket":
      case "openFridge":
      case "openStove":
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
        this.state.money += customer.bill;
        this.sendAway(customer);
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
    this.state.players.forEach((player, sessionId) => {
      this.movePlayer(player, this.heldKeys.get(sessionId) ?? NO_INPUT, dt);
      this.updateAction(sessionId, player);
    });
    this.updateCustomers(dt);

    for (const stove of this.state.stoves.values()) {
      if (stove.status === "cooking" && this.clock.currentTime >= (this.stoveReadyAt.get(stove.id) ?? 0)) {
        stove.status = "ready";
        stove.freshness = 1;
      }
    }
    this.updateFreshness(dt);
  }

  /** Cooked dishes go stale until the waiter picks them up; stale ones are thrown away. */
  private updateFreshness(dt: number) {
    const loss = dt / DISH_FRESH_S;

    for (const stove of this.state.stoves.values()) {
      if (stove.status !== "ready") continue;
      stove.freshness = Math.max(0, stove.freshness - loss);
      if (stove.freshness > 0) continue;
      stove.status = "idle";
      stove.dish = "";
      this.dishSpoiled(stove.x, stove.y, "kitchen");
    }

    // Only in the cook's hands: once the waiter has it, the clock stops.
    for (const player of this.state.players.values()) {
      if (player.role !== "kitchen" || !isMenuItem(player.holding)) continue;
      player.freshness = Math.max(0, player.freshness - loss);
      if (player.freshness > 0) continue;
      player.holding = "";
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
    const nextX = clamp(player.x + dx * PLAYER_SPEED * dt, zone.minX, zone.maxX);
    if (!this.hitsObstacle(nextX, player.y)) player.x = nextX;
    const nextY = clamp(player.y + dy * PLAYER_SPEED * dt, half, WORLD.height - half);
    if (!this.hitsObstacle(player.x, nextY)) player.y = nextY;
  }

  private hitsObstacle(x: number, y: number) {
    if (overlapsKitchenFurniture({ x, y }, this.state.stoves.values()) || overlapsHallFurniture({ x, y })) return true;
    for (const table of this.state.tables.values()) {
      if (overlapsTable({ x, y }, table)) return true;
    }
    return false;
  }

  private updateCustomers(dt: number) {
    const now = this.clock.currentTime;
    // Customers turn up at random intervals while someone can serve them and there's room in line.
    const hasWaiter = [...this.state.players.values()].some((p) => p.role === "hall");
    if (hasWaiter && entranceLine(this.state).length < ENTRANCE_LINE_LENGTH && now >= this.nextCustomerAt) {
      this.spawnCustomer();
      const { min, max } = CUSTOMER_TIMING.spawnIntervalS;
      this.nextCustomerAt = now + (min + Math.random() * (max - min)) * 1000;
    }

    const line = entranceLine(this.state);

    this.state.customers.forEach((customer) => {
      const patienceS = CUSTOMER_TIMING.patienceS[customer.status];
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
    customer.status = status;
    if (CUSTOMER_TIMING.patienceS[status]) customer.patience = 1;

    const timed = TIMED_STATUSES[status];
    if (timed) this.statusEndsAt.set(customer.id, this.clock.currentTime + timed.seconds * 1000);
    else this.statusEndsAt.delete(customer.id);
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
