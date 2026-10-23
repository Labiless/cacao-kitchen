// Kitchen layout, shared so client and server agree on where things are.

import { PLAYER_SIZE, WALL } from "./world.ts";
import { INTERACT_DISTANCE } from "./hall.ts";
import type { KitchenState } from "./state.ts";

/** How many tickets fit on the kitchen wall. When it's full, the waiter can't take new orders. */
export const MAX_TICKETS = 4;
export const TICKET_SLOT_SIZE = 28;
const TICKET_SLOT_SPACING = 40;

/** Spots on the top kitchen wall where tickets hang side by side, the last one next to the middle wall. */
export const TICKET_SLOTS = Array.from({ length: MAX_TICKETS }, (_, i) => ({
  x: WALL.x - WALL.thickness / 2 - 30 - (MAX_TICKETS - 1 - i) * TICKET_SLOT_SPACING,
  y: TICKET_SLOT_SIZE / 2 + 2,
}));

/** Against the left kitchen wall; the cook takes ingredients from it. */
export const FRIDGE = { x: 30, y: 260, width: 52, height: 96 } as const;

interface Point {
  x: number;
  y: number;
}

interface Box extends Point {
  width: number;
  height: number;
}

/** Whether a player centered at `p` would overlap the box. */
function overlapsBox(p: Point, box: Box) {
  return Math.abs(p.x - box.x) < (PLAYER_SIZE + box.width) / 2
    && Math.abs(p.y - box.y) < (PLAYER_SIZE + box.height) / 2;
}

/** Whether a player centered at `p` is within INTERACT_DISTANCE of the box, edge to edge. */
function isNearBox(p: Point, box: Box) {
  return Math.abs(p.x - box.x) <= (PLAYER_SIZE + box.width) / 2 + INTERACT_DISTANCE
    && Math.abs(p.y - box.y) <= (PLAYER_SIZE + box.height) / 2 + INTERACT_DISTANCE;
}

/** Whether a player centered at `p` would overlap any piece of kitchen furniture. */
export function overlapsKitchenFurniture(p: Point) {
  return overlapsBox(p, FRIDGE) || overlapsTicketSlots(p);
}

export function isNearFridge(p: Point) {
  return isNearBox(p, FRIDGE);
}

/** Whether a player centered at `p` would overlap any ticket slot. */
export function overlapsTicketSlots(p: Point) {
  const reach = (PLAYER_SIZE + TICKET_SLOT_SIZE) / 2;
  return TICKET_SLOTS.some((slot) => Math.abs(p.x - slot.x) < reach && Math.abs(p.y - slot.y) < reach);
}

/**
 * Whether a player centered at `p` can read the ticket in the given slot: they must stand right in
 * front of it, so neighbouring tickets are read one at a time.
 */
export function isNearTicketSlot(p: Point, slot: number) {
  const { x, y } = TICKET_SLOTS[slot];
  const reachY = (PLAYER_SIZE + TICKET_SLOT_SIZE) / 2 + INTERACT_DISTANCE;
  return Math.abs(p.x - x) <= TICKET_SLOT_SPACING / 2 && Math.abs(p.y - y) <= reachY;
}

/** The first empty slot on the wall, or null when it's full. */
export function freeTicketSlot(state: KitchenState) {
  const taken = new Set([...state.tickets.values()].map((ticket) => ticket.slot));
  for (let slot = 0; slot < MAX_TICKETS; slot++) {
    if (!taken.has(slot)) return slot;
  }
  return null;
}

/** The ticket a player at `p` would read: the closest one within reach. */
export function nearestTicket(state: KitchenState, p: Point) {
  let best = null;
  let bestDistance = Infinity;
  for (const ticket of state.tickets.values()) {
    if (!isNearTicketSlot(p, ticket.slot)) continue;
    const slot = TICKET_SLOTS[ticket.slot];
    const distance = Math.hypot(p.x - slot.x, p.y - slot.y);
    if (distance < bestDistance) {
      best = ticket;
      bestDistance = distance;
    }
  }
  return best;
}
