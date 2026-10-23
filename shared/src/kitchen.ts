// Kitchen layout, shared so client and server agree on where things are.

import {
  INTERACT_DISTANCE,
  PLAYER_SIZE,
  WALL,
  WORLD,
  boxesOverlap,
  isNearBox,
  overlapsBox,
  type Box,
  type Point,
} from "./world.ts";
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

/**
 * Grid that equipment snaps to: the same 50px squares as the kitchen floor tiles, from the left wall
 * up to the middle wall (only whole squares).
 */
export const KITCHEN_GRID = {
  cell: 50,
  cols: Math.floor((WALL.x - WALL.thickness / 2) / 50),
  rows: Math.floor(WORLD.height / 50),
} as const;

export function cellCenter(col: number, row: number): Point {
  return { x: (col + 0.5) * KITCHEN_GRID.cell, y: (row + 0.5) * KITCHEN_GRID.cell };
}

function cellBox(col: number, row: number): Box {
  return { ...cellCenter(col, row), width: KITCHEN_GRID.cell, height: KITCHEN_GRID.cell };
}

/** A stove fills most of its grid square. */
export const STOVE_SIZE = 46;

export function stoveBox(stove: Point): Box {
  return { x: stove.x, y: stove.y, width: STOVE_SIZE, height: STOVE_SIZE };
}

/** The kitchen opens with one stove, across from the fridge, by the middle wall. */
export const STARTING_STOVES = [{ col: 4, row: 5 }];

/** Things the waiter can buy on the computer and place in the kitchen, one grid square each. */
export const EQUIPMENT = {
  stove: { label: "Fornello", emoji: "🔥", description: "Un altro fuoco per cucinare in parallelo.", priceCents: 1500 },
} as const;
export type EquipmentId = keyof typeof EQUIPMENT;

export function isEquipment(value: unknown): value is EquipmentId {
  return typeof value === "string" && value in EQUIPMENT;
}

/** Opening in the middle wall, reachable from both sides: the cook leaves dishes, the waiter picks them up. */
export const PASS = { x: WALL.x, y: 470, width: 64, height: 56 } as const;
/** How many dishes fit on the pass. */
export const PASS_CAPACITY = 3;

export const STOVE_STATUSES = ["idle", "cooking", "ready"] as const;
export type StoveStatus = (typeof STOVE_STATUSES)[number];

/** Whether a player centered at `p` would overlap any piece of kitchen furniture (the pass included). */
export function overlapsKitchenFurniture(p: Point, stoves: Iterable<Point>) {
  if (overlapsBox(p, FRIDGE) || overlapsBox(p, PASS) || overlapsTicketSlots(p)) return true;
  for (const stove of stoves) {
    if (overlapsBox(p, stoveBox(stove))) return true;
  }
  return false;
}

/**
 * Whether a new piece of equipment can go in this grid square: inside the kitchen, clear of the fixed
 * furniture, of the other stoves and of the cook (so nobody gets stuck inside it).
 */
export function canPlaceEquipment(state: KitchenState, col: number, row: number) {
  if (!Number.isInteger(col) || !Number.isInteger(row)) return false;
  if (col < 0 || row < 0 || col >= KITCHEN_GRID.cols || row >= KITCHEN_GRID.rows) return false;

  const cell = cellBox(col, row);
  const fixed: Box[] = [FRIDGE, PASS, ...TICKET_SLOTS.map((s) => ({ ...s, width: TICKET_SLOT_SIZE, height: TICKET_SLOT_SIZE }))];
  if (fixed.some((box) => boxesOverlap(cell, box))) return false;
  for (const stove of state.stoves.values()) {
    if (boxesOverlap(cell, stoveBox(stove))) return false;
  }
  for (const player of state.players.values()) {
    if (overlapsBox(player, cell)) return false;
  }
  return true;
}

export function isNearFridge(p: Point) {
  return isNearBox(p, FRIDGE);
}

/** The stove a player at `p` would use: the closest one within reach. */
export function nearestStove(state: KitchenState, p: Point) {
  let best = null;
  let bestDistance = Infinity;
  for (const stove of state.stoves.values()) {
    if (!isNearBox(p, stoveBox(stove))) continue;
    const distance = Math.hypot(p.x - stove.x, p.y - stove.y);
    if (distance < bestDistance) {
      best = stove;
      bestDistance = distance;
    }
  }
  return best;
}

export function isNearStove(p: Point, stove: Point) {
  return isNearBox(p, stoveBox(stove));
}

export function isNearPass(p: Point) {
  return isNearBox(p, PASS);
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
