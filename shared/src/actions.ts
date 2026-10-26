// What a player can do. Pressing E triggers whatever availableInteraction() returns:
// either an instant interaction (hooking or seating a customer, opening the order dialog, reading a ticket,
// using the fridge, the freezer, an appliance, the pass, phone, computer or recipe book, serving) or a timed action (cleaning
// a table, taking payment, unloading a delivery), which
// completes after `durationMs` unless the player walks out of reach first.
// A "blocked" interaction only explains why E does nothing right now.

import {
  isAtQueueSpot,
  isNearComputer,
  isNearRecipeBook,
  isNearCustomer,
  isNearRegister,
  isNearTable,
  type TableStatus,
} from "./hall.ts";
import {
  EQUIPMENT,
  PASS_CAPACITY,
  freeTicketSlot,
  hasEquipment,
  isNearFridge,
  isNearPass,
  isNearDeliveryBay,
  isNearPhone,
  nearestAppliance,
  nearestTicket,
  type EquipmentId,
} from "./kitchen.ts";
import {
  INGREDIENT_IDS,
  MENU,
  MENU_ITEMS,
  RECIPES,
  formatMoney,
  heldDish,
  heldIngredients,
  heldPrep,
  ingredientsAfterCooking,
  isFinalStep,
  isMenuItem,
  recipeEquipment,
  type IngredientId,
  type MenuItemId,
  type Storage,
} from "./menu.ts";
import type { CustomerStatus } from "./hall.ts";
import type { Appliance, Customer, KitchenState } from "./state.ts";

export const ACTIONS = {
  cleanTable: { label: "Pulisci tavolo", durationMs: 500 },
  checkout: { label: "Incassa", durationMs: 800 },
  receiveDelivery: { label: "Ritira la consegna", durationMs: 3000 },
} as const;
export type ActionId = keyof typeof ACTIONS;

/** What a waiter can do on a table in the given status, if anything. */
export function tableActionFor(status: TableStatus): ActionId | null {
  return status === "dirty" ? "cleanTable" : null;
}

export type Interaction =
  | { kind: "lead"; customerId: string }
  | { kind: "seat"; customerId: string; tableId: string }
  /** Let go of the customer being led: they walk back to the entrance and wait again. */
  | { kind: "release"; customerId: string }
  | { kind: "takeOrder"; customerId: string }
  /** Client-only: opens the ticket popup. The server isn't involved until the ticket is thrown away. */
  | { kind: "readTicket"; ticketId: string }
  /** Client-only: opens the fridge or freezer popup, to take or put back ingredients. */
  | { kind: "openStorage"; storage: Storage; applianceId?: string }
  /** Client-only: opens the phone popup. The server is involved once something is bought. */
  | { kind: "openPhone" }
  /**
   * Client-only: opens an appliance popup, to start a recipe or upgrade it. The server is involved
   * once a dish is picked or the upgrade bought.
   */
  | { kind: "openAppliance"; applianceId: string }
  /** Puts the half-made dish in hand on the appliance for its next step. */
  | { kind: "continueRecipe"; applianceId: string; dish: MenuItemId; step: number }
  /** Picks up what's on the appliance: the finished dish, or the half-made one after `step`. */
  | { kind: "takeFromAppliance"; applianceId: string; dish: MenuItemId; step: number }
  /** Client-only: opens the computer popup. The server is involved once something is bought and placed. */
  | { kind: "openComputer" }
  /** Client-only: opens the recipe book. The server is involved once a recipe is bought. */
  | { kind: "openRecipeBook" }
  | { kind: "placeOnPass"; dish: MenuItemId }
  | { kind: "takeFromPass"; dish: MenuItemId }
  | { kind: "serve"; customerId: string; dish: MenuItemId }
  /** E does nothing right now; `reason` says why. It's about either a customer or a kitchen station. */
  | { kind: "blocked"; reason: string; customerId?: string; station?: "appliance" | "pass"; stationId?: string }
  /**
   * `targetId` is the table to clean, the customer paying, or "delivery" for the truck;
   * `amountCents` is what the customer is paying.
   */
  | { kind: "action"; action: ActionId; targetId: string; amountCents?: number };

export function interactionLabel(interaction: Interaction) {
  switch (interaction.kind) {
    case "lead": return "Accompagna al tavolo";
    case "seat": return "Fai sedere";
    case "release": return "Rimanda all'ingresso";
    case "takeOrder": return "Prendi l'ordinazione";
    case "readTicket": return "Leggi la comanda";
    case "openStorage": return interaction.storage === "fridge" ? "Apri il frigo" : "Apri il congelatore";
    case "openAppliance": return "Usa l'elettrodomestico";
    case "continueRecipe": return RECIPES[interaction.dish].steps[interaction.step].label;
    case "openPhone": return "Usa il telefono";
    case "openComputer": return "Usa il computer";
    case "openRecipeBook": return "Consulta il libro delle ricette";
    case "takeFromAppliance": {
      const { label } = MENU[interaction.dish];
      return isFinalStep(interaction.dish, interaction.step) ? `Prendi ${label}` : `Prendi ${label} (a metà)`;
    }
    case "placeOnPass": return "Posa sul bancone";
    case "takeFromPass": return `Prendi ${MENU[interaction.dish].label}`;
    case "serve": return `Servi ${MENU[interaction.dish].label}`;
    case "blocked": return interaction.reason;
    case "action": {
      const { label } = ACTIONS[interaction.action];
      return interaction.amountCents === undefined ? label : `${label} ${formatMoney(interaction.amountCents)}`;
    }
  }
}

/** The customer this waiter is attending in the given status (leading, taking the order of), if any. */
export function attendedCustomer(state: KitchenState, sessionId: string, status: CustomerStatus) {
  for (const customer of state.customers.values()) {
    if (customer.status === status && customer.waiterId === sessionId) return customer;
  }
  return null;
}

/** Whether a player at `at` can interact with the customer: a seated customer is reachable from anywhere around their table. */
export function canReachCustomer(state: KitchenState, at: { x: number; y: number }, customer: Customer) {
  const table = state.tables.get(customer.tableId);
  return table ? isNearTable(at, table) : isNearCustomer(at, customer);
}

/** Customers waiting at the entrance, front of the line first (customer ids are sequential, so by arrival). */
export function entranceLine(state: KitchenState) {
  return [...state.customers.values()]
    .filter((c) => c.status === "waiting")
    .sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
}

/**
 * The restaurant's menu: every recipe learnt up to its current level, in menu order. Customers order
 * from these whether or not there's stock, or the appliances, to make them.
 */
export function unlockedMenu(state: KitchenState): MenuItemId[] {
  return MENU_ITEMS.filter((id) => RECIPES[id].unlockLevel <= state.level);
}

/** Appliances the kitchen still needs before it can make the recipe. */
export function missingEquipment(state: KitchenState, dish: MenuItemId): EquipmentId[] {
  return recipeEquipment(dish).filter((kind) => !hasEquipment(state, kind));
}

/** Ingredients of the unlocked recipes: the only ones that can be ordered on the phone. */
export function unlockedIngredients(state: KitchenState): IngredientId[] {
  return INGREDIENT_IDS.filter((id) => unlockedMenu(state).some((dish) => RECIPES[dish].ingredients.includes(id)));
}

/** The customer at the front of the queue at the till, once they've reached the till. */
export function customerReadyToPay(state: KitchenState) {
  const front = state.customers.get(state.queue[0] ?? "");
  return front && isAtQueueSpot(front, 0) ? front : null;
}

/** Unlocked recipes whose first step happens on this kind of appliance. */
export function recipesStartingAt(state: KitchenState, kind: EquipmentId) {
  return unlockedMenu(state).filter((dish) => RECIPES[dish].steps[0]?.at === kind);
}

/** What the cook can do at an appliance, given what they're carrying. */
function applianceInteraction(
  state: KitchenState,
  appliance: Appliance,
  holding: ArrayLike<string> & Iterable<string>,
): Interaction | null {
  const { id: applianceId, kind, status, dish, step } = appliance;
  const blocked = (reason: string): Interaction => ({ kind: "blocked", station: "appliance", stationId: applianceId, reason });

  if (kind === "freezer") {
    // Like the fridge: only for ingredients, not with a dish in hand.
    return heldDish(holding) || heldPrep(holding) ? null : { kind: "openStorage", storage: "freezer", applianceId };
  }
  if (status === "working" && dish) return blocked(`${RECIPES[dish].steps[step].label}…`);
  if (status === "ready" && dish) {
    return holding.length ? blocked("Hai le mani piene") : { kind: "takeFromAppliance", applianceId, dish, step };
  }

  const prep = heldPrep(holding);
  if (prep) {
    const next = RECIPES[prep.dish].steps[prep.stepsDone];
    return next.at === kind
      ? { kind: "continueRecipe", applianceId, dish: prep.dish, step: prep.stepsDone }
      : blocked(`Prossimo passaggio: ${EQUIPMENT[next.at].emoji} ${EQUIPMENT[next.at].label}`);
  }
  if (heldDish(holding)) return blocked("Hai già un piatto in mano");
  // Empty hands: the popup shows what can be cooked here and the upgrade.
  if (!heldIngredients(holding).length) return { kind: "openAppliance", applianceId };

  const startable = (dish: MenuItemId) => ingredientsAfterCooking(dish, holding) !== null;
  if (recipesStartingAt(state, kind).some(startable)) return { kind: "openAppliance", applianceId };
  // Point the cook to where what they carry is started instead.
  const elsewhere = unlockedMenu(state).find((dish) => RECIPES[dish].steps.length && startable(dish));
  if (!elsewhere) return blocked("Nessuna ricetta del menù con questi ingredienti");
  const missing = missingEquipment(state, elsewhere)[0];
  if (missing) return blocked(`${MENU[elsewhere].label}: in cucina manca ${EQUIPMENT[missing].emoji} ${EQUIPMENT[missing].label}`);
  const first = EQUIPMENT[RECIPES[elsewhere].steps[0].at];
  return blocked(`${MENU[elsewhere].label}: si inizia da ${first.emoji} ${first.label}`);
}

/** What either player can do at the pass: leave the dish they carry, or pick up the oldest one. */
function passInteraction(state: KitchenState, holding: ArrayLike<string> & Iterable<string>): Interaction | null {
  const dish = heldDish(holding);
  if (dish) {
    return state.pass.length < PASS_CAPACITY
      ? { kind: "placeOnPass", dish }
      : { kind: "blocked", station: "pass", reason: "Bancone pieno" };
  }
  const oldest = state.pass[0]?.dish;
  if (!holding.length && isMenuItem(oldest)) return { kind: "takeFromPass", dish: oldest };
  return null;
}

/**
 * What pressing E would do for this player right now, if anything.
 * The server calls it with the authoritative position; the client passes its smoothed
 * sprite position to show the matching hint.
 */
export function availableInteraction(
  state: KitchenState,
  sessionId: string,
  position?: { x: number; y: number },
): Interaction | null {
  const player = state.players.get(sessionId);
  if (!player || player.action) return null;
  const at = position ?? player;

  if (player.role === "kitchen") {
    const ticket = nearestTicket(state, at);
    if (ticket) return { kind: "readTicket", ticketId: ticket.id };
    // The fridge only takes ingredients: not with a dish in hand, finished or not.
    if (isNearFridge(at)) {
      return heldDish(player.holding) || heldPrep(player.holding) ? null : { kind: "openStorage", storage: "fridge" };
    }
    const appliance = nearestAppliance(state, at);
    if (appliance) {
      const interaction = applianceInteraction(state, appliance, player.holding);
      if (interaction) return interaction;
    }
    if (isNearPass(at)) return passInteraction(state, player.holding);
    if (isNearPhone(at)) return { kind: "openPhone" };
    if (state.delivery.status === "arrived" && isNearDeliveryBay(at)) {
      return { kind: "action", action: "receiveDelivery", targetId: "delivery" };
    }
    return null;
  }

  if (attendedCustomer(state, sessionId, "ordering")) return null;

  const toTable = attendedCustomer(state, sessionId, "following");
  if (toTable) {
    for (const table of state.tables.values()) {
      if (table.status === "free" && isNearTable(at, table)) {
        return { kind: "seat", customerId: toTable.id, tableId: table.id };
      }
    }
    // Cleaning a table with the customer in tow is fine; otherwise E lets them go.
    return tableAction(state, at) ?? { kind: "release", customerId: toTable.id };
  } else {
    // Only the customer at the front of the line can be led to a table.
    const front = entranceLine(state)[0];
    if (front && isNearCustomer(at, front)) return { kind: "lead", customerId: front.id };
    for (const customer of state.customers.values()) {
      if (!canReachCustomer(state, at, customer)) continue;
      if (customer.status === "readyToOrder") {
        return freeTicketSlot(state) === null
          ? { kind: "blocked", customerId: customer.id, reason: "Comande piene in cucina" }
          : { kind: "takeOrder", customerId: customer.id };
      }
      const dish = heldDish(player.holding);
      if (customer.status === "waitingFood" && dish) return { kind: "serve", customerId: customer.id, dish };
    }
    if (isNearPass(at)) {
      const interaction = passInteraction(state, player.holding);
      if (interaction) return interaction;
    }
    if (isNearComputer(at)) return { kind: "openComputer" };
    if (isNearRecipeBook(at)) return { kind: "openRecipeBook" };
    const payer = customerReadyToPay(state);
    if (payer && isNearRegister(at)) {
      return { kind: "action", action: "checkout", targetId: payer.id, amountCents: payer.bill };
    }
  }

  return tableAction(state, at);
}

/** A timed action on a table within reach (cleaning it), if any. */
function tableAction(state: KitchenState, at: { x: number; y: number }): Interaction | null {
  for (const table of state.tables.values()) {
    const action = tableActionFor(table.status);
    if (action && isNearTable(at, table)) return { kind: "action", action, targetId: table.id };
  }
  return null;
}
