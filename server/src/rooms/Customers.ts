import {
  CUSTOMER_SIZE,
  CUSTOMER_SPEED,
  CUSTOMER_TIMING,
  Customer,
  ENTRANCE_LINE_LENGTH,
  FOLLOW_GAP,
  MENU,
  Message,
  PLAYER_SIZE,
  QUEUE_SPOTS,
  REVIEWED_WAITS,
  WORLD,
  attendedCustomer,
  canReachCustomer,
  entranceLine,
  entranceSpot,
  freeTicketSlot,
  hallBeauty,
  isMenuItem,
  orderChoices,
  patienceSeconds,
  reviewStars,
  seatPosition,
  tipFor,
  unlockedMenu,
  type CustomerStatus,
  type MenuItemId,
  type PlaceOrderMessage,
  type Player,
  type ReviewedWait,
  type Table,
} from "@cacao/shared";
import type { Kitchen } from "./Kitchen.ts";
import type { OnMessage, RoomContext } from "./context.ts";

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

/**
 * The dining hall's customers, from the moment they come in to the moment they leave: arrivals, the
 * lines at the entrance and the till, patience, what the waiter does with them, and their reviews.
 */
export class Customers {
  // Server-only bookkeeping, not part of the synced state. Times are in room clock milliseconds.
  /** When each customer in a TIMED_STATUSES status moves on to the next one. */
  private statusEndsAt = new Map<string, number>();
  /** Seated customers' experience so far, by customer id; those never seated don't review. */
  private visits = new Map<string, Visit>();
  private nextCustomerAt = 0;
  private customerCount = 0;

  constructor(private ctx: RoomContext, private kitchen: Kitchen) {}

  register(onShift: OnMessage, on: OnMessage) {
    onShift(Message.PlaceOrder, (client, message: PlaceOrderMessage) => {
      const { state } = this.ctx;
      const customer = attendedCustomer(state, client.sessionId, "ordering");
      if (!customer || !isMenuItem(message?.item) || freeTicketSlot(state) === null) return;
      // Only one of the dishes the dialog offered (which may not be the one the customer showed).
      if (!orderChoices(customer.id, customer.wants, unlockedMenu(state)).includes(message.item)) return;

      this.kitchen.addTicket(customer.tableId, message.item);
      customer.waiterId = "";
      this.setStatus(customer, "waitingFood");
    });

    on(Message.CancelOrder, (client) => {
      const customer = attendedCustomer(this.ctx.state, client.sessionId, "ordering");
      if (customer) this.stopOrdering(customer);
    });
  }

  /** A shift starts: the first customer turns up after a short delay. */
  openDoors() {
    this.nextCustomerAt = this.ctx.clock.currentTime + FIRST_CUSTOMER_DELAY_MS;
  }

  /** Everyone goes home and every table is ready for tomorrow. */
  clearDay() {
    const { state } = this.ctx;
    state.customers.clear();
    state.queue.clear();
    for (const table of state.tables.values()) table.status = "free";
    this.statusEndsAt.clear();
    this.visits.clear();
  }

  // What the waiter does with a customer (see KitchenRoom.interact).

  lead(customer: Customer, waiterId: string) {
    customer.waiterId = waiterId;
    this.setStatus(customer, "following");
  }

  /** Back to waiting at the entrance, keeping the patience they had left. */
  release(customer: Customer) {
    customer.waiterId = "";
    customer.status = "waiting";
  }

  takeOrder(customer: Customer, waiterId: string) {
    customer.waiterId = waiterId;
    this.setStatus(customer, "ordering");
  }

  seat(customer: Customer, table: Table) {
    const seat = seatPosition(table);
    customer.waiterId = "";
    customer.tableId = table.id;
    customer.x = seat.x;
    customer.y = seat.y;
    table.status = "occupied";
    this.visits.set(customer.id, { waits: {}, seconds: 0, beautySeconds: 0 });
    this.setStatus(customer, "readingMenu");
  }

  serve(customer: Customer, dish: MenuItemId) {
    if (dish === customer.wants) {
      customer.bill += MENU[dish].priceCents;
      // The more patience they had left, the bigger the tip.
      customer.tip += tipFor(MENU[dish].priceCents, customer.patience);
      this.setStatus(customer, "eating");
    } else {
      // Not what they asked for: they storm out.
      customer.patience = 0;
      this.sendAway(customer);
    }
  }

  /** They pay their bill and tip at the till, and go. */
  checkout(customer: Customer) {
    const { state } = this.ctx;
    const { report } = state.shift;
    state.money += customer.bill + customer.tip;
    report.salesCents += customer.bill;
    report.tipsCents += customer.tip;
    report.paid++;
    this.sendAway(customer);
  }

  update(dt: number) {
    const { state, clock } = this.ctx;
    const now = clock.currentTime;
    // Customers turn up at random intervals while the restaurant is open, someone can serve them and
    // there's room in line.
    const hasWaiter = [...state.players.values()].some((p) => p.role === "hall");
    if (state.shift.phase === "open" && hasWaiter && entranceLine(state).length < ENTRANCE_LINE_LENGTH && now >= this.nextCustomerAt) {
      this.spawn();
      const { min, max } = CUSTOMER_TIMING.spawnIntervalS;
      this.nextCustomerAt = now + (min + Math.random() * (max - min)) * 1000;
    }

    const line = entranceLine(state);
    const beauty = hallBeauty(state);
    for (const visit of this.visits.values()) {
      visit.seconds += dt;
      visit.beautySeconds += dt * beauty;
    }

    state.customers.forEach((customer) => {
      const patienceS = patienceSeconds(customer.status, customer.wants);
      if (patienceS) {
        // The longer the line they're in, the faster they lose patience.
        const lineLength = customer.status === "waiting" ? line.length
          : customer.status === "queuing" ? state.queue.length
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
        else this.setStatus(customer, timed.next);
        return;
      }

      switch (customer.status) {
        case "following": {
          const leader = state.players.get(customer.waiterId);
          if (leader) {
            this.follow(customer, leader, dt);
          } else {
            // Their waiter left the room: back to the entrance to wait for someone else,
            // keeping the patience they had left.
            this.release(customer);
          }
          break;
        }

        case "waiting":
          this.walkTowards(customer, entranceSpot(Math.max(0, line.indexOf(customer))), dt);
          break;

        case "queuing": {
          const spot = QUEUE_SPOTS[Math.max(0, state.queue.indexOf(customer.id))];
          this.walkTowards(customer, spot, dt);
          break;
        }

        case "ordering": {
          // The dialog was abandoned: the waiter left the room or walked off.
          const waiter = state.players.get(customer.waiterId);
          if (!waiter || !canReachCustomer(state, waiter, customer)) this.stopOrdering(customer);
          break;
        }
      }
    });
  }

  /** Changes status, refilling patience if it drains in the new status and starting its timer if it has one. */
  private setStatus(customer: Customer, status: CustomerStatus) {
    this.recordWait(customer);
    customer.status = status;
    if (patienceSeconds(status, customer.wants)) customer.patience = 1;

    const timed = TIMED_STATUSES[status];
    if (timed) this.statusEndsAt.set(customer.id, this.ctx.clock.currentTime + timed.seconds * 1000);
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

  private spawn() {
    // One random item off the menu, whether or not there's anything in the fridge to make it.
    const menu = unlockedMenu(this.ctx.state);
    if (menu.length === 0) return;

    const customer = new Customer();
    customer.id = `c${++this.customerCount}`;
    // They come in through the door and walk to the back of the line.
    customer.x = WORLD.width + CUSTOMER_SIZE;
    customer.y = entranceSpot(0).y;
    customer.wants = menu[Math.floor(Math.random() * menu.length)];
    this.setStatus(customer, "waiting");
    this.ctx.state.customers.set(customer.id, customer);
  }

  /** Done eating: they get up (leaving the table dirty) and join the queue at the till. */
  private joinQueue(customer: Customer) {
    const { state } = this.ctx;
    const table = state.tables.get(customer.tableId);
    if (table) table.status = "dirty";
    customer.tableId = "";
    state.queue.push(customer.id);
    this.setStatus(customer, "queuing");
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
    const { state, clock } = this.ctx;
    const { report } = state.shift;
    // Patience 0: they left unhappy, without paying.
    const angry = customer.patience === 0;
    if (angry) report.lost++;

    // Their review, if they got as far as a table. Set before the status, so it's there when clients see them leave.
    this.recordWait(customer);
    const visit = this.visits.get(customer.id);
    if (visit) {
      const beauty = visit.seconds > 0 ? visit.beautySeconds / visit.seconds : hallBeauty(state);
      customer.rating = reviewStars(visit.waits, beauty, angry);
      report.ratingSum += customer.rating;
      report.ratingCount++;
      this.visits.delete(customer.id);
    }

    customer.status = "leaving";
    customer.waiterId = "";
    this.statusEndsAt.delete(customer.id);

    // Whoever was behind them in the queue moves up.
    const queued = state.queue.indexOf(customer.id);
    if (queued >= 0) state.queue.splice(queued, 1);

    // A table they were still sitting at needs cleaning.
    const table = state.tables.get(customer.tableId);
    if (table) table.status = "dirty";

    clock.setTimeout(() => state.customers.delete(customer.id), CUSTOMER_TIMING.leavingS * 1000);
  }
}
