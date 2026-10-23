import { useState, type FormEvent } from "react";
import { MAX_NAME_LENGTH, cleanName } from "@cacao/shared";
import { loadPlayerName } from "../playerName.ts";
import type { JoinRequest } from "../App.tsx";

interface Props {
  busy: boolean;
  error: string | null;
  onConnect: (request: JoinRequest, name: string) => void;
}

export function Lobby({ busy, error, onConnect }: Props) {
  const [name, setName] = useState(loadPlayerName);
  const [code, setCode] = useState("");

  function createRoom(event: FormEvent) {
    event.preventDefault();
    onConnect({ kind: "create" }, cleanName(name));
  }

  function joinRoom() {
    onConnect({ kind: "join", roomId: code.trim() }, cleanName(name));
  }

  return (
    <main className="lobby">
      <h1>Cacao Kitchen</h1>
      <form className="card" onSubmit={createRoom}>
        <label>
          Il tuo nome
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={MAX_NAME_LENGTH} placeholder="Cuoco" />
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

        {busy && <p className="hint">Connessione…</p>}
        {error && <p className="error">{error}</p>}
      </form>
    </main>
  );
}
