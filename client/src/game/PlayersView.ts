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

interface PlayerSprite {
  body: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  /** What they're carrying. */
  held: Phaser.GameObjects.Text;
  /** Latest authoritative position from the server; we interpolate towards it. */
  target: { x: number; y: number };
}

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

  /** Players catch up with where the server says they are; what they carry follows them. */
  update(delta: number) {
    const { room } = this.ctx;
    const t = 1 - Math.pow(1 - SMOOTHING, delta / (1000 / 60));
    for (const [sessionId, { body, label, held, target }] of this.sprites) {
      body.x = Phaser.Math.Linear(body.x, target.x, t);
      body.y = Phaser.Math.Linear(body.y, target.y, t);
      label.setPosition(body.x, body.y - PLAYER_SIZE / 2 - 6);
      // setText is a no-op when nothing changed; `holding` is a list, so it's simplest to check every frame.
      const player = room.state.players.get(sessionId);
      if (player) held.setText(this.heldIcon(player)).setAlpha(isHalfMade(player.holding[0]) ? 0.55 : 1);
      held.setPosition(body.x + PLAYER_SIZE / 2 - 4, body.y + PLAYER_SIZE / 2 - 4);
    }

    const me = room.state.players.get(room.sessionId);
    const carried = me?.holding.length ?? 0;
    if (carried > this.heldCount) this.ctx.playSound("pickUp", null, me?.x);
    this.heldCount = carried;
  }

  /** Where the local player is drawn right now: what E would do is judged from here. */
  myPosition() {
    const sprite = this.sprites.get(this.ctx.room.sessionId);
    return sprite && { x: sprite.body.x, y: sprite.body.y };
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
    for (const [sessionId, { body }] of this.sprites) {
      const player = ctx.room.state.players.get(sessionId);
      if (player?.role === "kitchen" && heldDish(player.holding)) {
        ctx.bars.draw(body.x, body.y + PLAYER_SIZE / 2 + 6, PLAYER_SIZE, player.freshness, levelColor(player.freshness), 5);
      }
    }
  }

  private addPlayer(sessionId: string, player: Player) {
    const { scene, room } = this.ctx;
    const color = Phaser.Display.Color.HexStringToColor(player.color).color;

    const body = scene.add.rectangle(player.x, player.y, PLAYER_SIZE, PLAYER_SIZE, color).setDepth(Depth.Player);
    if (sessionId === room.sessionId) body.setStrokeStyle(3, 0x3b2a1e);

    const label = scene.add
      .text(player.x, player.y, this.labelFor(sessionId, player), { ...TEXT_STYLE, fontSize: "14px" })
      .setOrigin(0.5, 1)
      .setDepth(Depth.Label);
    const held = scene.add.text(0, 0, this.heldIcon(player), { fontSize: "20px" }).setOrigin(0.5).setDepth(Depth.Label);

    this.sprites.set(sessionId, { body, label, held, target: { x: player.x, y: player.y } });
  }

  private removePlayer(sessionId: string) {
    const sprite = this.sprites.get(sessionId);
    sprite?.body.destroy();
    sprite?.label.destroy();
    sprite?.held.destroy();
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
