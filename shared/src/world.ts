// Base dimensions, kept in their own module so the other shared files can import them
// without a circular dependency on index.ts.

export const WORLD = { width: 800, height: 600 } as const;
export const PLAYER_SIZE = 40;
/** Pixels per second. */
export const PLAYER_SPEED = 220;

/** Vertical wall in the middle of the map: kitchen on the left, dining hall on the right. */
export const WALL = { x: WORLD.width / 2, thickness: 20 } as const;
