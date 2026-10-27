import * as Phaser from "phaser";
import { ACTIONS, PLAYER_SIZE, heldDish, heldItemInfo, type HeldItem, type Player } from "@cacao/shared";
import {
  Depth,
  SMOOTHING,
  TEXT_STYLE,
  levelColor,
  type RoomCallbacks,
  type Unsubscribe,
  type ViewContext,
} from "./sceneStyle.ts";
import {
  FRAME_SIZE,
  SPRITE_SCALE,
  directionOf,
  idleFrame,
  textureKey,
  walkAnimation,
  type Direction,
} from "./playerSprites.ts";

interface PlayerSprite {
  /** Where the player is drawn: the center of their collision square, catching up with the server. */
  pos: { x: number; y: number };
  /** Latest authoritative position from the server; we interpolate towards it. */
  target: { x: number; y: number };
  /** The character, standing on the bottom edge of the collision square. */
  sprite: Phaser.GameObjects.Sprite;
  /** Which way they last moved, to stand still facing that way. */
  facing: Direction;
  /** A colored patch under the local player's feet, to spot yourself at a glance. */
  marker: Phaser.GameObjects.Ellipse | null;
  label: Phaser.GameObjects.Text;
  /** What they're carrying. */
  held: Phaser.GameObjects.Text;
}

/** Below this distance (px) from where the server has them, a player counts as standing still. */
const MOVING_THRESHOLD = 1;
/** Height of the drawn character above the bottom of the collision square, for the name above their head. */
const SPRITE_HEIGHT = FRAME_SIZE * SPRITE_SCALE - 20;

/** A timed action in progress, for its progress bar. */
export interface ActionInProgress {
  player: Player;
  progress: number;
}

/** The two players: where they are, what they carry, and the timed actions they're doing. */
export class PlayersView {
  private sprites = new Map<string, PlayerSprite>();
  /** Local time (scene clock) at which each player's current action started, to animate its progress bar. */
  private actionStartedAt = new Map<string, number>();
  /** What the local player carried last frame, to hear them pick something up. */
  private heldCount = 0;

  constructor(private ctx: ViewContext) {}

  subscribe(callbacks: RoomCallbacks): Unsubscribe[] {
    const { ctx } = this;
    // Declared up front: onAdd fires synchronously for players already in the room.
    const unsubscribe: Unsubscribe[] = [];
    unsubscribe.push(
      callbacks.onAdd("players", (player, sessionId) => {
        this.addPlayer(sessionId, player);
        unsubscribe.push(callbacks.onChange(player, () => {
          const sprite = this.sprites.get(sessionId);
          if (!sprite) return;
          sprite.target = { x: player.x, y: player.y };
          sprite.label.setText(this.labelFor(sessionId, player));
        }));
        unsubscribe.push(callbacks.listen(player, "action", (action) => {
          if (action) this.actionStartedAt.set(sessionId, ctx.scene.time.now);
          else this.actionStartedAt.delete(sessionId);
          if (action === "cleanTable") ctx.playSound("wipe", "hall", player.x);
          if (action === "receiveDelivery") ctx.playSound("boxes", "kitchen", player.x);
        }));
      }),
      callbacks.onRemove("players", (_player, sessionId) => this.removePlayer(sessionId)),
    );
    return unsubscribe;
  }

  /**
   * Players catch up with where the server says they are, walking while they do and standing still
   * facing the way they went once they're there; their name and what they carry follow them.
   */
  update(delta: number) {
    const { room } = this.ctx;
    const t = 1 - Math.pow(1 - SMOOTHING, delta / (1000 / 60));
    for (const [sessionId, entry] of this.sprites) {
      const { pos, target, sprite, marker, label, held } = entry;
      const player = room.state.players.get(sessionId);
      const dx = target.x - pos.x;
      const dy = target.y - pos.y;
      const moving = Math.hypot(dx, dy) > MOVING_THRESHOLD;
      if (moving) entry.facing = directionOf(dx, dy);
      if (player && moving) sprite.play(walkAnimation(player.role, entry.facing), true);
      // Frames of a sheet are named by their index: compare as strings to be safe.
      else if (sprite.anims.isPlaying || String(sprite.frame.name) !== String(idleFrame(entry.facing))) {
        sprite.stop();
        sprite.setFrame(idleFrame(entry.facing));
      }

      pos.x = Phaser.Math.Linear(pos.x, target.x, t);
      pos.y = Phaser.Math.Linear(pos.y, target.y, t);
      const feet = pos.y + PLAYER_SIZE / 2;
      sprite.setPosition(pos.x, feet);
      marker?.setPosition(pos.x, feet - 3);
      label.setPosition(pos.x, feet - SPRITE_HEIGHT - 4);
      // setText is a no-op when nothing changed; `holding` is a list, so it's simplest to check every frame.
      if (player) held.setText(this.heldIcon(player)).setAlpha(isHalfMade(player.holding[0]) ? 0.55 : 1);
      held.setPosition(pos.x + PLAYER_SIZE / 2 - 4, pos.y + PLAYER_SIZE / 2 - 4);
    }

    const me = room.state.players.get(room.sessionId);
    const carried = me?.holding.length ?? 0;
    if (carried > this.heldCount) this.ctx.playSound("pickUp", null, me?.x);
    this.heldCount = carried;
  }

  /** Where the local player is drawn right now: what E would do is judged from here. */
  myPosition() {
    const entry = this.sprites.get(this.ctx.room.sessionId);
    return entry && { ...entry.pos };
  }

  /** Timed actions in progress, with how far along they are. */
  *actionsInProgress(): Generator<ActionInProgress> {
    for (const [sessionId, startedAt] of this.actionStartedAt) {
      const player = this.ctx.room.state.players.get(sessionId);
      if (!player?.action) continue;
      yield { player, progress: Math.min(1, (this.ctx.scene.time.now - startedAt) / ACTIONS[player.action].durationMs) };
    }
  }

  /** How long the dish in the cook's hands has left before it's thrown away (for the cook). */
  drawFreshness() {
    const { ctx } = this;
    if (!ctx.sees("kitchen")) return;
    for (const [sessionId, { pos }] of this.sprites) {
      const player = ctx.room.state.players.get(sessionId);
      if (player?.role === "kitchen" && heldDish(player.holding)) {
        ctx.bars.draw(pos.x, pos.y + PLAYER_SIZE / 2 + 6, PLAYER_SIZE, player.freshness, levelColor(player.freshness), 5);
      }
    }
  }

  private addPlayer(sessionId: string, player: Player) {
    const { scene, room } = this.ctx;
    const facing: Direction = "down";
    const feet = player.y + PLAYER_SIZE / 2;

    const sprite = scene.add
      .sprite(player.x, feet, textureKey(player.role), idleFrame(facing))
      .setOrigin(0.5, 1)
      .setScale(SPRITE_SCALE)
      .setDepth(Depth.Player);
    const color = Phaser.Display.Color.HexStringToColor(player.color).color;
    const marker = sessionId === room.sessionId
      ? scene.add.ellipse(player.x, feet - 3, PLAYER_SIZE - 4, 12, color, 0.55).setStrokeStyle(2, 0x3b2a1e).setDepth(Depth.Table)
      : null;

    const label = scene.add
      .text(player.x, player.y, this.labelFor(sessionId, player), { ...TEXT_STYLE, fontSize: "14px" })
      .setOrigin(0.5, 1)
      .setDepth(Depth.Label);
    const held = scene.add.text(0, 0, this.heldIcon(player), { fontSize: "20px" }).setOrigin(0.5).setDepth(Depth.Label);

    this.sprites.set(sessionId, {
      pos: { x: player.x, y: player.y },
      target: { x: player.x, y: player.y },
      sprite,
      facing,
      marker,
      label,
      held,
    });
  }

  private removePlayer(sessionId: string) {
    const entry = this.sprites.get(sessionId);
    entry?.sprite.destroy();
    entry?.marker?.destroy();
    entry?.label.destroy();
    entry?.held.destroy();
    this.sprites.delete(sessionId);
    this.actionStartedAt.delete(sessionId);
  }

  /** What the player is carrying: shown for yourself and for whoever works on your side. */
  private heldIcon(player: Player) {
    if (!this.ctx.sees(player.role)) return "";
    return [...player.holding].map((item) => heldItemInfo(item as HeldItem).emoji).join("");
  }

  private labelFor(sessionId: string, player: Player) {
    return sessionId === this.ctx.room.sessionId ? `${player.name} (tu)` : player.name;
  }
}

function isHalfMade(item: string | undefined) {
  return item !== undefined && heldItemInfo(item).partial;
}
