// The restaurant's level: it grows with experience from happy customers and teaches new recipes.

import { MENU_ITEMS, RECIPES, type MenuItemId } from "./menu.ts";

/**
 * Total experience needed to reach each level: LEVEL_XP[0] is level 1. A customer who pays gives as
 * much experience as the stars in their review, so a good shift (20 customers at 4 stars) is worth
 * about 80.
 */
export const LEVEL_XP = [0, 30, 75, 135, 210, 300, 410, 540, 690, 860] as const;
export const MAX_LEVEL = LEVEL_XP.length;

export function levelForXp(xp: number) {
  let level = 1;
  while (level < MAX_LEVEL && xp >= LEVEL_XP[level]) level++;
  return level;
}

/** Experience at the start of `level` and needed for the next one (null at the top level). */
export function levelRange(level: number): { from: number; to: number | null } {
  return { from: LEVEL_XP[level - 1], to: level < MAX_LEVEL ? LEVEL_XP[level] : null };
}

/** Recipes learnt on reaching exactly this level. */
export function recipesAtLevel(level: number): MenuItemId[] {
  return MENU_ITEMS.filter((id) => RECIPES[id].unlockLevel === level);
}
