// Dining hall layout, customers and geometry, shared so client and server agree on where things are.

import { PLAYER_SIZE, PLAYER_SPEED, WORLD } from "./world.ts";

export const TABLE_SIZE = 60;
/** Max gap (px) between a player's edge and a target's edge to interact with it. */
export const INTERACT_DISTANCE = 24;

export const TABLE_STATUSES = ["free", "occupied", "dirty"] as const;
export type TableStatus = (typeof TABLE_STATUSES)[number];

export const TABLE_STATUS_INFO: Record<TableStatus, { label: string; color: string }> = {
  free: { label: "Libero", color: "#8a5a3b" },
  occupied: { label: "Occupato", color: "#6b4430" },
  dirty: { label: "Sporco", color: "#7a6a4a" },
};

/** Where tables go when a room is created. */
export const TABLE_LAYOUT = [
  { id: "t1", x: 640, y: 180 },
] as const;

/** Where customers appear and wait to be led to a table. */
export const ENTRANCE = { x: WORLD.width - 40, y: WORLD.height - 50 } as const;

export const CUSTOMER_SIZE = 30;
export const CUSTOMER_COLOR = "#b5577a";
/** Same as the waiter, so a led customer keeps up. */
export const CUSTOMER_SPEED = PLAYER_SPEED;
/** Gap (px) a led customer keeps between their edge and the waiter's. */
export const FOLLOW_GAP = 6;

export const CUSTOMER_TIMING = {
  /** Seconds a customer waits at the entrance before leaving angry. */
  patienceS: 20,
  /** Temporary, until ordering exists: seconds a seated customer stays before leaving. */
  seatedS: 8,
  /** Seconds between a customer leaving and the next one arriving. */
  spawnDelayS: 4,
  /** Seconds a leaving customer stays visible, so players see how it went. */
  leavingS: 1.2,
} as const;

/**
 * waiting   → at the entrance, patience running out
 * following → hooked by the waiter, walks behind them (patience paused)
 * seated    → at a table
 * leaving   → about to disappear; patience 0 means they left angry
 */
export const CUSTOMER_STATUSES = ["waiting", "following", "seated", "leaving"] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

interface Point {
  x: number;
  y: number;
}

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

/** Where a customer sits at a table: on its top edge. */
export function seatPosition(table: Point) {
  return { x: table.x, y: table.y - TABLE_SIZE / 2 };
}
