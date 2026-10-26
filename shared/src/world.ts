// Base dimensions, kept in their own module so the other shared files can import them
// without a circular dependency on index.ts.

export const WORLD = { width: 800, height: 600 } as const;
export const PLAYER_SIZE = 40;
/** Pixels per second: the cook's speed (see ROLE_INFO). */
export const PLAYER_SPEED = 300;
/** Pixels per second: the waiter has more ground to cover. */
export const WAITER_SPEED = 340;

/** Vertical wall splitting the map: a compact kitchen on the left, the bigger dining hall on the right. */
export const WALL = { x: 300, thickness: 20 } as const;

/** Max gap (px) between a player's edge and a target's edge to interact with it. */
export const INTERACT_DISTANCE = 24;

export interface Point {
  x: number;
  y: number;
}

/** A rectangle by its center and size, like furniture. */
export interface Box extends Point {
  width: number;
  height: number;
}

/** Whether two boxes overlap (touching edges don't count). */
export function boxesOverlap(a: Box, b: Box) {
  return Math.abs(a.x - b.x) < (a.width + b.width) / 2 && Math.abs(a.y - b.y) < (a.height + b.height) / 2;
}

/** Whether a player centered at `p` would overlap the box. */
export function overlapsBox(p: Point, box: Box) {
  return Math.abs(p.x - box.x) < (PLAYER_SIZE + box.width) / 2
    && Math.abs(p.y - box.y) < (PLAYER_SIZE + box.height) / 2;
}

/** Whether a player centered at `p` is within INTERACT_DISTANCE of the box, edge to edge. */
export function isNearBox(p: Point, box: Box) {
  return Math.abs(p.x - box.x) <= (PLAYER_SIZE + box.width) / 2 + INTERACT_DISTANCE
    && Math.abs(p.y - box.y) <= (PLAYER_SIZE + box.height) / 2 + INTERACT_DISTANCE;
}
