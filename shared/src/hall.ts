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
  { id: "t1", label: "Tavolo 1", x: 640, y: 180 },
] as const;

export function tableLabel(tableId: string) {
  return TABLE_LAYOUT.find((table) => table.id === tableId)?.label ?? tableId;
}

/** Doormat where customers come in and wait to be led to a table. */
export const ENTRANCE = { x: WORLD.width - 40, y: WORLD.height - 50, size: 70 } as const;

/** Where the i-th customer waiting at the entrance stands: on the mat, then in a line up from it. */
export function entranceSpot(index: number) {
  return { x: ENTRANCE.x, y: ENTRANCE.y - index * 40 };
}

/** Till by the exit, across the hall from the entrance: customers queue here to pay before leaving. */
export const REGISTER = { x: WORLD.width - 50, y: 30, width: 80, height: 40 } as const;

/** On the hall side of the middle wall: the waiter orders ingredients here. */
export const PHONE = { x: WALL.x + WALL.thickness / 2 + 14, y: 110, width: 28, height: 28 } as const;

/** Most customers in the restaurant at once; also the length of the queue at the till. */
export const MAX_CUSTOMERS = 4;

/** Where queuing customers stand, front of the queue first: in a line down from the till. */
export const QUEUE_SPOTS = Array.from({ length: MAX_CUSTOMERS }, (_, i) => ({
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
  /** Seconds between one customer arriving and the next, as long as nobody is waiting at the entrance. */
  spawnIntervalS: 10,
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

/** Whether a player centered at `p` would overlap any hall furniture other than tables (the till, the phone). */
export function overlapsHallFurniture(p: Point) {
  return overlapsBox(p, REGISTER) || overlapsBox(p, PHONE);
}

/** Whether a player centered at `p` is close enough to work the till. */
export function isNearRegister(p: Point) {
  return isNearBox(p, REGISTER);
}

export function isNearPhone(p: Point) {
  return isNearBox(p, PHONE);
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
