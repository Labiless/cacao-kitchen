// What the scene's views share: draw order, text style, highlight and bar colors, and the context
// each view gets from the scene.

import type * as Phaser from "phaser";
import { Callbacks } from "@colyseus/sdk";
import type { Role } from "@cacao/shared";
import type { KitchenRoom } from "../network.ts";
import type { SoundName } from "./Sounds.ts";

/** Draw order: floor < tables < people < labels and bars < placement overlay. */
export const Depth = { Table: 1, Player: 2, Label: 3, Overlay: 4 } as const;

export const TEXT_STYLE = { fontFamily: "system-ui, sans-serif", color: "#3b2a1e" } as const;
export const HIGHLIGHT = { width: 4, color: 0xfff3c4 } as const;

/** Fraction of the remaining distance covered per frame at 60 fps, when sprites catch up with the server. */
export const SMOOTHING = 0.3;

/** Green while there's plenty left, then yellow, then red: for patience and freshness bars. */
export function levelColor(fraction: number) {
  return fraction > 0.5 ? 0x7bd389 : fraction > 0.25 ? 0xf2c14e : 0xe05a47;
}

/** Progress, patience and freshness bars, all redrawn every frame on one Graphics object. */
export class Bars {
  constructor(private graphics: Phaser.GameObjects.Graphics) {}

  clear() {
    this.graphics.clear();
  }

  draw(centerX: number, y: number, width: number, progress: number, color: number, height = 8) {
    const x = centerX - width / 2;
    this.graphics.fillStyle(0x3b2a1e, 0.8).fillRect(x, y - height / 2, width, height);
    this.graphics.fillStyle(color).fillRect(x + 1, y - height / 2 + 1, (width - 2) * progress, height - 2);
  }
}

/** What the thing the local player can act on is, and where its edges are, to outline it and place the hint. */
export interface Target {
  kind: string;
  id: string;
  x: number;
  top: number;
  bottom: number;
}

export function roomCallbacks(room: KitchenRoom) {
  return Callbacks.get(room);
}
/** State callbacks for the room (Colyseus Callbacks.get), shared by the scene's views. */
export type RoomCallbacks = ReturnType<typeof roomCallbacks>;

/** Stops listening to a state callback. */
export type Unsubscribe = () => void;

/** What every view gets from the scene. */
export interface ViewContext {
  scene: Phaser.Scene;
  room: KitchenRoom;
  bars: Bars;
  /** Whether the local player works on this side: each player only sees the details of their own side. */
  sees(area: Role): boolean;
  /** Plays a sound for whoever works on `side` (null: both), panned to where it happens on the map. */
  playSound(name: SoundName, side: Role | null, x?: number): void;
  /** Stereo position for something at `x` on the map. */
  panFor(x: number): number;
  /** False while the room's existing state is being replayed on joining: only live changes make a sound. */
  isLive(): boolean;
}

/** Outlines `shape` if it's the target, or restores its normal outline. */
export function outline(
  shape: Phaser.GameObjects.Shape,
  highlighted: boolean,
  normal: { width: number; color: number } | null = null,
) {
  if (highlighted) shape.setStrokeStyle(HIGHLIGHT.width, HIGHLIGHT.color);
  else if (normal) shape.setStrokeStyle(normal.width, normal.color);
  else shape.setStrokeStyle();
}
