// What a player can do. Pressing E triggers whatever availableInteraction() returns:
// either an instant interaction (hooking or seating a customer, opening the order dialog, reading a ticket,
// using the fridge, stove, pass or phone, serving) or a timed action (cleaning a table, taking payment), which
// completes after `durationMs` unless the player walks out of reach first.
// A "blocked" interaction only explains why E does nothing right now.

import { isAtQueueSpot, isNearCustomer, isNearPhone, isNearRegister, isNearTable, type TableStatus } from "./hall.ts";
import { PASS_CAPACITY, freeTicketSlot, isNearFridge, isNearPass, isNearStove, nearestTicket } from "./kitchen.ts";
import { MENU, MENU_ITEMS, formatMoney, isIngredient, isMenuItem, type MenuItemId } from "./menu.ts";
import type { CustomerStatus } from "./hall.ts";
import type { Customer, KitchenState } from "./state.ts";

export const ACTIONS = {
  cleanTable: { label: "Pulisci tavolo", durationMs: 2500 },
  checkout: { label: "Incassa", durationMs: 2000 },
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
  /** Client-only: opens the fridge popup. The server is involved once an ingredient is picked. */
  | { kind: "openFridge" }
  | { kind: "putBack" }
  /** Client-only: opens the phone popup. The server is involved once something is bought. */
  | { kind: "openPhone" }
  /** Client-only: opens the stove popup. The server is involved once a dish is picked. */
  | { kind: "openStove" }
  | { kind: "takeDish"; dish: MenuItemId }
  | { kind: "placeOnPass"; dish: MenuItemId }
  | { kind: "takeFromPass"; dish: MenuItemId }
  | { kind: "serve"; customerId: string; dish: MenuItemId }
  /** E does nothing right now; `reason` says why. It's about either a customer or a kitchen station. */
  | { kind: "blocked"; reason: string; customerId?: string; station?: "stove" | "pass" }
  /** `targetId` is the table to clean or the customer paying; `amountCents` is what they're paying. */
  | { kind: "action"; action: ActionId; targetId: string; amountCents?: number };

export function interactionLabel(interaction: Interaction) {
  switch (interaction.kind) {
    case "lead": return "Accompagna al tavolo";
    case "seat": return "Fai sedere";
    case "release": return "Rimanda all'ingresso";
    case "takeOrder": return "Prendi l'ordinazione";
    case "readTicket": return "Leggi la comanda";
    case "openFridge": return "Apri il frigo";
    case "putBack": return "Rimetti in frigo";
    case "openStove": return "Usa il fornello";
    case "openPhone": return "Usa il telefono";
    case "takeDish": return `Prendi ${MENU[interaction.dish].label}`;
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

/** The restaurant's menu: the items whose recipe has been unlocked, in menu order. */
export function unlockedMenu(state: KitchenState): MenuItemId[] {
  return MENU_ITEMS.filter((id) => state.unlockedRecipes.includes(id));
}

/** The customer at the front of the queue at the till, once they've reached the till. */
export function customerReadyToPay(state: KitchenState) {
  const front = state.customers.get(state.queue[0] ?? "");
  return front && isAtQueueSpot(front, 0) ? front : null;
}

/** What the cook can do at the stove, given what they're carrying. */
function stoveInteraction(state: KitchenState, holding: string): Interaction {
  const { status, dish } = state.stove;
  if (status === "cooking") return { kind: "blocked", station: "stove", reason: "In cottura…" };
  if (status === "ready" && dish) {
    return holding
      ? { kind: "blocked", station: "stove", reason: "Hai le mani piene" }
      : { kind: "takeDish", dish };
  }
  return isIngredient(holding)
    ? { kind: "openStove" }
    : { kind: "blocked", station: "stove", reason: holding ? "Hai già un piatto in mano" : "Ti serve un ingrediente" };
}

/** What either player can do at the pass: leave the dish they carry, or pick up the oldest one. */
function passInteraction(state: KitchenState, holding: string): Interaction | null {
  if (isMenuItem(holding)) {
    return state.pass.length < PASS_CAPACITY
      ? { kind: "placeOnPass", dish: holding }
      : { kind: "blocked", station: "pass", reason: "Bancone pieno" };
  }
  const oldest = state.pass[0];
  if (!holding && isMenuItem(oldest)) return { kind: "takeFromPass", dish: oldest };
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
    if (isNearFridge(at)) {
      if (!player.holding) return { kind: "openFridge" };
      return isIngredient(player.holding) ? { kind: "putBack" } : null;
    }
    if (isNearStove(at)) return stoveInteraction(state, player.holding);
    if (isNearPass(at)) return passInteraction(state, player.holding);
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
      if (customer.status === "waitingFood" && isMenuItem(player.holding)) {
        return { kind: "serve", customerId: customer.id, dish: player.holding };
      }
    }
    if (isNearPass(at)) {
      const interaction = passInteraction(state, player.holding);
      if (interaction) return interaction;
    }
    if (isNearPhone(at)) return { kind: "openPhone" };
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
