import { Message, SHIFT, STARTING_MONEY_CENTS, ShiftReport, nextLevel } from "@cacao/shared";
import type { Customers } from "./Customers.ts";
import type { Kitchen } from "./Kitchen.ts";
import type { OnMessage, RoomContext } from "./context.ts";

/**
 * The shift cycle: a break until everyone is ready, the restaurant open on the clock, closing time
 * until the hall is empty, then the report (or game over); and starting the whole game over.
 */
export class Shifts {
  /** When the current shift stops letting customers in, in room clock milliseconds. */
  private closesAt = 0;

  /** `clearDay` empties everything that doesn't carry over from one shift to the next (see KitchenRoom). */
  constructor(
    private ctx: RoomContext,
    private customers: Customers,
    private kitchen: Kitchen,
    private clearDay: () => void,
  ) {}

  register(on: OnMessage) {
    on(Message.Ready, (client) => {
      const player = this.ctx.state.players.get(client.sessionId);
      if (!player || this.ctx.state.shift.phase !== "break") return;
      player.ready = true;
      this.startIfReady();
    });

    // Anyone can start over, at any time (the client asks for confirmation first).
    on(Message.Restart, () => this.restart());
  }

  /** During a break, starts the next shift once every player in the room is ready. */
  startIfReady() {
    const players = [...this.ctx.state.players.values()];
    if (this.ctx.state.shift.phase === "break" && players.length && players.every((p) => p.ready)) this.start();
  }

  /** Runs the shift clock: open → closing when time's up, closing → break once the restaurant is empty. */
  update() {
    const { state, clock } = this.ctx;
    const { shift } = state;
    if (shift.phase === "open") {
      const left = Math.max(0, Math.ceil((this.closesAt - clock.currentTime) / 1000));
      if (left !== shift.secondsLeft) shift.secondsLeft = left;
      if (left === 0) shift.phase = "closing";
    } else if (shift.phase === "closing") {
      // Only the waiter can clean tables: without one in the room, the shift ends as soon as it's empty.
      const hasWaiter = [...state.players.values()].some((p) => p.role === "hall");
      const dirty = hasWaiter && [...state.tables.values()].some((table) => table.status !== "free");
      if (state.customers.size === 0 && !dirty) this.end();
    }
  }

  /**
   * A new day: money, appliances and the level carry over, everything else starts fresh. Yesterday's
   * food is gone (stock, deliveries, dishes in progress), so ingredients have to be ordered again.
   */
  private start() {
    const { shift } = this.ctx.state;
    shift.day++;
    shift.phase = "open";
    shift.secondsLeft = SHIFT.durationS;
    shift.report = new ShiftReport();
    this.closesAt = this.ctx.clock.currentTime + SHIFT.durationS * 1000;
    this.customers.openDoors();
    this.clearDay();
  }

  /** Everyone has left and the hall is clean: wages and bills are paid and the report goes up. */
  private end() {
    const { state } = this.ctx;
    const { shift } = state;
    const { report } = shift;
    report.staffCents = SHIFT.staffCents;
    // The fridge isn't in the appliances map but uses electricity too.
    report.billsCents = (state.appliances.size + 1) * SHIFT.billPerApplianceCents;
    state.money -= report.staffCents + report.billsCents;
    // In the red: the restaurant closes for good.
    const bankrupt = state.money < 0;

    // The shift's score joins the restaurant's average; a shift without reviews doesn't count.
    if (report.ratingCount) {
      const score = report.ratingSum / report.ratingCount;
      state.stars = (state.stars * state.ratedShifts + score) / (state.ratedShifts + 1);
      state.ratedShifts++;
    }
    // A shift passed is a level passed, and new recipes on the menu.
    if (!bankrupt && nextLevel(state.level) > state.level) {
      state.level = nextLevel(state.level);
      report.newLevel = state.level;
    }
    shift.phase = bankrupt ? "gameOver" : "break";
    shift.secondsLeft = 0;
  }

  /** A brand new restaurant, as when the room was created; the players stay. */
  private restart() {
    const { state } = this.ctx;
    state.money = STARTING_MONEY_CENTS;
    state.level = 1;
    state.stars = 0;
    state.ratedShifts = 0;
    state.decorations.clear();
    this.kitchen.resetAppliances();
    state.shift.day = 0;
    state.shift.phase = "break";
    state.shift.secondsLeft = 0;
    state.shift.report = new ShiftReport();
    this.clearDay();
  }
}
