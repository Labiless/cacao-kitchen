// What customers can order, and the ingredients the kitchen makes it from.
// Money is always in euro cents (integers), so sums never pick up rounding errors.

export const MENU = {
  chocolate: { label: "Cioccolata calda", emoji: "☕", priceCents: 500 },
  tea: { label: "Tè caldo", emoji: "🍵", priceCents: 400 },
  pancakes: { label: "Pancake", emoji: "🥞", priceCents: 600 },
  egg: { label: "Uovo al tegamino", emoji: "🍳", priceCents: 450 },
  pudding: { label: "Crema al cioccolato", emoji: "🍮", priceCents: 550 },
  soup: { label: "Zuppa di verdure", emoji: "🍲", priceCents: 650 },
  spaghetti: { label: "Spaghetti al burro", emoji: "🍝", priceCents: 700 },
  waffle: { label: "Waffle al cacao", emoji: "🧇", priceCents: 800 },
  omelette: { label: "Frittata di verdure", emoji: "🥘", priceCents: 850 },
  milkTea: { label: "Tè al latte", emoji: "🧋", priceCents: 600 },
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
  milk: { label: "Latte", emoji: "🥛", pack: { units: 3, priceCents: 200 } },
  vegetables: { label: "Verdure", emoji: "🥕", pack: { units: 3, priceCents: 200 } },
  dryPasta: { label: "Spaghetti", emoji: "🌾", pack: { units: 4, priceCents: 200 } },
} as const;
export type IngredientId = keyof typeof INGREDIENTS;
export const INGREDIENT_IDS = Object.keys(INGREDIENTS) as IngredientId[];

export function isIngredient(value: unknown): value is IngredientId {
  return INGREDIENT_IDS.includes(value as IngredientId);
}

interface Recipe {
  /** One or two ingredients, all used up when cooking. */
  ingredients: IngredientId[];
  cookMs: number;
  /**
   * Price to unlock the recipe in the recipe book. Recipes without one are known from the start; the
   * others have to be bought before customers can order them and their ingredient can be ordered.
   */
  unlockPriceCents?: number;
}

/** How each menu item is cooked on the stove: which ingredients it takes and how long. */
export const RECIPES: Record<MenuItemId, Recipe> = {
  chocolate: { ingredients: ["cocoa"], cookMs: 6000 },
  tea: { ingredients: ["teaLeaves"], cookMs: 4000 },
  pancakes: { ingredients: ["batter"], cookMs: 8000 },
  egg: { ingredients: ["eggs"], cookMs: 5000 },
  pudding: { ingredients: ["milk"], cookMs: 7000, unlockPriceCents: 1000 },
  soup: { ingredients: ["vegetables"], cookMs: 9000, unlockPriceCents: 1200 },
  spaghetti: { ingredients: ["dryPasta"], cookMs: 10000, unlockPriceCents: 1500 },
  waffle: { ingredients: ["batter", "cocoa"], cookMs: 9000, unlockPriceCents: 1800 },
  omelette: { ingredients: ["eggs", "vegetables"], cookMs: 9000, unlockPriceCents: 2000 },
  milkTea: { ingredients: ["teaLeaves", "milk"], cookMs: 5000, unlockPriceCents: 1400 },
};

/** A player carries either one cooked dish, or up to this many ingredients. */
export const MAX_HELD_INGREDIENTS = 2;

/** The dish in someone's hands, if what they carry is a dish. */
export function heldDish(holding: Iterable<string>): MenuItemId | null {
  const [first] = holding;
  return isMenuItem(first) ? first : null;
}

/** The ingredients in someone's hands (none if they carry a dish). */
export function heldIngredients(holding: Iterable<string>): IngredientId[] {
  return [...holding].filter(isIngredient);
}

/**
 * The ingredients left in hand after cooking `dish`, or null if they don't carry everything it needs.
 * Extra ingredients the recipe doesn't use stay in hand.
 */
export function ingredientsAfterCooking(dish: MenuItemId, holding: Iterable<string>): IngredientId[] | null {
  const left = heldIngredients(holding);
  for (const needed of RECIPES[dish].ingredients) {
    const index = left.indexOf(needed);
    if (index < 0) return null;
    left.splice(index, 1);
  }
  return left;
}

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

/** How many dishes the waiter picks from when taking an order, the right one included. */
export const ORDER_CHOICES = 4;

/**
 * The dishes offered to the waiter when taking this customer's order: what they want plus others
 * off the menu, shuffled. Picked from their id, so it stays the same if the dialog reopens and the
 * server can check the waiter picked one of them.
 */
export function orderChoices(customerId: string, wants: MenuItemId, menu: readonly MenuItemId[]): MenuItemId[] {
  let seed = 0;
  for (const char of customerId) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
  // Scramble the bits: ids are sequential ("c1", "c2"…), so their hashes are too close to each other.
  seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b) >>> 0;
  seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b) >>> 0;
  // Small deterministic generator (LCG), good enough to shuffle a handful of items.
  const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const shuffle = <T>(items: T[]) => {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  };

  const others = shuffle(menu.filter((id) => id !== wants)).slice(0, ORDER_CHOICES - 1);
  return shuffle([wants, ...others]);
}
