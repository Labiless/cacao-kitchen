import { useEffect, useState } from "react";
import { MENU, Message, tableLabel, type DiscardTicketMessage } from "@cacao/shared";
import type { KitchenRoom } from "../network.ts";
import { RecipeSteps } from "./RecipeSteps.tsx";

interface Props {
  room: KitchenRoom;
  ticketId: string;
  onClose: () => void;
}

/** What one ticket on the wall says. Closing it leaves nothing on screen: to check again, walk back. */
export function TicketDialog({ room, ticketId, onClose }: Props) {
  const [ticket, setTicket] = useState(() => room.state.tickets.get(ticketId));

  // Closes itself once the ticket is gone (thrown away from here).
  useEffect(() => {
    const sync = () => {
      const current = room.state.tickets.get(ticketId);
      if (current) setTicket(current);
      else onClose();
    };
    room.onStateChange(sync);
    return () => room.onStateChange.remove(sync);
  }, [room, ticketId, onClose]);

  function discard() {
    room.send(Message.DiscardTicket, { ticketId } satisfies DiscardTicketMessage);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!ticket) return null;

  return (
    <div className="backdrop">
      <div className="card dialog ticket-dialog" role="dialog" aria-label={`Comanda #${ticket.number}`}>
        <div className="ticket">
          <div className="ticket-header">
            <span>Comanda #{ticket.number}</span>
            <span>{tableLabel(ticket.tableId)}</span>
          </div>
          <p className="ticket-item">
            1 × {MENU[ticket.item].emoji} {MENU[ticket.item].label}
          </p>
          <RecipeSteps dish={ticket.item} />
        </div>

        <div className="dialog-actions">
          <button type="button" className="danger" onClick={discard}>Butta via</button>
          <button type="button" className="secondary" onClick={onClose}>Chiudi</button>
        </div>
      </div>
    </div>
  );
}
