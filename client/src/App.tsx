import { useState } from "react";
import type { KitchenRoom } from "./network.ts";
import { Lobby } from "./ui/Lobby.tsx";
import { GameView } from "./ui/GameView.tsx";

export function App() {
  const [room, setRoom] = useState<KitchenRoom | null>(null);

  return room ? (
    <GameView room={room} onLeave={() => setRoom(null)} />
  ) : (
    <Lobby onJoined={setRoom} />
  );
}
