import { useEffect, useRef, useState } from "react";
import type { KitchenRoom } from "../network.ts";
import { copyToClipboard, inviteLink } from "../invite.ts";
import { createGame } from "../game/createGame.ts";
import { NameDialog } from "./NameDialog.tsx";

interface Props {
  room: KitchenRoom;
  askName: boolean;
  onNameChosen: () => void;
  onLeave: () => void;
}

export function GameView({ room, askName, onNameChosen, onLeave }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<"ok" | "error" | null>(null);

  // Phaser owns the canvas; React only mounts/unmounts it.
  useEffect(() => {
    const game = createGame(containerRef.current!, room);
    return () => game.destroy(true);
  }, [room]);

  useEffect(() => {
    room.onLeave(onLeave);
    return () => room.onLeave.remove(onLeave);
  }, [room, onLeave]);

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

      {askName && <NameDialog room={room} onDone={onNameChosen} />}
    </div>
  );
}
