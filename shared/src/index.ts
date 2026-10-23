// Values that both the server and the client must agree on.
// The synced room state (Colyseus Schema) lives in ./state.ts.

export const ROOM_NAME = "kitchen";
export const MAX_PLAYERS = 2;
export const SERVER_PORT = 2567;

export const WORLD = { width: 800, height: 600 } as const;
export const PLAYER_SIZE = 40;
/** Pixels per second. */
export const PLAYER_SPEED = 220;

export const PLAYER_COLORS = ["#e8833a", "#3aa7a3"] as const;

export const Message = {
  Input: "input",
} as const;

/** Keys currently held by a player; sent to the server whenever it changes. */
export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

export interface JoinOptions {
  name: string;
}

export * from "./state.ts";
