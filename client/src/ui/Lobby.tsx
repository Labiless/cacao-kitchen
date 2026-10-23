import { useState, type CSSProperties, type FormEvent } from "react";
import { MAX_NAME_LENGTH, ROLES, ROLE_INFO, cleanName, type Role } from "@cacao/shared";
import { loadPlayerName } from "../playerName.ts";
import type { JoinRequest } from "../App.tsx";

interface Props {
  busy: boolean;
  error: string | null;
  onConnect: (request: JoinRequest, name: string) => void;
}

export function Lobby({ busy, error, onConnect }: Props) {
  const [name, setName] = useState(loadPlayerName);
  const [role, setRole] = useState<Role>("kitchen");
  const [code, setCode] = useState("");

  function createRoom(event: FormEvent) {
    event.preventDefault();
    onConnect({ kind: "create", role }, cleanName(name));
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

        <fieldset className="role-picker">
          <legend>Il tuo ruolo</legend>
          {ROLES.map((r) => (
            <button
              key={r}
              type="button"
              className={r === role ? "selected" : ""}
              style={{ "--role-color": ROLE_INFO[r].color } as CSSProperties}
              aria-pressed={r === role}
              onClick={() => setRole(r)}
            >
              {ROLE_INFO[r].label}
              <small>{ROLE_INFO[r].area}</small>
            </button>
          ))}
        </fieldset>

        <button type="submit" disabled={busy}>Crea stanza</button>

        <div className="divider">oppure</div>

        <label>
          Codice stanza
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="es. aB3xYz9Q" />
        </label>
        <button type="button" disabled={busy || !code.trim()} onClick={joinRoom}>
          Entra
        </button>
        <p className="hint">Chi entra con un codice prende il ruolo rimasto libero.</p>

        {busy && <p className="hint">Connessione…</p>}
        {error && <p className="error">{error}</p>}
      </form>
    </main>
  );
}
