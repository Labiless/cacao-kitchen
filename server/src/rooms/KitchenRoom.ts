import { Room, type Client } from "colyseus";
import {
  ACTIONS,
  CUSTOMER_SIZE,
  CUSTOMER_SPEED,
  CUSTOMER_TIMING,
  Customer,
  ENTRANCE,
  FOLLOW_GAP,
  KitchenState,
  MAX_PLAYERS,
  MENU_ITEMS,
  Message,
  PLAYER_SIZE,
  PLAYER_SPEED,
  Player,
  ROLES,
  ROLE_INFO,
  TABLE_LAYOUT,
  Table,
  Ticket,
  WORLD,
  attendedCustomer,
  availableInteraction,
  canReachCustomer,
  cleanName,
  isIngredient,
  isMenuItem,
  isNearFridge,
  freeTicketSlot,
  isNearTicketSlot,
  isNearTable,
  isRole,
  overlapsTable,
  overlapsKitchenFurniture,
  seatPosition,
  tableActionFor,
  zoneFor,
  type InputState,
  type CustomerStatus,
  type DiscardTicketMessage,
  type TakeIngredientMessage,
  type JoinOptions,
  type PlaceOrderMessage,
  type Role,
} from "@cacao/shared";

const NO_INPUT: InputState = { left: false, right: false, up: false, down: false };

/** Delay before the very first customer, so players have a moment to look around. */
const FIRST_CUSTOMER_DELAY_MS = 3000;

/** Temporary, until the kitchen exists: seconds after ordering before the food shows up on its own. */
const FOOD_ARRIVES_AFTER_S = 5;

/** Customer statuses that end on their own after a while, and what comes next. */
const TIMED_STATUSES: Partial<Record<CustomerStatus, { seconds: number; next: CustomerStatus }>> = {
  readingMenu: { seconds: CUSTOMER_TIMING.readingMenuS, next: "readyToOrder" },
  waitingFood: { seconds: FOOD_ARRIVES_AFTER_S, next: "eating" },
  eating: { seconds: CUSTOMER_TIMING.eatingS, next: "readyToLeave" },
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
  private customerCount = 0;
  private ticketCount = 0;

  onCreate() {
    this.nextCustomerAt = this.clock.currentTime + FIRST_CUSTOMER_DELAY_MS;

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
      if (!customer || !isMenuItem(message?.item) || slot === null) return;

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
      if (player?.role !== "kitchen" || player.holding || !isNearFridge(player)) return;
      if (isIngredient(message?.ingredient)) player.holding = message.ingredient;
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
      case "escort": {
        const customer = this.state.customers.get(interaction.customerId)!;
        // They get up: the table is left dirty.
        const table = this.state.tables.get(customer.tableId);
        if (table) table.status = "dirty";
        customer.tableId = "";
        customer.waiterId = sessionId;
        this.setCustomerStatus(customer, "escortedOut");
        break;
      }
      case "farewell":
        this.sendAway(this.state.customers.get(interaction.customerId)!);
        break;
      case "putBack":
        player.holding = "";
        break;
      case "readTicket":
      case "openFridge":
      case "blocked":
        // Nothing to do on the server: these only open a popup (or explain why E does nothing).
        break;
      case "action":
        player.action = interaction.action;
        player.actionTarget = interaction.tableId;
        this.actionEndsAt.set(sessionId, this.clock.currentTime + ACTIONS[interaction.action].durationMs);
        break;
    }
  }

  /** Completes the player's action when its time is up, or cancels it if it's no longer possible. */
  private updateAction(sessionId: string, player: Player) {
    if (!player.action) return;
    const table = this.state.tables.get(player.actionTarget);

    // Walked away, or the table changed under us: the action is lost.
    if (!table || !isNearTable(player, table) || tableActionFor(table.status) !== player.action) {
      this.clearAction(sessionId, player);
      return;
    }
    if (this.clock.currentTime < (this.actionEndsAt.get(sessionId) ?? 0)) return;

    switch (player.action) {
      case "cleanTable":
        table.status = "free";
        break;
    }
    this.clearAction(sessionId, player);
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
    if (overlapsKitchenFurniture({ x, y })) return true;
    for (const table of this.state.tables.values()) {
      if (overlapsTable({ x, y }, table)) return true;
    }
    return false;
  }

  private updateCustomers(dt: number) {
    const now = this.clock.currentTime;
    // One customer at a time for now, and only while someone can serve them.
    const hasWaiter = [...this.state.players.values()].some((p) => p.role === "hall");
    if (this.state.customers.size === 0 && hasWaiter && now >= this.nextCustomerAt) {
      this.spawnCustomer();
    }

    this.state.customers.forEach((customer) => {
      const patienceS = CUSTOMER_TIMING.patienceS[customer.status];
      if (patienceS) {
        customer.patience = Math.max(0, customer.patience - dt / patienceS);
        if (customer.patience === 0) {
          this.sendAway(customer);
          return;
        }
      }

      const timed = TIMED_STATUSES[customer.status];
      if (timed && now >= (this.statusEndsAt.get(customer.id) ?? 0)) {
        this.setCustomerStatus(customer, timed.next);
        return;
      }

      switch (customer.status) {
        case "following":
        case "escortedOut": {
          const leader = this.state.players.get(customer.waiterId);
          if (leader) {
            this.follow(customer, leader, dt);
          } else {
            // Their waiter left the room: they stop where they are and wait for someone else,
            // keeping the patience they had left.
            customer.waiterId = "";
            customer.status = customer.status === "following" ? "waiting" : "readyToLeave";
          }
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
    const customer = new Customer();
    customer.id = `c${++this.customerCount}`;
    customer.x = ENTRANCE.x;
    customer.y = ENTRANCE.y;
    customer.wants = MENU_ITEMS[Math.floor(Math.random() * MENU_ITEMS.length)];
    this.setCustomerStatus(customer, "waiting");
    this.state.customers.set(customer.id, customer);
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

  /** Marks the customer as leaving, then removes them and schedules the next one. Their ticket stays. */
  private sendAway(customer: Customer) {
    customer.status = "leaving";
    customer.waiterId = "";
    this.statusEndsAt.delete(customer.id);

    // A table they were still sitting at needs cleaning.
    const table = this.state.tables.get(customer.tableId);
    if (table) table.status = "dirty";

    this.clock.setTimeout(() => {
      this.state.customers.delete(customer.id);
      this.nextCustomerAt = this.clock.currentTime + CUSTOMER_TIMING.spawnDelayS * 1000;
    }, CUSTOMER_TIMING.leavingS * 1000);
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
