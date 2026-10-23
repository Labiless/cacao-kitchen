import { useEffect, useRef, useState } from "react";
import { MAX_PLAYERS, type Player } from "@cacao/shared";
import type { KitchenRoom } from "../network.ts";
import { createGame } from "../game/createGame.ts";

interface Props {
  room: KitchenRoom;
  onLeave: () => void;
}

export function GameView({ room, onLeave }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [players, setPlayers] = useState<Array<[string, Player]>>([]);

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

  return (
    <div className="game-layout">
      <aside className="hud card">
        <div>
          <small>Codice stanza</small>
          <button className="code" title="Copia" onClick={() => navigator.clipboard?.writeText(room.roomId)}>
            {room.roomId}
          </button>
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
    </div>
  );
}
