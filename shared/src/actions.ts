// Timed actions: the player starts one, it completes after `durationMs`
// unless the player walks out of reach first.

import type { TableStatus } from "./hall.ts";

export const ACTIONS = {
  cleanTable: { label: "Pulisci tavolo", durationMs: 2500 },
} as const;
export type ActionId = keyof typeof ACTIONS;

/** What a waiter can do on a table in the given status, if anything. */
export function tableActionFor(status: TableStatus): ActionId | null {
  return status === "dirty" ? "cleanTable" : null;
}
