// Reviews: every customer who got a table leaves 1 to 5 stars on their way out. A shift's score is
// the average of its reviews, the restaurant's stars the average of all shift scores.

import { DECORATIONS, FULL_DECOR_BEAUTY, type CustomerStatus } from "./hall.ts";
import type { KitchenState } from "./state.ts";

/**
 * Waits that count towards the review, scored by the patience left when each one ended. Waiting at
 * the entrance to be seated doesn't count.
 */
export const REVIEWED_WAITS = ["readyToOrder", "waitingFood", "queuing"] as const satisfies readonly CustomerStatus[];
export type ReviewedWait = (typeof REVIEWED_WAITS)[number];

export const REVIEW_WEIGHTS = {
  /** How long they waited. */
  waiting: 0.75,
  /** How nice the dining hall was while they were in it (see hallBeauty). */
  beauty: 0.25,
} as const;

export const MAX_STARS = 5;

/** How much each part counts towards hallBeauty. */
export const BEAUTY_WEIGHTS = { cleanliness: 0.5, decorations: 0.5 } as const;

/** Share of tables that aren't dirty, 0 to 1. */
export function hallCleanliness(state: KitchenState) {
  const tables = [...state.tables.values()];
  if (!tables.length) return 1;
  return tables.filter((table) => table.status !== "dirty").length / tables.length;
}

/** Beauty points of all decorations in the hall. */
export function decorPoints(state: KitchenState) {
  let points = 0;
  for (const decoration of state.decorations.values()) points += DECORATIONS[decoration.kind].beauty;
  return points;
}

/** Decorations' share of how nice the hall is, 0 to 1: full at FULL_DECOR_BEAUTY points. */
export function hallDecor(state: KitchenState) {
  return Math.min(1, decorPoints(state) / FULL_DECOR_BEAUTY);
}

/** How nice the dining hall looks right now, 0 to 1: how clean it is and how well decorated. */
export function hallBeauty(state: KitchenState) {
  return BEAUTY_WEIGHTS.cleanliness * hallCleanliness(state) + BEAUTY_WEIGHTS.decorations * hallDecor(state);
}


/**
 * Stars from 1 to 5. `waits` holds the patience left at the end of each reviewed wait (1 = no wait at
 * all), `beauty` the average hallBeauty over their visit. Customers who left angry give 1 star.
 */
export function reviewStars(waits: Partial<Record<ReviewedWait, number>>, beauty: number, angry: boolean) {
  if (angry) return 1;
  const scores = Object.values(waits);
  const waiting = scores.length ? scores.reduce((sum, s) => sum + s, 0) / scores.length : 1;
  const score = REVIEW_WEIGHTS.waiting * waiting + REVIEW_WEIGHTS.beauty * beauty;
  return Math.min(MAX_STARS, Math.max(1, 1 + Math.round(score * (MAX_STARS - 1))));
}

/** "★★★★☆" for 4 (or 3.6). */
export function starIcons(stars: number) {
  const full = Math.max(0, Math.min(MAX_STARS, Math.round(stars)));
  return "★".repeat(full) + "☆".repeat(MAX_STARS - full);
}

const ONE_DECIMAL = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** "4,2" */
export function formatStars(stars: number) {
  return ONE_DECIMAL.format(stars);
}
