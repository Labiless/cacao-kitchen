import {
  PLAYER_SIZE,
  ROLE_INFO,
  WORLD,
  overlapsHallFurniture,
  overlapsKitchenFurniture,
  overlapsTable,
  zoneFor,
  type InputState,
  type KitchenState,
  type Player,
} from "@cacao/shared";

export const NO_INPUT: InputState = { left: false, right: false, up: false, down: false };

/** Moves the player for one tick of held keys, within their side of the map and around the furniture. */
export function movePlayer(state: KitchenState, player: Player, input: InputState, dt: number) {
  let dx = Number(input.right) - Number(input.left);
  let dy = Number(input.down) - Number(input.up);
  if (dx === 0 && dy === 0) return;

  // Normalize so diagonal movement isn't faster.
  const length = Math.hypot(dx, dy);
  dx /= length;
  dy /= length;

  // One axis at a time, so a player blocked by an obstacle can still slide along it.
  const zone = zoneFor(player.role);
  const half = PLAYER_SIZE / 2;
  const speed = ROLE_INFO[player.role].speed;
  const nextX = clamp(player.x + dx * speed * dt, zone.minX, zone.maxX);
  if (!hitsObstacle(state, nextX, player.y)) player.x = nextX;
  const nextY = clamp(player.y + dy * speed * dt, half, WORLD.height - half);
  if (!hitsObstacle(state, player.x, nextY)) player.y = nextY;
}

/** In the middle of their side of the map. */
export function moveToStart(player: Player) {
  const zone = zoneFor(player.role);
  player.x = (zone.minX + zone.maxX) / 2;
  player.y = WORLD.height / 2;
}

function hitsObstacle(state: KitchenState, x: number, y: number) {
  if (overlapsKitchenFurniture({ x, y }, state.appliances.values()) || overlapsHallFurniture({ x, y })) return true;
  for (const table of state.tables.values()) {
    if (overlapsTable({ x, y }, table)) return true;
  }
  return false;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
