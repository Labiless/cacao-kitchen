import { MAX_STARS, Message, ROLE_INFO, SHIFT, formatMoney, formatStars, starIcons, type ShiftReport } from "@cacao/shared";
import type { KitchenRoom } from "../network.ts";
import { useRoomState } from "./useRoomState.ts";

interface Props {
  room: KitchenRoom;
}

/**
 * Between shifts: the report of the shift just finished (or a welcome before the first), and who is
 * ready for the next one. The next shift starts once everyone is. After a shift that left the till in
 * the red, the same report as game over, with a button to start again.
 */
export function ShiftDialog({ room }: Props) {
  const day = useRoomState(room, (state) => state.shift.day);
  const gameOver = useRoomState(room, (state) => state.shift.phase === "gameOver");
  const level = useRoomState(room, (state) => state.level);
  const money = useRoomState(room, (state) => state.money);
  const stars = useRoomState(room, (state) => state.stars);
  const ratedShifts = useRoomState(room, (state) => state.ratedShifts);
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
              all'altro, la merce no: gli ingredienti vanno ordinati ogni giorno. Alla fine del turno si pagano le
              bollette: se la cassa va in rosso, il ristorante chiude. Ogni cliente che si siede lascia una recensione da 1 a 5 stelle, in base a quanto
              ha aspettato e a quanto è bella la sala (pulita e decorata): la media dei turni fa le stelle del ristorante,
              e ogni stella di chi paga fa salire di livello e imparare nuove ricette.
            </p>
          </>
        ) : (
          <>
            {gameOver ? (
              <>
                <h2>💸 Game over</h2>
                <p className="error">
                  Il turno {day} ha chiuso con la cassa in rosso: il ristorante chiude. Siete arrivati al livello {level}.
                </p>
              </>
            ) : (
              <h2>🌙 Fine del turno {day}</h2>
            )}
            <table className="report">
              <tbody>
                <tr className="report-section"><th colSpan={2}>Entrate</th></tr>
                <ReportRow label="Incassi" cents={report.salesCents} />
                <ReportRow label="Mance" cents={report.tipsCents} />
                <tr className="report-section"><th colSpan={2}>Uscite</th></tr>
                <ReportRow label="Ordini di merce" cents={-report.ingredientsCents} />
                <ReportRow label="Migliorie (elettrodomestici, decorazioni)" cents={-report.improvementsCents} />
                {/* No staff to pay yet. */}
                {report.staffCents > 0 && <ReportRow label="Personale" cents={-report.staffCents} />}
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
            <div className="shift-score">
              {report.ratingCount ? (
                <>
                  <span className="stars">{starIcons(report.ratingSum / report.ratingCount)}</span>
                  <span>
                    Voto del turno <strong>{formatStars(report.ratingSum / report.ratingCount)}</strong>/{MAX_STARS}
                    <small className="recipe">
                      {report.ratingCount} {report.ratingCount === 1 ? "recensione" : "recensioni"}
                    </small>
                  </span>
                </>
              ) : (
                <span className="hint">Nessuna recensione in questo turno.</span>
              )}
            </div>
            {ratedShifts > 0 && (
              <p className="hint">
                ⭐ Il ristorante ha {formatStars(stars)} stelle, media di {ratedShifts} {ratedShifts === 1 ? "turno" : "turni"}.
              </p>
            )}
            <p className="hint">🏅 +{report.xp} punti esperienza · livello {level}</p>
            <p className="hint">
              😊 {report.paid} {report.paid === 1 ? "cliente ha pagato" : "clienti hanno pagato"} · 😠 {report.lost}{" "}
              {report.lost === 1 ? "è andato via scontento" : "sono andati via scontenti"}
            </p>
          </>
        )}

        {!gameOver && <ul className="ready-list">
          {players.map((p) => (
            <li key={p.id}>
              <span style={{ color: ROLE_INFO[p.role].color }}>●</span> {p.name}
              {p.id === room.sessionId && " (tu)"}
              <span className={p.ready ? "badge" : "badge waiting"}>{p.ready ? "Pronto" : "In attesa"}</span>
            </li>
          ))}
        </ul>}

        <div className="dialog-actions">
          {gameOver ? (
            <button type="button" onClick={() => room.send(Message.Restart)}>↺ Ricomincia da capo</button>
          ) : (
            <button type="button" disabled={meReady} onClick={() => room.send(Message.Ready)}>
              {meReady ? "In attesa degli altri…" : `Inizia il turno ${day + 1}`}
            </button>
          )}
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
