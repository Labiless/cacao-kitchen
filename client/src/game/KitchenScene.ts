import * as Phaser from "phaser";
import { Callbacks } from "@colyseus/sdk";
import {
  Message,
  PLAYER_SIZE,
  ROLE_INFO,
  TABLE_SIZE,
  TABLE_STATUS_INFO,
  WALL,
  WORLD,
  isNearTable,
  type InputState,
  type Player,
  type Table,
} from "@cacao/shared";
import type { KitchenRoom } from "../network.ts";

interface PlayerSprite {
  body: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  /** Latest authoritative position from the server; we interpolate towards it. */
  target: { x: number; y: number };
}

interface TableSprite {
  body: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

/** Draw order: floor < tables < players < labels. */
const Depth = { Table: 1, Player: 2, Label: 3 } as const;

/** Fraction of the remaining distance covered per frame at 60 fps. */
const SMOOTHING = 0.3;

export class KitchenScene extends Phaser.Scene {
  private sprites = new Map<string, PlayerSprite>();
  private tables = new Map<string, TableSprite>();
  private keys!: Record<"up" | "down" | "left" | "right" | "w" | "a" | "s" | "d", Phaser.Input.Keyboard.Key>;
  private lastInput: InputState = { left: false, right: false, up: false, down: false };

  constructor(private room: KitchenRoom) {
    super("kitchen");
  }

  create() {
    this.drawMap();

    // No key capture: otherwise Phaser swallows these keys and they can't be typed into React inputs.
    this.keys = this.input.keyboard!.addKeys({
      up: "UP", down: "DOWN", left: "LEFT", right: "RIGHT", w: "W", a: "A", s: "S", d: "D",
    }, false) as typeof this.keys;

    const callbacks = Callbacks.get(this.room);
    // Declared up front: onAdd fires synchronously for players already in the room.
    const unsubscribe: Array<() => void> = [];
    unsubscribe.push(
      callbacks.onAdd("players", (player, sessionId) => {
        this.addPlayer(sessionId, player);
        unsubscribe.push(callbacks.onChange(player, () => {
          const sprite = this.sprites.get(sessionId);
          if (!sprite) return;
          sprite.target = { x: player.x, y: player.y };
          sprite.label.setText(this.labelFor(sessionId, player));
        }));
      }),
      callbacks.onRemove("players", (_player, sessionId) => this.removePlayer(sessionId)),
      callbacks.onAdd("tables", (table, id) => {
        this.addTable(id, table);
        unsubscribe.push(callbacks.listen(table, "status", () => this.refreshTable(id, table)));
      }),
    );
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

    this.highlightNearbyTables();
  }

  /** Outlines the tables the local waiter could interact with right now. */
  private highlightNearbyTables() {
    const me = this.room.state.players.get(this.room.sessionId);
    const mySprite = this.sprites.get(this.room.sessionId);
    for (const [id, { body }] of this.tables) {
      const table = this.room.state.tables.get(id);
      const near = me?.role === "hall" && mySprite && table && isNearTable(mySprite.body, table);
      if (near) body.setStrokeStyle(4, 0xfff3c4);
      else body.setStrokeStyle();
    }
  }

  private sendInput() {
    const k = this.keys;
    const typing = document.activeElement instanceof HTMLInputElement;
    const input: InputState = typing ? { left: false, right: false, up: false, down: false } : {
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

    const body = this.add.rectangle(player.x, player.y, PLAYER_SIZE, PLAYER_SIZE, color).setDepth(Depth.Player);
    if (isMe) body.setStrokeStyle(3, 0x3b2a1e);

    const label = this.add
      .text(player.x, player.y, this.labelFor(sessionId, player), {
        fontFamily: "system-ui, sans-serif",
        fontSize: "14px",
        color: "#3b2a1e",
      })
      .setOrigin(0.5, 1)
      .setDepth(Depth.Label);

    this.sprites.set(sessionId, { body, label, target: { x: player.x, y: player.y } });
  }

  private addTable(id: string, table: Table) {
    const body = this.add.rectangle(table.x, table.y, TABLE_SIZE, TABLE_SIZE).setDepth(Depth.Table);
    const label = this.add
      .text(table.x, table.y + TABLE_SIZE / 2 + 4, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "12px",
        color: "#3b2a1e",
      })
      .setOrigin(0.5, 0)
      .setDepth(Depth.Label);
    this.tables.set(id, { body, label });
    this.refreshTable(id, table);
  }

  private refreshTable(id: string, table: Table) {
    const sprite = this.tables.get(id);
    if (!sprite) return;
    const info = TABLE_STATUS_INFO[table.status];
    sprite.body.setFillStyle(Phaser.Display.Color.HexStringToColor(info.color).color);
    sprite.label.setText(info.label);
  }

  private labelFor(sessionId: string, player: Player) {
    return sessionId === this.room.sessionId ? `${player.name} (tu)` : player.name;
  }

  private removePlayer(sessionId: string) {
    const sprite = this.sprites.get(sessionId);
    sprite?.body.destroy();
    sprite?.label.destroy();
    this.sprites.delete(sessionId);
  }

  /** Kitchen tiles on the left, dining hall floorboards on the right, wall in between. */
  private drawMap() {
    const g = this.add.graphics();
    const tile = 50;

    for (let x = 0; x < WALL.x; x += tile) {
      for (let y = 0; y < WORLD.height; y += tile) {
        g.fillStyle((x / tile + y / tile) % 2 === 0 ? 0xf6efe4 : 0xe4d8c6);
        g.fillRect(x, y, tile, tile);
      }
    }

    const plank = 30;
    for (let y = 0; y < WORLD.height; y += plank) {
      g.fillStyle((y / plank) % 2 === 0 ? 0xd9b48f : 0xd2ab85);
      g.fillRect(WALL.x, y, WORLD.width - WALL.x, plank);
    }

    g.fillStyle(0x5a4232);
    g.fillRect(WALL.x - WALL.thickness / 2, 0, WALL.thickness, WORLD.height);

    const labelStyle = { fontFamily: "system-ui, sans-serif", fontSize: "18px", fontStyle: "bold", color: "#3b2a1e" };
    this.add.text(WALL.x / 2, 16, ROLE_INFO.kitchen.area.toUpperCase(), labelStyle).setOrigin(0.5, 0).setAlpha(0.35);
    this.add.text((WALL.x + WORLD.width) / 2, 16, ROLE_INFO.hall.area.toUpperCase(), labelStyle).setOrigin(0.5, 0).setAlpha(0.35);
  }
}
