// What customers can order, the ingredients the kitchen makes it from, and the steps to cook it.
// Money is always in euro cents (integers), so sums never pick up rounding errors.

import { EQUIPMENT, type ApplianceKind, type EquipmentId } from "./kitchen.ts";

/**
 * In the order they're learnt. What a customer pays grows with how much work the dish takes:
 * 4 € for every step (taking the ingredients included) minus 1 €, plus 1 € for every ingredient
 * after the first. Cola, served as it is, costs 3 €; a five-step dish with three ingredients 21 €.
 */
export const MENU = {
  cola: { label: "Coca-Cola", emoji: "🥤", priceCents: 300 },
  dhal: { label: "Dhal di lenticchie", emoji: "🍛", priceCents: 800 },
  breadNutella: { label: "Pane con la Nutella", emoji: "🍞", priceCents: 800 },
  coffee: { label: "Caffè", emoji: "☕", priceCents: 700 },
  frittata: { label: "Frittata", emoji: "🍳", priceCents: 700 },
  fries: { label: "Patatine fritte", emoji: "🍟", priceCents: 700 },
  noodles: { label: "Noodles con anacardi", emoji: "🍜", priceCents: 1200 },
  tomatoConfit: { label: "Pomodorini confit", emoji: "🍅", priceCents: 1100 },
  peanutLeeks: { label: "Porri con burro d'arachidi", emoji: "🥬", priceCents: 1200 },
  veggieBalls: { label: "Polpette vegetariane", emoji: "🧆", priceCents: 1600 },
  tagliatelle: { label: "Tagliatelle con ragù vegano", emoji: "🍝", priceCents: 2100 },
  cheesecake: { label: "Cheesecake ai frutti di bosco", emoji: "🍰", priceCents: 2100 },
} as const;
export type MenuItemId = keyof typeof MENU;
export const MENU_ITEMS = Object.keys(MENU) as MenuItemId[];

export function isMenuItem(value: unknown): value is MenuItemId {
  return MENU_ITEMS.includes(value as MenuItemId);
}

/** Where an ingredient is kept: the fridge is there from the start, the freezer has to be bought. */
export type Storage = "fridge" | "freezer";

export const STORAGE_INFO: Record<Storage, { label: string; emoji: string }> = {
  fridge: { label: "Frigo", emoji: "🗄️" },
  freezer: { label: "Congelatore", emoji: EQUIPMENT.freezer.emoji },
};

interface Ingredient {
  label: string;
  emoji: string;
  storage: Storage;
  /** How it's bought over the phone. */
  pack: { units: number; priceCents: number };
}

/**
 * Ingredients, where they're kept and the pack they're bought in. Packs are small (yesterday's stock
 * is thrown away, so big packs mostly end up in the bin) and priced so that a dish's ingredients cost
 * about a quarter of what the customer pays for it.
 */
export const INGREDIENTS = {
  cola: { label: "Coca-Cola", emoji: "🥤", storage: "fridge", pack: { units: 4, priceCents: 300 } },
  lentils: { label: "Lenticchie", emoji: "🥫", storage: "fridge", pack: { units: 2, priceCents: 200 } },
  coconutMilk: { label: "Latte di cocco", emoji: "🥥", storage: "fridge", pack: { units: 2, priceCents: 200 } },
  bread: { label: "Pane", emoji: "🥖", storage: "fridge", pack: { units: 2, priceCents: 200 } },
  nutella: { label: "Nutella", emoji: "🫙", storage: "fridge", pack: { units: 2, priceCents: 200 } },
  groundCoffee: { label: "Caffè macinato", emoji: "🫘", storage: "fridge", pack: { units: 2, priceCents: 350 } },
  eggs: { label: "Uova", emoji: "🥚", storage: "fridge", pack: { units: 2, priceCents: 350 } },
  frozenFries: { label: "Patatine surgelate", emoji: "❄️", storage: "freezer", pack: { units: 2, priceCents: 350 } },
  noodlePack: { label: "Noodles", emoji: "🥡", storage: "fridge", pack: { units: 2, priceCents: 300 } },
  cashews: { label: "Anacardi", emoji: "🌰", storage: "fridge", pack: { units: 2, priceCents: 300 } },
  cherryTomatoes: { label: "Pomodorini", emoji: "🍅", storage: "fridge", pack: { units: 2, priceCents: 550 } },
  leeks: { label: "Porri", emoji: "🧅", storage: "fridge", pack: { units: 2, priceCents: 300 } },
  peanutButter: { label: "Burro d'arachidi", emoji: "🥜", storage: "fridge", pack: { units: 2, priceCents: 300 } },
  veganMince: { label: "Macinato vegetale", emoji: "🌱", storage: "fridge", pack: { units: 2, priceCents: 250 } },
  carrots: { label: "Carote", emoji: "🥕", storage: "fridge", pack: { units: 2, priceCents: 550 } },
  freshPasta: { label: "Tagliatelle fresche", emoji: "🌾", storage: "fridge", pack: { units: 2, priceCents: 250 } },
  biscuits: { label: "Biscotti", emoji: "🍪", storage: "fridge", pack: { units: 2, priceCents: 350 } },
  creamCheese: { label: "Formaggio spalmabile", emoji: "🧀", storage: "fridge", pack: { units: 2, priceCents: 350 } },
  berries: { label: "Frutti di bosco", emoji: "🫐", storage: "freezer", pack: { units: 2, priceCents: 350 } },
} as const satisfies Record<string, Ingredient>;
export type IngredientId = keyof typeof INGREDIENTS;
export const INGREDIENT_IDS = Object.keys(INGREDIENTS) as IngredientId[];

export function isIngredient(value: unknown): value is IngredientId {
  return INGREDIENT_IDS.includes(value as IngredientId);
}

/** One step of a recipe after taking the ingredients: what to do on which appliance, and how long it takes. */
export interface RecipeStep {
  at: ApplianceKind;
  label: string;
  ms: number;
}

interface Recipe {
  /** One to MAX_HELD_INGREDIENTS ingredients, all used up by the first step. */
  ingredients: IngredientId[];
  /**
   * What to do with them, in order. None means the ingredient is served as it is: taking it out of
   * the fridge gives the finished dish.
   */
  steps: RecipeStep[];
  /**
   * Restaurant level at which the recipe is learnt, one level per shift passed. It goes straight on
   * the menu: customers order it (and its ingredients can be ordered) even if the kitchen doesn't
   * have the appliances it needs yet, so they have to be bought.
   */
  unlockLevel: number;
}

/** How each menu item is made. Taking the ingredients counts as the first step (see recipeComplexity). */
export const RECIPES: Record<MenuItemId, Recipe> = {
  cola: { ingredients: ["cola"], steps: [], unlockLevel: 1 },
  dhal: {
    ingredients: ["lentils", "coconutMilk"],
    steps: [{ at: "stove", label: "Cuoci il dhal", ms: 8000 }],
    unlockLevel: 1,
  },
  frittata: {
    ingredients: ["eggs"],
    steps: [{ at: "stove", label: "Cuoci la frittata", ms: 6000 }],
    unlockLevel: 4,
  },
  fries: {
    ingredients: ["frozenFries"],
    steps: [{ at: "fryer", label: "Friggi", ms: 6000 }],
    unlockLevel: 5,
  },
  coffee: {
    ingredients: ["groundCoffee"],
    steps: [{ at: "coffeeMachine", label: "Fai il caffè", ms: 3000 }],
    unlockLevel: 3,
  },
  breadNutella: {
    ingredients: ["bread", "nutella"],
    steps: [{ at: "workbench", label: "Taglia e spalma", ms: 3000 }],
    unlockLevel: 2,
  },
  noodles: {
    ingredients: ["noodlePack", "cashews"],
    steps: [
      { at: "workbench", label: "Trita gli anacardi", ms: 2000 },
      { at: "stove", label: "Salta nel wok", ms: 6000 },
    ],
    unlockLevel: 6,
  },
  tomatoConfit: {
    ingredients: ["cherryTomatoes"],
    steps: [
      { at: "workbench", label: "Taglia a metà", ms: 3000 },
      { at: "oven", label: "Cuoci a bassa temperatura", ms: 10000 },
    ],
    unlockLevel: 6,
  },
  peanutLeeks: {
    ingredients: ["leeks", "peanutButter"],
    steps: [
      { at: "workbench", label: "Affetta i porri", ms: 3000 },
      { at: "stove", label: "Salta in padella", ms: 7000 },
    ],
    unlockLevel: 7,
  },
  veggieBalls: {
    ingredients: ["veganMince", "carrots"],
    steps: [
      { at: "workbench", label: "Trita le carote", ms: 3000 },
      { at: "blender", label: "Impasta", ms: 4000 },
      { at: "fryer", label: "Friggi le polpette", ms: 7000 },
    ],
    unlockLevel: 8,
  },
  tagliatelle: {
    ingredients: ["freshPasta", "veganMince", "cherryTomatoes"],
    steps: [
      { at: "workbench", label: "Prepara il soffritto", ms: 3000 },
      { at: "stove", label: "Cuoci il ragù", ms: 8000 },
      { at: "workbench", label: "Condisci le tagliatelle", ms: 2000 },
      { at: "stove", label: "Manteca in padella", ms: 4000 },
    ],
    unlockLevel: 9,
  },
  cheesecake: {
    ingredients: ["biscuits", "creamCheese", "berries"],
    steps: [
      { at: "blender", label: "Trita i biscotti", ms: 3000 },
      { at: "workbench", label: "Componi la torta", ms: 3000 },
      { at: "oven", label: "Cuoci", ms: 10000 },
      { at: "workbench", label: "Taglia una fetta", ms: 2000 },
    ],
    unlockLevel: 10,
  },
};

/** Whether `step` is the last of the dish's recipe: once it's done, the dish is finished. */
export function isFinalStep(dish: MenuItemId, step: number) {
  return step === RECIPES[dish].steps.length - 1;
}

/** Complexity from 1 to 5: how many steps the recipe takes, taking the ingredients included. */
export function recipeComplexity(dish: MenuItemId) {
  return RECIPES[dish].steps.length + 1;
}

/** Where the ingredients for `dish` are taken from: the fridge, the freezer or both. */
export function recipeStorages(dish: MenuItemId): Storage[] {
  return [...new Set(RECIPES[dish].ingredients.map((id) => INGREDIENTS[id].storage))];
}

/** What the kitchen must have before the recipe can be bought: its appliances, and the freezer for frozen goods. */
export function recipeEquipment(dish: MenuItemId): EquipmentId[] {
  const needed = new Set<EquipmentId>(RECIPES[dish].steps.map((step) => step.at));
  if (recipeStorages(dish).includes("freezer")) needed.add("freezer");
  return [...needed];
}

/** Recipes that can't be made without this appliance, in menu order. */
export function recipesNeeding(kind: EquipmentId): MenuItemId[] {
  return MENU_ITEMS.filter((id) => recipeEquipment(id).includes(kind));
}

/** Every step of a recipe as shown to players, starting with taking the ingredients. */
export function describeSteps(dish: MenuItemId): Array<{ emoji: string; where: string; what: string }> {
  const { ingredients, steps } = RECIPES[dish];
  const taking = recipeStorages(dish).map((storage) => ({
    emoji: STORAGE_INFO[storage].emoji,
    where: STORAGE_INFO[storage].label,
    what: ingredients.filter((id) => INGREDIENTS[id].storage === storage).map((id) => INGREDIENTS[id].label).join(" + "),
  }));
  return [
    ...taking,
    ...steps.map((step) => ({ emoji: EQUIPMENT[step.at].emoji, where: EQUIPMENT[step.at].label, what: step.label })),
  ];
}

/** The dish served exactly as it comes out of the fridge or freezer (like a can of cola), if `ingredient` is one. */
export function readyMadeDish(ingredient: IngredientId): MenuItemId | null {
  return MENU_ITEMS.find((id) => RECIPES[id].steps.length === 0 && RECIPES[id].ingredients[0] === ingredient) ?? null;
}

/**
 * A player carries one cooked dish, one dish halfway through its recipe, or up to this many
 * ingredients.
 */
export const MAX_HELD_INGREDIENTS = 3;

/** A dish halfway through its recipe, as carried around: `dish` with its first `stepsDone` steps done. */
export interface Prep {
  dish: MenuItemId;
  stepsDone: number;
}

/** How a half-made dish is written in `holding`, e.g. "tagliatelle@2". */
export function prepItem({ dish, stepsDone }: Prep) {
  return `${dish}@${stepsDone}`;
}

export function parsePrep(item: unknown): Prep | null {
  const [dish, done] = String(item).split("@");
  const stepsDone = Number(done);
  if (!isMenuItem(dish) || !Number.isInteger(stepsDone)) return null;
  return stepsDone > 0 && stepsDone < RECIPES[dish].steps.length ? { dish, stepsDone } : null;
}

/** The dish in someone's hands, if what they carry is a finished dish. */
export function heldDish(holding: Iterable<string>): MenuItemId | null {
  const [first] = holding;
  return isMenuItem(first) ? first : null;
}

/** The half-made dish in someone's hands, if that's what they carry. */
export function heldPrep(holding: Iterable<string>): Prep | null {
  const [first] = holding;
  return first === undefined ? null : parsePrep(first);
}

/** The ingredients in someone's hands (none if they carry a dish). */
export function heldIngredients(holding: Iterable<string>): IngredientId[] {
  return [...holding].filter(isIngredient);
}

/**
 * The ingredients left in hand after starting `dish`, or null if they don't carry everything it needs.
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

/** What the restaurant opens with: some cash and an empty fridge, so the first thing to do is order ingredients. */
export const STARTING_MONEY_CENTS = 2000;

/** Anything a player can carry: an ingredient, a cooked dish or a half-made one (see prepItem). */
export type HeldItem = IngredientId | MenuItemId | string;

/** Label and emoji of something a player is carrying; `partial` for a half-made dish. */
export function heldItemInfo(item: HeldItem): { label: string; emoji: string; partial: boolean } {
  if (isIngredient(item)) return { ...INGREDIENTS[item], partial: false };
  if (isMenuItem(item)) return { ...MENU[item], partial: false };
  const prep = parsePrep(item);
  if (!prep) return { label: "", emoji: "", partial: false };
  const { label, emoji } = MENU[prep.dish];
  return { label: `${label} (${prep.stepsDone}/${RECIPES[prep.dish].steps.length})`, emoji, partial: true };
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
