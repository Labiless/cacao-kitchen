// What customers can order, and the ingredients the kitchen makes it from.

export const MENU = {
  chocolate: { label: "Cioccolata calda", emoji: "☕", spoken: "una cioccolata calda" },
} as const;
export type MenuItemId = keyof typeof MENU;
export const MENU_ITEMS = Object.keys(MENU) as MenuItemId[];

export function isMenuItem(value: unknown): value is MenuItemId {
  return MENU_ITEMS.includes(value as MenuItemId);
}

export const INGREDIENTS = {
  cocoa: { label: "Cacao", emoji: "🍫" },
} as const;
export type IngredientId = keyof typeof INGREDIENTS;
export const INGREDIENT_IDS = Object.keys(INGREDIENTS) as IngredientId[];

export function isIngredient(value: unknown): value is IngredientId {
  return INGREDIENT_IDS.includes(value as IngredientId);
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
