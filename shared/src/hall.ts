// Dining hall layout, customers and geometry, shared so client and server agree on where things are.

import {
  INTERACT_DISTANCE,
  PLAYER_SIZE,
  WAITER_SPEED,
  WALL,
  WORLD,
  isNearBox,
  overlapsBox,
  type Point,
} from "./world.ts";
import type { KitchenState } from "./state.ts";
import { RECIPES, type MenuItemId } from "./menu.ts";

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
export const CUSTOMER_SPEED = WAITER_SPEED;
/** Gap (px) a led customer keeps between their edge and the waiter's. */
export const FOLLOW_GAP = 6;

export const CUSTOMER_TIMING = {
  /**
   * Seconds of patience in each status where the customer is waiting on the waiter.
   * Patience refills on entering each of these and is paused in every other status.
   */
  patienceS: { waiting: 20, readyToOrder: 25, waitingFood: 40, queuing: 60 } as Partial<Record<CustomerStatus, number>>,
  /**
   * Extra seconds of patience while waiting for food, for every cooking step the dish takes: a cola
   * is expected at once, a five-step dish is worth waiting for.
   */
  foodPatiencePerStepS: 20,
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

/** Things the waiter can buy on the computer to make the dining hall nicer. They stay from one shift to the next. */
export const DECORATIONS = {
  cactus: { label: "Cactus", emoji: "🌵", description: "Piccolo e senza pretese.", priceCents: 400, beauty: 1 },
  candles: { label: "Candele", emoji: "🕯️", description: "Un po' di atmosfera.", priceCents: 600, beauty: 1 },
  flowers: { label: "Vaso di fiori", emoji: "💐", description: "Freschi e colorati.", priceCents: 800, beauty: 1 },
  sunflowers: { label: "Girasoli", emoji: "🌻", description: "Un po' di sole in sala.", priceCents: 1000, beauty: 2 },
  lantern: { label: "Lanterna", emoji: "🏮", description: "Luce calda.", priceCents: 1000, beauty: 2 },
  plant: { label: "Pianta", emoji: "🪴", description: "Un angolo verde.", priceCents: 1200, beauty: 2 },
  mirror: { label: "Specchio", emoji: "🪞", description: "Fa sembrare la sala più grande.", priceCents: 1500, beauty: 2 },
  clock: { label: "Orologio a pendolo", emoji: "🕰️", description: "Elegante, e scandisce il tempo.", priceCents: 1800, beauty: 3 },
  painting: { label: "Quadro", emoji: "🖼️", description: "Un po' d'arte alle pareti.", priceCents: 2000, beauty: 3 },
  bookshelf: { label: "Libreria", emoji: "📚", description: "Qualcosa da sfogliare mentre si aspetta.", priceCents: 2500, beauty: 3 },
  sofa: { label: "Divanetto", emoji: "🛋️", description: "Un angolo comodo.", priceCents: 3500, beauty: 4 },
  aquarium: { label: "Acquario", emoji: "🐠", description: "Rilassa chi aspetta.", priceCents: 4000, beauty: 5 },
  statue: { label: "Statua", emoji: "🗿", description: "Fa parlare di sé.", priceCents: 5000, beauty: 6 },
  fountain: { label: "Fontana", emoji: "⛲", description: "Il rumore dell'acqua.", priceCents: 6000, beauty: 7 },
  piano: { label: "Pianoforte", emoji: "🎹", description: "Il tocco di classe.", priceCents: 8000, beauty: 9 },
} as const;
export type DecorationId = keyof typeof DECORATIONS;
export const DECORATION_IDS = Object.keys(DECORATIONS) as DecorationId[];

export function isDecoration(value: unknown): value is DecorationId {
  return DECORATION_IDS.includes(value as DecorationId);
}

/** Beauty points at which decorations count in full towards how nice the hall is (see hallBeauty). */
export const FULL_DECOR_BEAUTY = 30;

export const DECORATION_SIZE = 32;

/**
 * Spots in the hall where a decoration can go, one each: along the walls and in the open floor between
 * the tables, clear of the tables, the lines, the till, the computer, the recipe book and the pass.
 * Decorations don't block anyone, so they can go where people walk.
 */
export const DECORATION_SLOTS: readonly Point[] = [
  { x: 380, y: 24 },
  { x: 470, y: 24 },
  { x: 660, y: 24 },
  { x: WALL.x + WALL.thickness / 2 + 20, y: 70 },
  { x: WALL.x + WALL.thickness / 2 + 20, y: 150 },
  { x: WALL.x + WALL.thickness / 2 + 20, y: 565 },
  { x: WORLD.width - 22, y: 300 },
  { x: WORLD.width - 22, y: 420 },
  { x: 420, y: 570 },
  { x: 540, y: 90 },
  { x: 540, y: 255 },
  { x: 700, y: 255 },
  { x: 400, y: 455 },
  { x: 680, y: 460 },
];

/** Whether a decoration can go in this slot: nothing there yet. Decorations don't get in anyone's way. */
export function canPlaceDecoration(state: KitchenState, slot: number) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= DECORATION_SLOTS.length) return false;
  for (const decoration of state.decorations.values()) {
    if (decoration.slot === slot) return false;
  }
  return true;
}

/**
 * Seconds of patience a customer has in a status where it drains, or 0 where it doesn't. Waiting for
 * food depends on the dish: the more steps it takes, the longer they're willing to wait.
 */
export function patienceSeconds(status: CustomerStatus, wants: MenuItemId) {
  const base = CUSTOMER_TIMING.patienceS[status] ?? 0;
  if (status !== "waitingFood") return base;
  return base + CUSTOMER_TIMING.foodPatiencePerStepS * RECIPES[wants].steps.length;
}
