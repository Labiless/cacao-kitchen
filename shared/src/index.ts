// Values that both the server and the client must agree on.
// The synced room state (Colyseus Schema) lives in ./state.ts, the dining hall layout in ./hall.ts.

export const ROOM_NAME = "kitchen";
export const MAX_PLAYERS = 2;
export const SERVER_PORT = 2567;

export const WORLD = { width: 800, height: 600 } as const;
export const PLAYER_SIZE = 40;
/** Pixels per second. */
export const PLAYER_SPEED = 220;

/** Vertical wall in the middle of the map: kitchen on the left, dining hall on the right. */
export const WALL = { x: WORLD.width / 2, thickness: 20 } as const;

export const ROLES = ["kitchen", "hall"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_INFO: Record<Role, { label: string; area: string; color: string }> = {
  kitchen: { label: "Cuoco", area: "Cucina", color: "#e8833a" },
  hall: { label: "Cameriere", area: "Sala", color: "#3aa7a3" },
};

export function isRole(value: unknown): value is Role {
  return ROLES.includes(value as Role);
}

/** Horizontal range a player's center may occupy: their own half, minus the wall. */
export function zoneFor(role: Role) {
  const half = PLAYER_SIZE / 2;
  return role === "kitchen"
    ? { minX: half, maxX: WALL.x - WALL.thickness / 2 - half }
    : { minX: WALL.x + WALL.thickness / 2 + half, maxX: WORLD.width - half };
}

export const MAX_NAME_LENGTH = 16;

export const Message = {
  Input: "input",
  SetName: "setName",
} as const;

/** Keys currently held by a player; sent to the server whenever it changes. */
export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

export interface JoinOptions {
  /** Optional: players joining from an invite link pick their name once inside. */
  name?: string;
  /** Only honored for the room creator; whoever joins next gets the other role. */
  role?: Role;
}

/** Trims and caps a player-provided name; returns "" if nothing usable is left. */
export function cleanName(raw: unknown) {
  return String(raw ?? "").trim().slice(0, MAX_NAME_LENGTH);
}

export * from "./state.ts";
export * from "./hall.ts";
