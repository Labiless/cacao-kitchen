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
import type { Appliance, KitchenState } from "./state.ts";

/** How many tickets fit on the kitchen wall. When it's full, the waiter can't take new orders. */
export const MAX_TICKETS = 3;
export const TICKET_SLOT_SIZE = 28;
const TICKET_SLOT_SPACING = 40;

/** Spots on the top kitchen wall where tickets hang side by side, the last one next to the middle wall. */
export const TICKET_SLOTS = Array.from({ length: MAX_TICKETS }, (_, i) => ({
  x: WALL.x - WALL.thickness / 2 - 30 - (MAX_TICKETS - 1 - i) * TICKET_SLOT_SPACING,
  y: TICKET_SLOT_SIZE / 2 + 2,
}));

/** Against the left kitchen wall; the cook takes ingredients from it. */
export const FRIDGE = { x: 30, y: 260, width: 52, height: 96 } as const;

/** On the left kitchen wall, above the fridge: the cook orders ingredients here. */
export const PHONE = { x: 14, y: 100, width: 28, height: 28 } as const;

/** Loading bay in the bottom-left corner of the kitchen, where the supplier's truck stops. */
export const DELIVERY_BAY = { x: 50, y: 555, width: 90, height: 80 } as const;

export const DELIVERY = {
  /** Seconds between ordering on the phone and the truck arriving: random in this range. */
  arrivalS: { min: 5, max: 10 },
  /** Most packs of one ingredient in a single order. */
  maxPacks: 9,
} as const;

/**
 * none     → nothing ordered: the phone takes orders
 * onTheWay → ordered and paid, the truck is coming
 * arrived  → the truck waits at the bay for the cook to unload it
 */
export const DELIVERY_STATUSES = ["none", "onTheWay", "arrived"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

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

/** An appliance fills most of its grid square. */
export const APPLIANCE_SIZE = 46;

export function applianceBox(appliance: Point): Box {
  return { x: appliance.x, y: appliance.y, width: APPLIANCE_SIZE, height: APPLIANCE_SIZE };
}

export const EQUIPMENT_IDS = [
  "stove", "oven", "fryer", "workbench", "blender", "coffeeMachine", "freezer",
] as const;
export type EquipmentId = (typeof EQUIPMENT_IDS)[number];
/** Appliances recipe steps happen on: everything but the freezer, which only stores ingredients. */
export type ApplianceKind = Exclude<EquipmentId, "freezer">;

interface EquipmentInfo {
  label: string;
  emoji: string;
  description: string;
  priceCents: number;
  /** Fill color of its square in the kitchen. */
  color: string;
  /** Only one per kitchen. Everything else can be bought again, to cook more dishes at once. */
  unique?: boolean;
}

/** Appliances the waiter can buy on the computer and place in the kitchen, one grid square each. */
export const EQUIPMENT: Record<EquipmentId, EquipmentInfo> = {
  stove: { label: "Fornello", emoji: "🔥", description: "Per cuocere in pentola e in padella.", priceCents: 1500, color: "#4a4a4f" },
  oven: { label: "Forno", emoji: "♨️", description: "Per cuocere al forno.", priceCents: 2500, color: "#8c4a2f" },
  fryer: { label: "Friggitrice", emoji: "🛢️", description: "Per friggere.", priceCents: 2000, color: "#b08a2e" },
  workbench: { label: "Piano di lavoro", emoji: "🔪", description: "Per tagliare, spalmare e comporre.", priceCents: 800, color: "#a07850" },
  blender: { label: "Frullatore", emoji: "🌀", description: "Per tritare e impastare.", priceCents: 1500, color: "#6e8f6a" },
  coffeeMachine: { label: "Macchina del caffè", emoji: "🫖", description: "Per il caffè.", priceCents: 1800, color: "#3d2b22" },
  freezer: {
    label: "Congelatore",
    emoji: "🧊",
    description: "Conserva i surgelati. Se ne può avere uno solo.",
    priceCents: 2500,
    color: "#bfdde8",
    unique: true,
  },
};

export function isEquipment(value: unknown): value is EquipmentId {
  return EQUIPMENT_IDS.includes(value as EquipmentId);
}

/** The kitchen opens with the fridge and one stove, across from the fridge, by the middle wall. */
export const STARTING_EQUIPMENT: Array<{ kind: EquipmentId; col: number; row: number }> = [{ kind: "stove", col: 4, row: 5 }];

/**
 * Appliance levels: every one bought starts at level 1, and the cook can upgrade it on the spot to
 * make every step on it quicker. `speed` scales step times; `priceFactor` is the upgrade's price
 * as a multiple of the appliance's.
 */
export const APPLIANCE_TIERS = [
  { speed: 1, priceFactor: 0 },
  { speed: 0.75, priceFactor: 1 },
  { speed: 0.55, priceFactor: 2 },
] as const;
export const MAX_APPLIANCE_TIER = APPLIANCE_TIERS.length;

/** Whether this kind of appliance has levels: everything recipe steps happen on (not the freezer). */
export function isUpgradable(kind: EquipmentId): kind is ApplianceKind {
  return kind !== "freezer";
}

/** Price of taking an appliance from `tier` to the next level, or null if it can't go higher. */
export function upgradePrice(kind: EquipmentId, tier: number) {
  if (!isUpgradable(kind) || tier >= MAX_APPLIANCE_TIER) return null;
  return EQUIPMENT[kind].priceCents * APPLIANCE_TIERS[tier].priceFactor;
}

/** How long a step lasts on an appliance at this level. */
export function stepMs(baseMs: number, tier: number) {
  return Math.round(baseMs * APPLIANCE_TIERS[Math.max(0, Math.min(MAX_APPLIANCE_TIER, tier) - 1)].speed);
}

/** Whether the kitchen has at least one appliance of this kind. */
export function hasEquipment(state: KitchenState, kind: EquipmentId) {
  for (const appliance of state.appliances.values()) {
    if (appliance.kind === kind) return true;
  }
  return false;
}

/** Whether the waiter can buy another one of these (unique appliances only once). */
export function canBuyEquipment(state: KitchenState, kind: EquipmentId) {
  return !EQUIPMENT[kind].unique || !hasEquipment(state, kind);
}

/** Opening in the middle wall, reachable from both sides: the cook leaves dishes, the waiter picks them up. */
export const PASS = { x: WALL.x, y: 470, width: 64, height: 56 } as const;
/** How many dishes fit on the pass. */
export const PASS_CAPACITY = 3;

/**
 * Seconds a finished dish stays good, from the moment it's ready until the waiter picks it up from the
 * pass (the clock stops in the waiter's hands). When it runs out the dish is thrown away.
 */
export const DISH_FRESH_S = 25;

/**
 * idle    → empty, ready for a step
 * working → a step is in progress
 * ready   → the step is done: what's on it (a finished dish or a half-made one) waits to be picked up
 */
export const APPLIANCE_STATUSES = ["idle", "working", "ready"] as const;
export type ApplianceStatus = (typeof APPLIANCE_STATUSES)[number];

/** Whether a player centered at `p` would overlap any piece of kitchen furniture (the pass included). */
export function overlapsKitchenFurniture(p: Point, appliances: Iterable<Point>) {
  if (overlapsBox(p, FRIDGE) || overlapsBox(p, PHONE) || overlapsBox(p, PASS) || overlapsTicketSlots(p)) return true;
  for (const appliance of appliances) {
    if (overlapsBox(p, applianceBox(appliance))) return true;
  }
  return false;
}

/**
 * Whether a new piece of equipment can go in this grid square: inside the kitchen, clear of the fixed
 * furniture, of the other appliances and of the cook (so nobody gets stuck inside it).
 */
export function canPlaceEquipment(state: KitchenState, col: number, row: number) {
  if (!Number.isInteger(col) || !Number.isInteger(row)) return false;
  if (col < 0 || row < 0 || col >= KITCHEN_GRID.cols || row >= KITCHEN_GRID.rows) return false;

  const cell = cellBox(col, row);
  const fixed: Box[] = [FRIDGE, PHONE, PASS, DELIVERY_BAY, ...TICKET_SLOTS.map((s) => ({ ...s, width: TICKET_SLOT_SIZE, height: TICKET_SLOT_SIZE }))];
  if (fixed.some((box) => boxesOverlap(cell, box))) return false;
  for (const appliance of state.appliances.values()) {
    if (boxesOverlap(cell, applianceBox(appliance))) return false;
  }
  for (const player of state.players.values()) {
    if (overlapsBox(player, cell)) return false;
  }
  return true;
}

export function isNearFridge(p: Point) {
  return isNearBox(p, FRIDGE);
}

export function isNearPhone(p: Point) {
  return isNearBox(p, PHONE);
}

/** The bay is a patch of floor, so "near" includes standing on it. */
export function isNearDeliveryBay(p: Point) {
  return isNearBox(p, DELIVERY_BAY);
}

/** The appliance a player at `p` would use: the closest one within reach. */
export function nearestAppliance(state: KitchenState, p: Point): Appliance | null {
  let best = null;
  let bestDistance = Infinity;
  for (const appliance of state.appliances.values()) {
    if (!isNearBox(p, applianceBox(appliance))) continue;
    const distance = Math.hypot(p.x - appliance.x, p.y - appliance.y);
    if (distance < bestDistance) {
      best = appliance;
      bestDistance = distance;
    }
  }
  return best;
}

export function isNearAppliance(p: Point, appliance: Point) {
  return isNearBox(p, applianceBox(appliance));
}

/** Whether a player at `p` can reach the fridge, or a freezer, to take or put back what's kept there. */
export function isNearStorage(state: KitchenState, p: Point, storage: "fridge" | "freezer") {
  if (storage === "fridge") return isNearFridge(p);
  for (const appliance of state.appliances.values()) {
    if (appliance.kind === "freezer" && isNearAppliance(p, appliance)) return true;
  }
  return false;
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
