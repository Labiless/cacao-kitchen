import { useEffect, useRef, useState } from "react";
import { ROOM_NAME, type JoinOptions, type KitchenState } from "@cacao/shared";
import { client, waitForState, type KitchenRoom } from "./network.ts";
import { getRoomIdFromUrl, setRoomIdInUrl } from "./invite.ts";
import { loadPlayerName, savePlayerName } from "./playerName.ts";
import { Lobby } from "./ui/Lobby.tsx";
import { GameView } from "./ui/GameView.tsx";

export type JoinRequest = { kind: "create" } | { kind: "join"; roomId: string };

export function App() {
  const [room, setRoom] = useState<KitchenRoom | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** True when the player came in through an invite link and still has to confirm a name. */
  const [askName, setAskName] = useState(false);

  async function connect(request: JoinRequest, name?: string) {
    setBusy(true);
    setError(null);
    try {
      const options: JoinOptions = { name };
      const joined = request.kind === "create"
        ? await client.create<KitchenState>(ROOM_NAME, options)
        : await client.joinById<KitchenState>(request.roomId, options);
      setRoom(await waitForState(joined));
      setRoomIdInUrl(joined.roomId);
      if (name) savePlayerName(name);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRoomIdInUrl(null);
      return false;
    } finally {
      setBusy(false);
    }
  }

  // Invite link (?room=...): join straight away, then ask for the name inside the room.
  // The ref guards against StrictMode running this effect twice in development.
  const inviteHandled = useRef(false);
  useEffect(() => {
    const roomId = getRoomIdFromUrl();
    if (!roomId || inviteHandled.current) return;
    inviteHandled.current = true;
    connect({ kind: "join", roomId }, loadPlayerName() || undefined).then((ok) => setAskName(ok));
  }, []);

  function leave() {
    setRoom(null);
    setAskName(false);
    setRoomIdInUrl(null);
  }

  return room ? (
    <GameView room={room} askName={askName} onNameChosen={() => setAskName(false)} onLeave={leave} />
  ) : (
    <Lobby busy={busy} error={error} onConnect={connect} />
  );
}
