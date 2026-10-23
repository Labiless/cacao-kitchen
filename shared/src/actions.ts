// What a player can do. Pressing E triggers whatever availableInteraction() returns:
// either an instant interaction (hooking or seating a customer) or a timed action, which
// completes after `durationMs` unless the player walks out of reach first.

import { isNearCustomer, isNearTable, type TableStatus } from "./hall.ts";
import type { KitchenState } from "./state.ts";

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
  | { kind: "action"; action: ActionId; tableId: string };

export function interactionLabel(interaction: Interaction) {
  switch (interaction.kind) {
    case "lead": return "Accompagna al tavolo";
    case "seat": return "Fai sedere";
    case "action": return ACTIONS[interaction.action].label;
  }
}

/** The customer currently following this player, if any. */
export function ledCustomer(state: KitchenState, sessionId: string) {
  for (const customer of state.customers.values()) {
    if (customer.status === "following" && customer.leaderId === sessionId) return customer;
  }
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
  if (!player || player.role !== "hall" || player.action) return null;
  const at = position ?? player;

  const led = ledCustomer(state, sessionId);
  if (led) {
    for (const table of state.tables.values()) {
      if (table.status === "free" && isNearTable(at, table)) {
        return { kind: "seat", customerId: led.id, tableId: table.id };
      }
    }
  } else {
    for (const customer of state.customers.values()) {
      if (customer.status === "waiting" && isNearCustomer(at, customer)) {
        return { kind: "lead", customerId: customer.id };
      }
    }
  }

  for (const table of state.tables.values()) {
    const action = tableActionFor(table.status);
    if (action && isNearTable(at, table)) return { kind: "action", action, tableId: table.id };
  }
  return null;
}
