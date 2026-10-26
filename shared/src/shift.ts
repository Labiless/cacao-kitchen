// Shifts: a working day on the clock, then closing time, then the end-of-shift report.

/**
 * break   → between shifts: the report of the one just finished (or the welcome before the first),
 *           until every player says they're ready
 * open    → on the clock: customers come in
 * closing → time's up: nobody new comes in, the shift ends once everyone inside has left and the
 *           tables are clean
 */
export const SHIFT_PHASES = ["break", "open", "closing"] as const;
export type ShiftPhase = (typeof SHIFT_PHASES)[number];

export const SHIFT = {
  /** How long the restaurant stays open to new customers. */
  durationS: 300,
  /** Wages of the cook and the waiter, paid at the end of every shift. */
  staffCents: 2000,
  /** Electricity, paid at the end of every shift for each appliance, the fridge included. */
  billPerApplianceCents: 100,
  /** Largest tip, as a share of the bill: left by a customer served with all their patience intact. */
  maxTipRate: 0.2,
} as const;

/** What a customer tips for a dish, given how much patience they had left when it arrived; in 10-cent steps. */
export function tipFor(priceCents: number, patience: number) {
  return Math.round((priceCents * SHIFT.maxTipRate * Math.max(0, Math.min(1, patience))) / 10) * 10;
}

/** "4:05" */
export function formatClock(seconds: number) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
