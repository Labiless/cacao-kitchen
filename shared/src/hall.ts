// Dining hall layout and geometry, shared so client and server agree on where things are.

import { PLAYER_SIZE } from "./index.ts";

export const TABLE_SIZE = 60;
/** Max gap (px) between a player's edge and a table's edge to interact with it. */
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

interface Point {
  x: number;
  y: number;
}

/** Whether a player centered at `p` would overlap the table centered at `table`. */
export function overlapsTable(p: Point, table: Point) {
  const reach = (PLAYER_SIZE + TABLE_SIZE) / 2;
  return Math.abs(p.x - table.x) < reach && Math.abs(p.y - table.y) < reach;
}

/** Whether a player centered at `p` is close enough to interact with the table at `table`. */
export function isNearTable(p: Point, table: Point) {
  const reach = (PLAYER_SIZE + TABLE_SIZE) / 2 + INTERACT_DISTANCE;
  return Math.abs(p.x - table.x) <= reach && Math.abs(p.y - table.y) <= reach;
}
