// The characters' spritesheets (the two players and the customers) and their walk animations.
//
// Sheet format (one PNG per character, in client/public/sprites): a grid of FRAME_SIZE squares on a
// transparent background, feet on the bottom row of each square. One row per direction (DIRECTIONS
// order); in each row, column 0 is standing still and the next WALK_FRAMES columns are the walk cycle.

import * as Phaser from "phaser";
import { CUSTOMER_COLOR, ROLE_INFO, type Role } from "@cacao/shared";

export const FRAME_SIZE = 32;
/** Pixel art is drawn at this whole-number scale, so every art pixel stays square. */
export const SPRITE_SCALE = 2;
const WALK_FRAMES = 4;
const COLUMNS = 1 + WALK_FRAMES;
const WALK_FPS = 9;

export const DIRECTIONS = ["down", "left", "right", "up"] as const;
export type Direction = (typeof DIRECTIONS)[number];

interface Sheet {
  url: string;
  /** Empty rows above the character's head in every frame: where to put things above them. */
  headroom: number;
}

const SHEETS = {
  "player-cook": { url: "/sprites/cook.png", headroom: 1 },
  "player-waiter": { url: "/sprites/waiter.png", headroom: 7 },
  "customer-1": { url: "/sprites/customer-1.png", headroom: 7 },
  "customer-2": { url: "/sprites/customer-2.png", headroom: 7 },
  "customer-3": { url: "/sprites/customer-3.png", headroom: 7 },
  "customer-4": { url: "/sprites/customer-4.png", headroom: 7 },
  "customer-5": { url: "/sprites/customer-5.png", headroom: 4 },
  "customer-6": { url: "/sprites/customer-6.png", headroom: 4 },
} satisfies Record<string, Sheet>;
export type SheetKey = keyof typeof SHEETS;

const CUSTOMER_SHEETS: SheetKey[] = ["customer-1", "customer-2", "customer-3", "customer-4", "customer-5", "customer-6"];

/** Plain colors for sheets that fail to load: the players' role colors, and one for every customer. */
const FALLBACK_COLORS: Partial<Record<SheetKey, string>> = {
  "player-cook": ROLE_INFO.kitchen.color,
  "player-waiter": ROLE_INFO.hall.color,
};

export function playerSheet(role: Role): SheetKey {
  return role === "kitchen" ? "player-cook" : "player-waiter";
}

/** Which of the customer looks someone gets: picked from their id, so every player sees the same one. */
export function customerSheet(customerId: string): SheetKey {
  let hash = 0;
  for (const char of customerId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return CUSTOMER_SHEETS[hash % CUSTOMER_SHEETS.length];
}

/** How far above their feet a character's head reaches, in screen pixels. */
export function heightAboveFeet(key: SheetKey) {
  return (FRAME_SIZE - SHEETS[key].headroom) * SPRITE_SCALE;
}

/** Frame index of the still pose facing `direction`. */
export function idleFrame(direction: Direction) {
  return DIRECTIONS.indexOf(direction) * COLUMNS;
}

function walkAnimation(key: SheetKey, direction: Direction) {
  return `${key}-walk-${direction}`;
}

/** The direction someone moving by (dx, dy) is facing: whichever axis they move along the most. */
export function directionOf(dx: number, dy: number): Direction {
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? "left" : "right";
  return dy < 0 ? "up" : "down";
}

/** A character standing on its feet at (x, feetY), facing down. */
export function addCharacter(scene: Phaser.Scene, key: SheetKey, x: number, feetY: number) {
  return scene.add.sprite(x, feetY, key, idleFrame("down")).setOrigin(0.5, 1).setScale(SPRITE_SCALE);
}

/** Walks while `moving`, otherwise stands still facing `facing`. */
export function animateWalk(sprite: Phaser.GameObjects.Sprite, key: SheetKey, facing: Direction, moving: boolean) {
  if (moving) {
    sprite.play(walkAnimation(key, facing), true);
    return;
  }
  // Frames of a sheet are named by their index: compare as strings to be safe.
  if (sprite.anims.isPlaying || String(sprite.frame.name) !== String(idleFrame(facing))) {
    sprite.stop();
    sprite.setFrame(idleFrame(facing));
  }
}

/** Call from the scene's preload(). */
export function loadCharacterSprites(scene: Phaser.Scene) {
  for (const [key, { url }] of Object.entries(SHEETS)) {
    scene.load.spritesheet(key, url, { frameWidth: FRAME_SIZE, frameHeight: FRAME_SIZE });
  }
}

/**
 * Call from the scene's create(), once the sheets have loaded: makes them crisp and sets up a walk
 * animation per character and direction. A sheet that failed to load is replaced by plain colored
 * frames, so the game still runs.
 */
export function createCharacterAnimations(scene: Phaser.Scene) {
  for (const key of Object.keys(SHEETS) as SheetKey[]) {
    if (!scene.textures.exists(key)) addPlaceholderSheet(scene, key, FALLBACK_COLORS[key] ?? CUSTOMER_COLOR);
    // Sharp pixels when scaled up, for these textures only: text and shapes stay smooth.
    scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);

    for (const direction of DIRECTIONS) {
      const first = idleFrame(direction) + 1;
      if (scene.anims.exists(walkAnimation(key, direction))) continue;
      scene.anims.create({
        key: walkAnimation(key, direction),
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
  const graphics = scene.make.graphics({}, false);
  graphics.fillStyle(Phaser.Display.Color.HexStringToColor(color).color);
  for (let row = 0; row < DIRECTIONS.length; row++) {
    for (let col = 0; col < COLUMNS; col++) {
      graphics.fillRect(col * FRAME_SIZE + 8, row * FRAME_SIZE + 4, FRAME_SIZE - 16, FRAME_SIZE - 4);
    }
  }
  graphics.generateTexture(key, FRAME_SIZE * COLUMNS, FRAME_SIZE * DIRECTIONS.length);
  graphics.destroy();

  const texture = scene.textures.get(key);
  for (let index = 0; index < COLUMNS * DIRECTIONS.length; index++) {
    const col = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    texture.add(index, 0, col * FRAME_SIZE, row * FRAME_SIZE, FRAME_SIZE, FRAME_SIZE);
  }
}
