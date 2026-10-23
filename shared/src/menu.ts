// What customers can order, and the ingredients the kitchen makes it from.
// Money is always in euro cents (integers), so sums never pick up rounding errors.

export const MENU = {
  chocolate: { label: "Cioccolata calda", emoji: "☕", spoken: "una cioccolata calda", priceCents: 350 },
  tea: { label: "Tè caldo", emoji: "🍵", spoken: "un tè caldo", priceCents: 250 },
  pancakes: { label: "Pancake", emoji: "🥞", spoken: "dei pancake", priceCents: 400 },
  egg: { label: "Uovo al tegamino", emoji: "🍳", spoken: "un uovo al tegamino", priceCents: 300 },
} as const;
export type MenuItemId = keyof typeof MENU;
export const MENU_ITEMS = Object.keys(MENU) as MenuItemId[];

export function isMenuItem(value: unknown): value is MenuItemId {
  return MENU_ITEMS.includes(value as MenuItemId);
}

/** Ingredients, and the pack they're bought in over the phone. */
export const INGREDIENTS = {
  cocoa: { label: "Cacao", emoji: "🍫", pack: { units: 3, priceCents: 300 } },
  teaLeaves: { label: "Foglie di tè", emoji: "🌿", pack: { units: 3, priceCents: 150 } },
  batter: { label: "Pastella", emoji: "🥣", pack: { units: 3, priceCents: 300 } },
  eggs: { label: "Uova", emoji: "🥚", pack: { units: 6, priceCents: 300 } },
} as const;
export type IngredientId = keyof typeof INGREDIENTS;
export const INGREDIENT_IDS = Object.keys(INGREDIENTS) as IngredientId[];

export function isIngredient(value: unknown): value is IngredientId {
  return INGREDIENT_IDS.includes(value as IngredientId);
}

interface Recipe {
  ingredient: IngredientId;
  cookMs: number;
  /**
   * Price to unlock the recipe. Recipes without one (simple, single-ingredient ones) are known from
   * the start; the others will have to be bought before customers can order them.
   */
  unlockPriceCents?: number;
}

/** How each menu item is cooked on the stove: which ingredient it takes and how long. */
export const RECIPES: Record<MenuItemId, Recipe> = {
  chocolate: { ingredient: "cocoa", cookMs: 6000 },
  tea: { ingredient: "teaLeaves", cookMs: 4000 },
  pancakes: { ingredient: "batter", cookMs: 8000 },
  egg: { ingredient: "eggs", cookMs: 5000 },
};

/** Recipes the restaurant knows from the start. */
export const STARTING_RECIPES = MENU_ITEMS.filter((id) => RECIPES[id].unlockPriceCents === undefined);

/** What the restaurant opens with: some cash and an empty fridge, so the first thing to do is order ingredients. */
export const STARTING_MONEY_CENTS = 2000;

/** Anything a player can carry: an ingredient or a cooked dish. */
export type HeldItem = IngredientId | MenuItemId;

/** Label and emoji of something a player is carrying. */
export function heldItemInfo(item: HeldItem): { label: string; emoji: string } {
  return isIngredient(item) ? INGREDIENTS[item] : MENU[item];
}

const EURO = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

/** Formats an amount in cents for display, e.g. 350 → "3,50 €". */
export function formatMoney(cents: number) {
  return EURO.format(cents / 100);
}

/** Ways a customer can phrase their order; `{item}` is replaced by the item's spoken name. */
const ORDER_PHRASES = [
  "Vorrei {item}, per favore.",
  "Per me {item}!",
  "Mi porterebbe {item}?",
  "Buongiorno! Prendo {item}.",
];

/** What the customer says when ordering. Picked from their id, so it stays the same if the dialog reopens. */
export function orderPhrase(customerId: string, item: MenuItemId) {
  let hash = 0;
  for (const char of customerId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return ORDER_PHRASES[hash % ORDER_PHRASES.length].replace("{item}", MENU[item].spoken);
}
