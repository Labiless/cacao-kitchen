import { useEffect, useState } from "react";
import { MENU, Message, tableLabel, type DiscardTicketMessage, type Ticket } from "@cacao/shared";
import type { KitchenRoom } from "../network.ts";

interface Props {
  room: KitchenRoom;
  onClose: () => void;
}

/** The cook reads the tickets on the rail one at a time, oldest first, and can throw them away. */
export function TicketsDialog({ room, onClose }: Props) {
  const [tickets, setTickets] = useState<Ticket[]>(() => sortedTickets(room));
  const [index, setIndex] = useState(0);

  // New tickets can arrive (or be thrown away) while the cook is reading.
  useEffect(() => {
    const sync = () => setTickets(sortedTickets(room));
    room.onStateChange(sync);
    return () => room.onStateChange.remove(sync);
  }, [room]);

  const current = Math.min(index, Math.max(0, tickets.length - 1));
  const ticket = tickets[current];

  function discard() {
    if (ticket) room.send(Message.DiscardTicket, { ticketId: ticket.id } satisfies DiscardTicketMessage);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") setIndex(Math.max(0, current - 1));
      if (event.key === "ArrowRight") setIndex(Math.min(tickets.length - 1, current + 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="backdrop">
      <div className="card dialog tickets-dialog" role="dialog" aria-label="Comande">
        <h2>Comande</h2>

        {ticket ? (
          <>
            <div className="ticket">
              <div className="ticket-header">
                <span>Comanda #{ticket.number}</span>
                <span>{tableLabel(ticket.tableId)}</span>
              </div>
              <p className="ticket-item">
                1 × {MENU[ticket.item].emoji} {MENU[ticket.item].label}
              </p>
            </div>

            <div className="ticket-nav">
              <button type="button" className="secondary" disabled={current === 0} onClick={() => setIndex(current - 1)}>
                ◀
              </button>
              <span>{current + 1} di {tickets.length}</span>
              <button
                type="button"
                className="secondary"
                disabled={current === tickets.length - 1}
                onClick={() => setIndex(current + 1)}
              >
                ▶
              </button>
            </div>
          </>
        ) : (
          <p className="hint">Nessuna comanda.</p>
        )}

        <div className="dialog-actions">
          {ticket && <button type="button" className="danger" onClick={discard}>Butta via</button>}
          <button type="button" className="secondary" onClick={onClose}>Chiudi</button>
        </div>
      </div>
    </div>
  );
}

function sortedTickets(room: KitchenRoom) {
  return [...room.state.tickets.values()].sort((a, b) => a.number - b.number);
}
