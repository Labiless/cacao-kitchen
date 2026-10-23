// Kitchen layout, shared so client and server agree on where things are.

import { PLAYER_SIZE, WALL } from "./world.ts";
import { INTERACT_DISTANCE } from "./hall.ts";

/** Board on the kitchen side of the wall where order tickets pile up. */
export const TICKET_RAIL = { x: WALL.x - WALL.thickness / 2 - 14, y: 110, size: 28 } as const;

interface Point {
  x: number;
  y: number;
}

/** Whether a player centered at `p` would overlap the ticket rail. */
export function overlapsTicketRail(p: Point) {
  const reach = (PLAYER_SIZE + TICKET_RAIL.size) / 2;
  return Math.abs(p.x - TICKET_RAIL.x) < reach && Math.abs(p.y - TICKET_RAIL.y) < reach;
}

/** Whether a player centered at `p` is close enough to read the tickets. */
export function isNearTicketRail(p: Point) {
  const reach = (PLAYER_SIZE + TICKET_RAIL.size) / 2 + INTERACT_DISTANCE;
  return Math.abs(p.x - TICKET_RAIL.x) <= reach && Math.abs(p.y - TICKET_RAIL.y) <= reach;
}
