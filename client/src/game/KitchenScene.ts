import * as Phaser from "phaser";
import { Callbacks } from "@colyseus/sdk";
import {
  ACTIONS,
  CUSTOMER_COLOR,
  CUSTOMER_SIZE,
  ENTRANCE,
  Message,
  PLAYER_SIZE,
  ROLE_INFO,
  TABLE_SIZE,
  TABLE_STATUS_INFO,
  WALL,
  WORLD,
  availableInteraction,
  interactionLabel,
  type Customer,
  type InputState,
  type Interaction,
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

interface CustomerSprite {
  body: Phaser.GameObjects.Arc;
  target: { x: number; y: number };
}

interface TableSprite {
  body: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

/** Draw order: floor < tables < people < labels and bars. */
const Depth = { Table: 1, Player: 2, Label: 3 } as const;

const TEXT_STYLE = { fontFamily: "system-ui, sans-serif", color: "#3b2a1e" } as const;
const HIGHLIGHT = { width: 4, color: 0xfff3c4 } as const;

/** Fraction of the remaining distance covered per frame at 60 fps. */
const SMOOTHING = 0.3;

export class KitchenScene extends Phaser.Scene {
  private sprites = new Map<string, PlayerSprite>();
  private customers = new Map<string, CustomerSprite>();
  private tables = new Map<string, TableSprite>();
  /** Local time (scene clock) at which each player's current action started, to animate its progress bar. */
  private actionStartedAt = new Map<string, number>();
  private bars!: Phaser.GameObjects.Graphics;
  private hint!: Phaser.GameObjects.Text;
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
    this.input.keyboard!.on("keydown-E", () => this.interact());

    this.bars = this.add.graphics().setDepth(Depth.Label);
    this.hint = this.add
      .text(0, 0, "", { ...TEXT_STYLE, fontSize: "13px", backgroundColor: "#fffaf3", padding: { x: 6, y: 3 } })
      .setOrigin(0.5, 1)
      .setDepth(Depth.Label)
      .setVisible(false);

    const callbacks = Callbacks.get(this.room);
    // Declared up front: onAdd fires synchronously for entities already in the room.
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
        unsubscribe.push(callbacks.listen(player, "action", (action) => {
          if (action) this.actionStartedAt.set(sessionId, this.time.now);
          else this.actionStartedAt.delete(sessionId);
        }));
      }),
      callbacks.onRemove("players", (_player, sessionId) => this.removePlayer(sessionId)),

      callbacks.onAdd("tables", (table, id) => {
        this.addTable(id, table);
        unsubscribe.push(callbacks.listen(table, "status", () => this.refreshTable(id, table)));
      }),

      callbacks.onAdd("customers", (customer, id) => {
        this.addCustomer(id, customer);
        unsubscribe.push(callbacks.onChange(customer, () => {
          const sprite = this.customers.get(id);
          if (sprite) sprite.target = { x: customer.x, y: customer.y };
        }));
        unsubscribe.push(callbacks.listen(customer, "status", (status, previous) => {
          if (status === "leaving") this.showCustomerLeaving(id, previous === "seated");
        }));
      }),
      callbacks.onRemove("customers", (_customer, id) => this.removeCustomer(id)),
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
    for (const { body, target } of this.customers.values()) {
      body.x = Phaser.Math.Linear(body.x, target.x, t);
      body.y = Phaser.Math.Linear(body.y, target.y, t);
    }

    this.bars.clear();
    this.drawInteractionHint();
    this.drawActionProgress();
    this.drawPatience();
  }

  /** What E would do for the local player right now, judged from where they appear on screen. */
  private currentInteraction() {
    const mySprite = this.sprites.get(this.room.sessionId);
    if (!mySprite) return null;
    return availableInteraction(this.room.state, this.room.sessionId, mySprite.body);
  }

  private interact() {
    if (document.activeElement instanceof HTMLInputElement) return;
    if (this.currentInteraction()) this.room.send(Message.Interact);
  }

  /** Outlines what the local waiter can act on and shows which key to press. */
  private drawInteractionHint() {
    const interaction = this.currentInteraction();
    const target = interaction && this.interactionTarget(interaction);

    for (const [id, { body }] of this.tables) {
      if (target?.kind === "table" && target.id === id) body.setStrokeStyle(HIGHLIGHT.width, HIGHLIGHT.color);
      else body.setStrokeStyle();
    }
    for (const [id, { body }] of this.customers) {
      if (target?.kind === "customer" && target.id === id) body.setStrokeStyle(HIGHLIGHT.width, HIGHLIGHT.color);
      else body.setStrokeStyle();
    }

    this.hint.setVisible(!!target);
    if (interaction && target) {
      this.hint.setText(`E · ${interactionLabel(interaction)}`).setPosition(target.x, target.top - 6);
    }
  }

  /** The thing to highlight for an interaction: the customer to hook, or the table to use. */
  private interactionTarget(interaction: Interaction) {
    if (interaction.kind === "lead") {
      const sprite = this.customers.get(interaction.customerId);
      return sprite && { kind: "customer", id: interaction.customerId, x: sprite.body.x, top: sprite.body.y - CUSTOMER_SIZE / 2 - 10 };
    }
    const table = this.room.state.tables.get(interaction.tableId);
    return table && { kind: "table", id: interaction.tableId, x: table.x, top: table.y - TABLE_SIZE / 2 };
  }

  /** A bar above the target of every action in progress, so both players can see it. */
  private drawActionProgress() {
    for (const [sessionId, startedAt] of this.actionStartedAt) {
      const player = this.room.state.players.get(sessionId);
      const table = player && this.room.state.tables.get(player.actionTarget);
      if (!player?.action || !table) continue;

      const progress = Math.min(1, (this.time.now - startedAt) / ACTIONS[player.action].durationMs);
      this.drawBar(table.x, table.y - TABLE_SIZE / 2 - 10, TABLE_SIZE + 10, progress, 0x7bd389);
    }
  }

  /** Patience bar under every customer still waiting for the waiter. */
  private drawPatience() {
    for (const [id, { body }] of this.customers) {
      const customer = this.room.state.customers.get(id);
      if (customer?.status !== "waiting" && customer?.status !== "following") continue;

      const color = customer.patience > 0.5 ? 0x7bd389 : customer.patience > 0.25 ? 0xf2c14e : 0xe05a47;
      this.drawBar(body.x, body.y + CUSTOMER_SIZE / 2 + 6, CUSTOMER_SIZE + 6, customer.patience, color);
    }
  }

  private drawBar(centerX: number, y: number, width: number, progress: number, color: number) {
    const x = centerX - width / 2;
    this.bars.fillStyle(0x3b2a1e, 0.8).fillRect(x, y - 4, width, 8);
    this.bars.fillStyle(color).fillRect(x + 1, y - 3, (width - 2) * progress, 6);
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
      .text(player.x, player.y, this.labelFor(sessionId, player), { ...TEXT_STYLE, fontSize: "14px" })
      .setOrigin(0.5, 1)
      .setDepth(Depth.Label);

    this.sprites.set(sessionId, { body, label, target: { x: player.x, y: player.y } });
  }

  private labelFor(sessionId: string, player: Player) {
    return sessionId === this.room.sessionId ? `${player.name} (tu)` : player.name;
  }

  private removePlayer(sessionId: string) {
    const sprite = this.sprites.get(sessionId);
    sprite?.body.destroy();
    sprite?.label.destroy();
    this.sprites.delete(sessionId);
    this.actionStartedAt.delete(sessionId);
  }

  private addCustomer(id: string, customer: Customer) {
    const color = Phaser.Display.Color.HexStringToColor(CUSTOMER_COLOR).color;
    const body = this.add.circle(customer.x, customer.y, CUSTOMER_SIZE / 2, color).setDepth(Depth.Player);
    this.customers.set(id, { body, target: { x: customer.x, y: customer.y } });
  }

  /** Fades the customer out with a face showing how it went. */
  private showCustomerLeaving(id: string, happy: boolean) {
    const sprite = this.customers.get(id);
    if (!sprite) return;

    const face = this.add
      .text(sprite.body.x, sprite.body.y - CUSTOMER_SIZE / 2, happy ? "😊" : "😠", { fontSize: "24px" })
      .setOrigin(0.5, 1)
      .setDepth(Depth.Label);
    this.tweens.add({ targets: face, y: face.y - 30, alpha: 0, duration: 1200, onComplete: () => face.destroy() });
    this.tweens.add({ targets: sprite.body, alpha: 0, duration: 1000 });
  }

  private removeCustomer(id: string) {
    this.customers.get(id)?.body.destroy();
    this.customers.delete(id);
  }

  private addTable(id: string, table: Table) {
    const body = this.add.rectangle(table.x, table.y, TABLE_SIZE, TABLE_SIZE).setDepth(Depth.Table);
    const label = this.add
      .text(table.x, table.y + TABLE_SIZE / 2 + 4, "", { ...TEXT_STYLE, fontSize: "12px" })
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

    // Doormat where customers come in.
    g.fillStyle(0x9c3d54, 0.55);
    g.fillRect(ENTRANCE.x - 35, ENTRANCE.y - 35, 70, 70);

    const labelStyle = { ...TEXT_STYLE, fontSize: "18px", fontStyle: "bold" };
    this.add.text(WALL.x / 2, 16, ROLE_INFO.kitchen.area.toUpperCase(), labelStyle).setOrigin(0.5, 0).setAlpha(0.35);
    this.add.text((WALL.x + WORLD.width) / 2, 16, ROLE_INFO.hall.area.toUpperCase(), labelStyle).setOrigin(0.5, 0).setAlpha(0.35);
    this.add
      .text(ENTRANCE.x, ENTRANCE.y + 35, "Ingresso", { ...TEXT_STYLE, fontSize: "12px" })
      .setOrigin(0.5, 1)
      .setAlpha(0.6);
  }
}
