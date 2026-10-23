import { Client, type Room } from "@colyseus/sdk";
import { SERVER_PORT, type KitchenState } from "@cacao/shared";

// Defaults to the same host that served the page, so LAN play works out of the box.
const serverUrl =
  import.meta.env.VITE_SERVER_URL ?? `${location.protocol}//${location.hostname}:${SERVER_PORT}`;

export const client = new Client(serverUrl);

export type KitchenRoom = Room<any, KitchenState>;

/**
 * Joining resolves before the first state patch arrives (noticeable over a real network),
 * so wait for it before handing the room to the UI and the game.
 */
export function waitForState(room: KitchenRoom) {
  return new Promise<KitchenRoom>((resolve) => {
    if (room.state?.players) resolve(room);
    else room.onStateChange.once(() => resolve(room));
  });
}
