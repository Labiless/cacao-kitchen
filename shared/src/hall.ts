// Dining hall layout, customers and geometry, shared so client and server agree on where things are.

import {
  INTERACT_DISTANCE,
  PLAYER_SIZE,
  PLAYER_SPEED,
  WALL,
  WORLD,
  isNearBox,
  overlapsBox,
  type Point,
} from "./world.ts";

export const TABLE_SIZE = 60;

export const TABLE_STATUSES = ["free", "occupied", "dirty"] as const;
export type TableStatus = (typeof TABLE_STATUSES)[number];

export const TABLE_STATUS_INFO: Record<TableStatus, { label: string; color: string }> = {
  free: { label: "Libero", color: "#8a5a3b" },
  occupied: { label: "Occupato", color: "#6b4430" },
  dirty: { label: "Sporco", color: "#7a6a4a" },
};

/** Where tables go when a room is created. */
export const TABLE_LAYOUT = [
  { id: "t1", label: "Tavolo 1", x: 460, y: 170 },
  { id: "t2", label: "Tavolo 2", x: 620, y: 170 },
  { id: "t3", label: "Tavolo 3", x: 460, y: 340 },
  { id: "t4", label: "Tavolo 4", x: 620, y: 340 },
  { id: "t5", label: "Tavolo 5", x: 540, y: 470 },
] as const;

export function tableLabel(tableId: string) {
  return TABLE_LAYOUT.find((table) => table.id === tableId)?.label ?? tableId;
}

/** Doormat where customers come in and wait to be led to a table. */
export const ENTRANCE = { x: WORLD.width - 40, y: WORLD.height - 50, size: 70 } as const;

/** Most customers waiting in line at the entrance; nobody else comes in while it's full. */
export const ENTRANCE_LINE_LENGTH = 6;

/** Where the i-th customer in line at the entrance stands: on the mat, then along the bottom wall. */
export function entranceSpot(index: number) {
  return { x: ENTRANCE.x - index * 40, y: ENTRANCE.y };
}

/** Till by the exit, across the hall from the entrance: customers queue here to pay before leaving. */
export const REGISTER = { x: WORLD.width - 50, y: 30, width: 80, height: 40 } as const;

/** On the hall side of the middle wall: the waiter buys equipment here. */
export const COMPUTER = { x: WALL.x + WALL.thickness / 2 + 18, y: 240, width: 36, height: 30 } as const;

/** Below the computer: the waiter buys new recipes here. */
export const RECIPE_BOOK = { x: WALL.x + WALL.thickness / 2 + 16, y: 355, width: 32, height: 30 } as const;

/** Where customers queuing at the till stand, front first, in a line down from it: one spot per table. */
export const QUEUE_SPOTS = Array.from({ length: TABLE_LAYOUT.length }, (_, i) => ({
  x: REGISTER.x,
  y: REGISTER.y + REGISTER.height / 2 + 8 + 15 + i * 40,
}));

export const CUSTOMER_SIZE = 30;
export const CUSTOMER_COLOR = "#b5577a";
/** Same as the waiter, so a led customer keeps up. */
export const CUSTOMER_SPEED = PLAYER_SPEED;
/** Gap (px) a led customer keeps between their edge and the waiter's. */
export const FOLLOW_GAP = 6;

export const CUSTOMER_TIMING = {
  /**
   * Seconds of patience in each status where the customer is waiting on the waiter.
   * Patience refills on entering each of these and is paused in every other status.
   */
  patienceS: { waiting: 20, readyToOrder: 25, waitingFood: 60, queuing: 30 } as Partial<Record<CustomerStatus, number>>,
  /** Seconds a seated customer spends reading the menu before they're ready to order. */
  readingMenuS: 4,
  /** Seconds a customer spends eating before they get up and go pay. */
  eatingS: 6,
  /** Seconds between one customer arriving and the next: random in this range. */
  spawnIntervalS: { min: 4, max: 12 },
  /**
   * In a line (at the entrance or at the till), patience drains this much faster for every other
   * customer in the same line: 0.2 means 1.2× with one other, 1.4× with two, and so on.
   */
  crowdImpatience: 0.2,
  /** Seconds a leaving customer stays visible, so players see how it went. */
  leavingS: 1.2,
} as const;

/**
 * waiting      → at the entrance, patience running out
 * following    → hooked by the waiter, walks behind them
 * readingMenu  → just sat down at a table
 * readyToOrder → wants to order, patience running out
 * ordering     → the waiter is taking their order
 * waitingFood  → order sent, patience running out
 * eating       → food served
 * queuing      → done eating: walks to the till and queues to pay, patience running out
 * leaving      → about to disappear; patience 0 means they left angry (and without paying)
 */
export const CUSTOMER_STATUSES = [
  "waiting", "following", "readingMenu", "readyToOrder", "ordering", "waitingFood", "eating", "queuing", "leaving",
] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

/** Whether two squares (center + side) overlap. */
function overlaps(a: Point, aSize: number, b: Point, bSize: number) {
  const reach = (aSize + bSize) / 2;
  return Math.abs(a.x - b.x) < reach && Math.abs(a.y - b.y) < reach;
}

/** Whether two squares are within INTERACT_DISTANCE of each other, edge to edge. */
function withinReach(a: Point, aSize: number, b: Point, bSize: number) {
  const reach = (aSize + bSize) / 2 + INTERACT_DISTANCE;
  return Math.abs(a.x - b.x) <= reach && Math.abs(a.y - b.y) <= reach;
}

/** Whether a player centered at `p` would overlap the table centered at `table`. */
export function overlapsTable(p: Point, table: Point) {
  return overlaps(p, PLAYER_SIZE, table, TABLE_SIZE);
}

/** Whether a player centered at `p` is close enough to interact with the table at `table`. */
export function isNearTable(p: Point, table: Point) {
  return withinReach(p, PLAYER_SIZE, table, TABLE_SIZE);
}

/** Whether a player centered at `p` is close enough to interact with the customer at `customer`. */
export function isNearCustomer(p: Point, customer: Point) {
  return withinReach(p, PLAYER_SIZE, customer, CUSTOMER_SIZE);
}

/** Whether a player centered at `p` would overlap any hall furniture other than tables (till, computer, book). */
export function overlapsHallFurniture(p: Point) {
  return overlapsBox(p, REGISTER) || overlapsBox(p, COMPUTER) || overlapsBox(p, RECIPE_BOOK);
}

/** Whether a player centered at `p` is close enough to work the till. */
export function isNearRegister(p: Point) {
  return isNearBox(p, REGISTER);
}

export function isNearComputer(p: Point) {
  return isNearBox(p, COMPUTER);
}

export function isNearRecipeBook(p: Point) {
  return isNearBox(p, RECIPE_BOOK);
}

/** Whether a customer has reached their queue spot (they walk there on their own). */
export function isAtQueueSpot(customer: Point, index: number) {
  const spot = QUEUE_SPOTS[Math.min(index, QUEUE_SPOTS.length - 1)];
  return Math.hypot(customer.x - spot.x, customer.y - spot.y) < 2;
}

/** Where a customer sits at a table: on its top edge. */
export function seatPosition(table: Point) {
  return { x: table.x, y: table.y - TABLE_SIZE / 2 };
}
