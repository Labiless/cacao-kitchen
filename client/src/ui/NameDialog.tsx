import { useState, type FormEvent } from "react";
import { MAX_NAME_LENGTH, Message, cleanName } from "@cacao/shared";
import type { KitchenRoom } from "../network.ts";
import { loadPlayerName, savePlayerName } from "../playerName.ts";

interface Props {
  room: KitchenRoom;
  onDone: () => void;
}

export function NameDialog({ room, onDone }: Props) {
  const [name, setName] = useState(loadPlayerName);

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
      <form className="card dialog" onSubmit={submit}>
        <h2>Benvenuto in cucina!</h2>
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
