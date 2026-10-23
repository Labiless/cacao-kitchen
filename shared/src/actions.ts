// What a player can do. Pressing E triggers whatever availableInteraction() returns:
// either an instant interaction (hooking, seating or showing out a customer, opening the order dialog,
// reading a ticket, using the fridge) or a timed action, which completes after `durationMs` unless the player walks out of
// reach first. A "blocked" interaction only explains why E does nothing right now.

import { isNearCustomer, isNearEntrance, isNearTable, type TableStatus } from "./hall.ts";
import { freeTicketSlot, isNearFridge, nearestTicket } from "./kitchen.ts";
import type { CustomerStatus } from "./hall.ts";
import type { Customer, KitchenState } from "./state.ts";

export const ACTIONS = {
  cleanTable: { label: "Pulisci tavolo", durationMs: 2500 },
} as const;
export type ActionId = keyof typeof ACTIONS;

/** What a waiter can do on a table in the given status, if anything. */
export function tableActionFor(status: TableStatus): ActionId | null {
  return status === "dirty" ? "cleanTable" : null;
}

export type Interaction =
  | { kind: "lead"; customerId: string }
  | { kind: "seat"; customerId: string; tableId: string }
  | { kind: "takeOrder"; customerId: string }
  | { kind: "escort"; customerId: string }
  | { kind: "farewell"; customerId: string }
  /** Client-only: opens the ticket popup. The server isn't involved until the ticket is thrown away. */
  | { kind: "readTicket"; ticketId: string }
  /** Client-only: opens the fridge popup. The server is involved once an ingredient is picked. */
  | { kind: "openFridge" }
  | { kind: "putBack" }
  | { kind: "blocked"; customerId: string; reason: string }
  | { kind: "action"; action: ActionId; tableId: string };

export function interactionLabel(interaction: Interaction) {
  switch (interaction.kind) {
    case "lead": return "Accompagna al tavolo";
    case "seat": return "Fai sedere";
    case "takeOrder": return "Prendi l'ordinazione";
    case "escort": return "Accompagna all'uscita";
    case "farewell": return "Saluta il cliente";
    case "readTicket": return "Leggi la comanda";
    case "openFridge": return "Apri il frigo";
    case "putBack": return "Rimetti in frigo";
    case "blocked": return interaction.reason;
    case "action": return ACTIONS[interaction.action].label;
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
    if (isNearFridge(at)) return player.holding ? { kind: "putBack" } : { kind: "openFridge" };
    return null;
  }

  if (attendedCustomer(state, sessionId, "ordering")) return null;

  const toTable = attendedCustomer(state, sessionId, "following");
  const toExit = attendedCustomer(state, sessionId, "escortedOut");
  if (toTable) {
    for (const table of state.tables.values()) {
      if (table.status === "free" && isNearTable(at, table)) {
        return { kind: "seat", customerId: toTable.id, tableId: table.id };
      }
    }
  } else if (toExit) {
    if (isNearEntrance(at)) return { kind: "farewell", customerId: toExit.id };
  } else {
    for (const customer of state.customers.values()) {
      if (!canReachCustomer(state, at, customer)) continue;
      if (customer.status === "waiting") return { kind: "lead", customerId: customer.id };
      if (customer.status === "readyToOrder") {
        return freeTicketSlot(state) === null
          ? { kind: "blocked", customerId: customer.id, reason: "Comande piene in cucina" }
          : { kind: "takeOrder", customerId: customer.id };
      }
      if (customer.status === "readyToLeave") return { kind: "escort", customerId: customer.id };
    }
  }

  for (const table of state.tables.values()) {
    const action = tableActionFor(table.status);
    if (action && isNearTable(at, table)) return { kind: "action", action, tableId: table.id };
  }
  return null;
}
