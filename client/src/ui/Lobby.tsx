import { useState, type FormEvent } from "react";
import { ROOM_NAME, type JoinOptions, type KitchenState } from "@cacao/shared";
import { client, waitForState, type KitchenRoom } from "../network.ts";

interface Props {
  onJoined: (room: KitchenRoom) => void;
}

export function Lobby({ onJoined }: Props) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect(join: (options: JoinOptions) => Promise<KitchenRoom>) {
    setBusy(true);
    setError(null);
    try {
      onJoined(await waitForState(await join({ name })));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  function createRoom(event: FormEvent) {
    event.preventDefault();
    connect((options) => client.create<KitchenState>(ROOM_NAME, options));
  }

  function joinRoom() {
    connect((options) => client.joinById<KitchenState>(code.trim(), options));
  }

  return (
    <main className="lobby">
      <h1>Cacao Kitchen</h1>
      <form className="card" onSubmit={createRoom}>
        <label>
          Il tuo nome
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={16} placeholder="Cuoco" />
        </label>

        <button type="submit" disabled={busy}>Crea stanza</button>

        <div className="divider">oppure</div>

        <label>
          Codice stanza
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="es. aB3xYz9Q" />
        </label>
        <button type="button" disabled={busy || !code.trim()} onClick={joinRoom}>
          Entra
        </button>

        {error && <p className="error">{error}</p>}
      </form>
    </main>
  );
}
