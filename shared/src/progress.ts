// The restaurant's level: every shift that ends with the till in the black is a level passed, and
// each level teaches new recipes.

import { MENU_ITEMS, RECIPES, type MenuItemId } from "./menu.ts";

/** One level per recipe batch: past the last, shifts go on at the top level. */
export const MAX_LEVEL = 10;

/** The level after passing a shift at `level`. */
export function nextLevel(level: number) {
  return Math.min(MAX_LEVEL, level + 1);
}

/** Recipes learnt on reaching exactly this level. */
export function recipesAtLevel(level: number): MenuItemId[] {
  return MENU_ITEMS.filter((id) => RECIPES[id].unlockLevel === level);
}
