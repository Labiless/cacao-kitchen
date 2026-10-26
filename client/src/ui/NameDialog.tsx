import { useState, type FormEvent } from "react";
import { MAX_NAME_LENGTH, Message, ROLE_INFO, cleanName } from "@cacao/shared";
import type { KitchenRoom } from "../network.ts";
import { loadPlayerName, savePlayerName } from "../playerName.ts";

interface Props {
  room: KitchenRoom;
  onDone: () => void;
}

export function NameDialog({ room, onDone }: Props) {
  const [name, setName] = useState(loadPlayerName);
  const role = room.state.players.get(room.sessionId)?.role;

  function submit(event: FormEvent) {
    event.preventDefault();
    const cleaned = cleanName(name);
    if (!cleaned) return;
    room.send(Message.SetName, cleaned);
    savePlayerName(cleaned);
    onDone();
  }

  return (
    <div className="backdrop">
      <form className="card dialog" role="dialog" aria-label="Il tuo nome" onSubmit={submit}>
        <h2>Benvenuto!</h2>
        {role && (
          <p className="hint">
            Sarai il <strong>{ROLE_INFO[role].label.toLowerCase()}</strong>: lavori in {ROLE_INFO[role].area.toLowerCase()}.
          </p>
        )}
        <label>
          Come ti chiami?
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_NAME_LENGTH}
            placeholder="Cuoco"
          />
        </label>
        <button type="submit" disabled={!cleanName(name)}>Entra in gioco</button>
      </form>
    </div>
  );
}
