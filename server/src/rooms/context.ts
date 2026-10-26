import type { Client, Clock } from "colyseus";
import type { KitchenState } from "@cacao/shared";

/** What the parts of the room share: the synced state, the room clock and a way to message every client. */
export interface RoomContext {
  state: KitchenState;
  clock: Clock;
  broadcast(type: string, message: unknown): void;
}

export type MessageHandler<T> = (client: Client, message: T) => void;

/** Registers a handler for a client message. */
export type OnMessage = <T>(type: string, handler: MessageHandler<T>) => void;
