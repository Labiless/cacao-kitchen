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

/** Doormat where customers come in, wait to be led to a table, and are shown out. */
export const ENTRANCE = { x: WORLD.width - 40, y: WORLD.height - 50, size: 70 } as const;

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
  patienceS: { waiting: 20, readyToOrder: 25, waitingFood: 60, readyToLeave: 30 } as Partial<Record<CustomerStatus, number>>,
  /** Seconds a seated customer spends reading the menu before they're ready to order. */
  readingMenuS: 4,
  /** Seconds a customer spends eating before they want to leave. */
  eatingS: 6,
  /** Seconds between a customer leaving and the next one arriving. */
  spawnDelayS: 4,
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
 * readyToLeave → done eating, waits at the table to be shown out, patience running out
 * escortedOut  → hooked by the waiter, walks behind them towards the exit
 * leaving      → about to disappear; patience 0 means they left angry
 */
export const CUSTOMER_STATUSES = [
  "waiting", "following", "readingMenu", "readyToOrder", "ordering", "waitingFood",
  "eating", "readyToLeave", "escortedOut", "leaving",
] as const;
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

/** Whether a player centered at `p` is close enough to the entrance mat to show a customer out. */
export function isNearEntrance(p: Point) {
  return withinReach(p, PLAYER_SIZE, ENTRANCE, ENTRANCE.size);
}

/** Where a customer sits at a table: on its top edge. */
export function seatPosition(table: Point) {
  return { x: table.x, y: table.y - TABLE_SIZE / 2 };
}
