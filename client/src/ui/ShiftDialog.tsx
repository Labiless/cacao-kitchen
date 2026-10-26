import { Message, ROLE_INFO, SHIFT, formatMoney, type ShiftReport } from "@cacao/shared";
import type { KitchenRoom } from "../network.ts";
import { useRoomState } from "./useRoomState.ts";

interface Props {
  room: KitchenRoom;
}

/**
 * Between shifts: the report of the shift just finished (or a welcome before the first), and who is
 * ready for the next one. The next shift starts once everyone is.
 */
export function ShiftDialog({ room }: Props) {
  const day = useRoomState(room, (state) => state.shift.day);
  const money = useRoomState(room, (state) => state.money);
  const report = JSON.parse(useRoomState(room, (state) => JSON.stringify(state.shift.report.toJSON()))) as ShiftReport;
  const players = JSON.parse(useRoomState(room, (state) => JSON.stringify(
    [...state.players.entries()].map(([id, p]) => ({ id, name: p.name, role: p.role, ready: p.ready })),
  ))) as Array<{ id: string; name: string; role: keyof typeof ROLE_INFO; ready: boolean }>;
  const meReady = players.find((p) => p.id === room.sessionId)?.ready ?? false;

  const income = report.salesCents + report.tipsCents;
  const costs = report.ingredientsCents + report.improvementsCents + report.staffCents + report.billsCents;

  return (
    <div className="backdrop">
      <div className="card dialog shift-dialog" role="dialog" aria-label={day ? `Fine del turno ${day}` : "Inizio"}>
        {day === 0 ? (
          <>
            <h2>☀️ Si apre!</h2>
            <p className="hint">
              Ogni turno dura {SHIFT.durationS / 60} minuti. Soldi, elettrodomestici e ricette restano da un giorno
              all'altro, la merce no: gli ingredienti vanno ordinati ogni giorno. Alla fine del turno si pagano
              personale e bollette.
            </p>
          </>
        ) : (
          <>
            <h2>🌙 Fine del turno {day}</h2>
            <table className="report">
              <tbody>
                <tr className="report-section"><th colSpan={2}>Entrate</th></tr>
                <ReportRow label="Incassi" cents={report.salesCents} />
                <ReportRow label="Mance" cents={report.tipsCents} />
                <tr className="report-section"><th colSpan={2}>Uscite</th></tr>
                <ReportRow label="Ordini di merce" cents={-report.ingredientsCents} />
                <ReportRow label="Migliorie (elettrodomestici, ricette)" cents={-report.improvementsCents} />
                <ReportRow label="Personale" cents={-report.staffCents} />
                <ReportRow label="Bollette" cents={-report.billsCents} />
                <tr className="report-total">
                  <th>Risultato del turno</th>
                  <td className={income - costs < 0 ? "negative" : "positive"}>{signed(income - costs)}</td>
                </tr>
                <tr className="report-total">
                  <th>In cassa</th>
                  <td className={money < 0 ? "negative" : undefined}>{formatMoney(money)}</td>
                </tr>
              </tbody>
            </table>
            <p className="hint">
              😊 {report.paid} {report.paid === 1 ? "cliente ha pagato" : "clienti hanno pagato"} · 😠 {report.lost}{" "}
              {report.lost === 1 ? "è andato via scontento" : "sono andati via scontenti"}
            </p>
          </>
        )}

        <ul className="ready-list">
          {players.map((p) => (
            <li key={p.id}>
              <span style={{ color: ROLE_INFO[p.role].color }}>●</span> {p.name}
              {p.id === room.sessionId && " (tu)"}
              <span className={p.ready ? "badge" : "badge waiting"}>{p.ready ? "Pronto" : "In attesa"}</span>
            </li>
          ))}
        </ul>

        <div className="dialog-actions">
          <button type="button" disabled={meReady} onClick={() => room.send(Message.Ready)}>
            {meReady ? "In attesa degli altri…" : `Inizia il turno ${day + 1}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReportRow({ label, cents }: { label: string; cents: number }) {
  return (
    <tr>
      <th>{label}</th>
      <td className={cents < 0 ? "negative" : cents > 0 ? "positive" : undefined}>{signed(cents)}</td>
    </tr>
  );
}

/** "+3,50 €", "−3,50 €", or plain for zero. */
function signed(cents: number) {
  if (cents === 0) return formatMoney(0);
  return `${cents > 0 ? "+" : "−"}${formatMoney(Math.abs(cents))}`;
}
