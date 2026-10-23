import { useEffect, useRef, useState } from "react";
import { attendedCustomer, type MenuItemId } from "@cacao/shared";
import type { KitchenRoom } from "../network.ts";
import { copyToClipboard, inviteLink } from "../invite.ts";
import { MODAL_OPEN_KEY, OPEN_TICKET_EVENT, createGame } from "../game/createGame.ts";
import { NameDialog } from "./NameDialog.tsx";
import { OrderDialog } from "./OrderDialog.tsx";
import { TicketDialog } from "./TicketDialog.tsx";

interface Props {
  room: KitchenRoom;
  askName: boolean;
  onNameChosen: () => void;
  onLeave: () => void;
}

export function GameView({ room, askName, onNameChosen, onLeave }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<ReturnType<typeof createGame> | null>(null);
  const [copied, setCopied] = useState<"ok" | "error" | null>(null);
  const [ordering, setOrdering] = useState<{ customerId: string; wants: MenuItemId } | null>(null);
  /** Ticket the cook is reading, if any. */
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);

  // Phaser owns the canvas; React only mounts/unmounts it.
  useEffect(() => {
    const game = createGame(containerRef.current!, room);
    gameRef.current = game;
    game.events.on(OPEN_TICKET_EVENT, (ticketId: string) => setOpenTicketId(ticketId));
    return () => {
      gameRef.current = null;
      game.destroy(true);
    };
  }, [room]);

  // Tell the scene when a React-only popup is open, so the player stands still.
  useEffect(() => {
    gameRef.current?.registry.set(MODAL_OPEN_KEY, openTicketId !== null);
  }, [openTicketId]);

  useEffect(() => {
    room.onLeave(onLeave);
    return () => room.onLeave.remove(onLeave);
  }, [room, onLeave]);

  // Open the order dialog while this player is taking someone's order.
  useEffect(() => {
    const sync = () => {
      const customer = attendedCustomer(room.state, room.sessionId, "ordering");
      setOrdering((current) => {
        if (current?.customerId === customer?.id) return current;
        return customer ? { customerId: customer.id, wants: customer.wants } : null;
      });
    };
    room.onStateChange(sync);
    return () => room.onStateChange.remove(sync);
  }, [room]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copyInvite() {
    try {
      await copyToClipboard(inviteLink(room.roomId));
      setCopied("ok");
    } catch {
      setCopied("error");
    }
  }

  return (
    <div className="game-layout">
      <div className="game-container" ref={containerRef} />

      <button className="room-code" title="Copia il link d'invito" onClick={copyInvite}>
        {copied === "ok" ? "Link copiato!" : copied === "error" ? "Copia non riuscita" : room.roomId}
      </button>

      {openTicketId && <TicketDialog room={room} ticketId={openTicketId} onClose={() => setOpenTicketId(null)} />}
      {ordering && <OrderDialog key={ordering.customerId} room={room} {...ordering} />}
      {askName && <NameDialog room={room} onDone={onNameChosen} />}
    </div>
  );
}
