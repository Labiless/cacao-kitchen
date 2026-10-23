import { useEffect, useRef, useState } from "react";
import { MAX_PLAYERS, type Player } from "@cacao/shared";
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
  const [players, setPlayers] = useState<Array<[string, Player]>>([]);
  const [copied, setCopied] = useState<"ok" | "error" | null>(null);

  // Phaser owns the canvas; React only mounts/unmounts it.
  useEffect(() => {
    const game = createGame(containerRef.current!, room);
    return () => game.destroy(true);
  }, [room]);

  useEffect(() => {
    const syncPlayers = () => setPlayers([...room.state.players.entries()]);
    room.onStateChange(syncPlayers);
    room.onLeave(onLeave);
    syncPlayers();
    return () => {
      room.onStateChange.remove(syncPlayers);
      room.onLeave.remove(onLeave);
    };
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
      <aside className="hud card">
        <div>
          <small>Codice stanza</small>
          <button className="code" title="Copia il link d'invito" onClick={copyInvite}>
            {room.roomId}
          </button>
          <p className="hint">
            {copied === "ok" ? "Link d'invito copiato!"
              : copied === "error" ? "Copia non riuscita, condividi l'URL della pagina"
              : "Clicca per copiare il link d'invito"}
          </p>
        </div>

        <div>
          <small>Giocatori {players.length}/{MAX_PLAYERS}</small>
          <ul className="players">
            {players.map(([id, p]) => (
              <li key={id}>
                <span className="swatch" style={{ background: p.color }} />
                {p.name}
                {id === room.sessionId && " (tu)"}
              </li>
            ))}
          </ul>
          {players.length < MAX_PLAYERS && <p className="hint">In attesa del secondo giocatore…</p>}
        </div>

        <p className="hint">Muoviti con WASD o le frecce</p>
        <button onClick={() => room.leave()}>Esci</button>
      </aside>

      <div className="game-container" ref={containerRef} />

      {askName && <NameDialog room={room} onDone={onNameChosen} />}
    </div>
  );
}
