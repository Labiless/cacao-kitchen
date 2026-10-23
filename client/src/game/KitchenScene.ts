import * as Phaser from "phaser";
import { Callbacks } from "@colyseus/sdk";
import { Message, PLAYER_SIZE, WORLD, type InputState, type Player } from "@cacao/shared";
import type { KitchenRoom } from "../network.ts";

interface PlayerSprite {
  body: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  /** Latest authoritative position from the server; we interpolate towards it. */
  target: { x: number; y: number };
}

/** Fraction of the remaining distance covered per frame at 60 fps. */
const SMOOTHING = 0.3;

export class KitchenScene extends Phaser.Scene {
  private sprites = new Map<string, PlayerSprite>();
  private keys!: Record<"up" | "down" | "left" | "right" | "w" | "a" | "s" | "d", Phaser.Input.Keyboard.Key>;
  private lastInput: InputState = { left: false, right: false, up: false, down: false };

  constructor(private room: KitchenRoom) {
    super("kitchen");
  }

  create() {
    this.drawFloor();

    this.keys = this.input.keyboard!.addKeys({
      up: "UP", down: "DOWN", left: "LEFT", right: "RIGHT", w: "W", a: "A", s: "S", d: "D",
    }) as typeof this.keys;

    const callbacks = Callbacks.get(this.room);
    const unsubscribe = [
      callbacks.onAdd("players", (player, sessionId) => {
        this.addPlayer(sessionId, player);
        unsubscribe.push(callbacks.onChange(player, () => {
          const sprite = this.sprites.get(sessionId);
          if (sprite) sprite.target = { x: player.x, y: player.y };
        }));
      }),
      callbacks.onRemove("players", (_player, sessionId) => this.removePlayer(sessionId)),
    ];
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => unsubscribe.forEach((off) => off()));
  }

  update(_time: number, delta: number) {
    this.sendInput();

    const t = 1 - Math.pow(1 - SMOOTHING, delta / (1000 / 60));
    for (const { body, label, target } of this.sprites.values()) {
      body.x = Phaser.Math.Linear(body.x, target.x, t);
      body.y = Phaser.Math.Linear(body.y, target.y, t);
      label.setPosition(body.x, body.y - PLAYER_SIZE / 2 - 6);
    }
  }

  private sendInput() {
    const k = this.keys;
    const input: InputState = {
      left: k.left.isDown || k.a.isDown,
      right: k.right.isDown || k.d.isDown,
      up: k.up.isDown || k.w.isDown,
      down: k.down.isDown || k.s.isDown,
    };
    const changed = (Object.keys(input) as Array<keyof InputState>).some((key) => input[key] !== this.lastInput[key]);
    if (!changed) return;

    this.lastInput = input;
    this.room.send(Message.Input, input);
  }

  private addPlayer(sessionId: string, player: Player) {
    const color = Phaser.Display.Color.HexStringToColor(player.color).color;
    const isMe = sessionId === this.room.sessionId;

    const body = this.add.rectangle(player.x, player.y, PLAYER_SIZE, PLAYER_SIZE, color);
    if (isMe) body.setStrokeStyle(3, 0x3b2a1e);

    const label = this.add
      .text(player.x, player.y, isMe ? `${player.name} (tu)` : player.name, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "14px",
        color: "#3b2a1e",
      })
      .setOrigin(0.5, 1);

    this.sprites.set(sessionId, { body, label, target: { x: player.x, y: player.y } });
  }

  private removePlayer(sessionId: string) {
    const sprite = this.sprites.get(sessionId);
    sprite?.body.destroy();
    sprite?.label.destroy();
    this.sprites.delete(sessionId);
  }

  /** Simple tiled floor so movement is visible. */
  private drawFloor() {
    const tile = 50;
    const g = this.add.graphics();
    for (let x = 0; x < WORLD.width; x += tile) {
      for (let y = 0; y < WORLD.height; y += tile) {
        g.fillStyle((x / tile + y / tile) % 2 === 0 ? 0xf6efe4 : 0xede3d3);
        g.fillRect(x, y, tile, tile);
      }
    }
  }
}
