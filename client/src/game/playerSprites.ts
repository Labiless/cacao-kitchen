// The players' spritesheets and walk animations.
//
// Sheet format (one PNG per role, in client/public/sprites): a grid of FRAME_SIZE squares on a
// transparent background, feet on the bottom row of each square. One row per direction (ROWS order);
// in each row, column 0 is standing still and the next WALK_FRAMES columns are the walk cycle.

import * as Phaser from "phaser";
import { ROLE_INFO, type Role } from "@cacao/shared";

export const FRAME_SIZE = 32;
/** Pixel art is drawn at this whole-number scale, so every art pixel stays square. */
export const SPRITE_SCALE = 2;
const WALK_FRAMES = 4;
const COLUMNS = 1 + WALK_FRAMES;
const WALK_FPS = 9;

export const DIRECTIONS = ["down", "left", "right", "up"] as const;
export type Direction = (typeof DIRECTIONS)[number];

/** Texture key and file of each role's sheet. */
const SHEETS: Record<Role, { key: string; url: string }> = {
  kitchen: { key: "player-cook", url: "/sprites/cook.png" },
  hall: { key: "player-waiter", url: "/sprites/waiter.png" },
};

export function textureKey(role: Role) {
  return SHEETS[role].key;
}

/** Frame index of the still pose facing `direction`. */
export function idleFrame(direction: Direction) {
  return DIRECTIONS.indexOf(direction) * COLUMNS;
}

export function walkAnimation(role: Role, direction: Direction) {
  return `${SHEETS[role].key}-walk-${direction}`;
}

/** The direction someone moving by (dx, dy) is facing: whichever axis they move along the most. */
export function directionOf(dx: number, dy: number): Direction {
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? "left" : "right";
  return dy < 0 ? "up" : "down";
}

/** Call from the scene's preload(). */
export function loadPlayerSprites(scene: Phaser.Scene) {
  for (const { key, url } of Object.values(SHEETS)) {
    scene.load.spritesheet(key, url, { frameWidth: FRAME_SIZE, frameHeight: FRAME_SIZE });
  }
}

/**
 * Call from the scene's create(), once the sheets have loaded: makes them crisp and sets up a walk
 * animation per role and direction. A sheet that failed to load is replaced by plain colored frames,
 * so the game still runs.
 */
export function createPlayerAnimations(scene: Phaser.Scene) {
  for (const role of Object.keys(SHEETS) as Role[]) {
    const key = textureKey(role);
    if (!scene.textures.exists(key)) addPlaceholderSheet(scene, key, ROLE_INFO[role].color);
    // Sharp pixels when scaled up, for these textures only: text and shapes stay smooth.
    scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);

    for (const direction of DIRECTIONS) {
      const first = idleFrame(direction) + 1;
      if (scene.anims.exists(walkAnimation(role, direction))) continue;
      scene.anims.create({
        key: walkAnimation(role, direction),
        frames: scene.anims.generateFrameNumbers(key, { start: first, end: first + WALK_FRAMES - 1 }),
        frameRate: WALK_FPS,
        repeat: -1,
      });
    }
  }
}

/** A sheet of plain colored squares in the expected format, for when the real one is missing. */
function addPlaceholderSheet(scene: Phaser.Scene, key: string, color: string) {
  console.warn(`Sprite sheet "${key}" didn't load: using plain squares instead.`);
  const width = FRAME_SIZE * COLUMNS;
  const height = FRAME_SIZE * DIRECTIONS.length;
  const graphics = scene.make.graphics({}, false);
  graphics.fillStyle(Phaser.Display.Color.HexStringToColor(color).color);
  for (let row = 0; row < DIRECTIONS.length; row++) {
    for (let col = 0; col < COLUMNS; col++) {
      graphics.fillRect(col * FRAME_SIZE + 8, row * FRAME_SIZE + 4, FRAME_SIZE - 16, FRAME_SIZE - 4);
    }
  }
  graphics.generateTexture(key, width, height);
  graphics.destroy();

  const texture = scene.textures.get(key);
  for (let index = 0; index < COLUMNS * DIRECTIONS.length; index++) {
    const col = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    texture.add(index, 0, col * FRAME_SIZE, row * FRAME_SIZE, FRAME_SIZE, FRAME_SIZE);
  }
}
