import * as Phaser from "phaser";
import { Callbacks } from "@colyseus/sdk";
import {
  ACTIONS,
  CUSTOMER_COLOR,
  CUSTOMER_SIZE,
  CUSTOMER_TIMING,
  ENTRANCE,
  FRIDGE,
  MENU,
  PASS,
  PASS_CAPACITY,
  QUEUE_SPOTS,
  RECIPES,
  REGISTER,
  STOVE,
  Message,
  PLAYER_SIZE,
  ROLE_INFO,
  TABLE_SIZE,
  TABLE_STATUS_INFO,
  TICKET_SLOTS,
  TICKET_SLOT_SIZE,
  WALL,
  WORLD,
  attendedCustomer,
  availableInteraction,
  formatMoney,
  heldItemInfo,
  isMenuItem,
  interactionLabel,
  type Customer,
  type CustomerStatus,
  type InputState,
  type Interaction,
  type Player,
  type Table,
} from "@cacao/shared";
import type { KitchenRoom } from "../network.ts";

interface PlayerSprite {
  body: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  /** What they're carrying. */
  held: Phaser.GameObjects.Text;
  /** Latest authoritative position from the server; we interpolate towards it. */
  target: { x: number; y: number };
}

interface CustomerSprite {
  body: Phaser.GameObjects.Arc;
  /** Shows what the customer is up to, e.g. a raised hand when ready to order. */
  icon: Phaser.GameObjects.Text;
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

const NO_INPUT: InputState = { left: false, right: false, up: false, down: false };

/** A popup that only exists in React, opened from the scene. */
export type KitchenPopup = { kind: "ticket"; ticketId: string } | { kind: "fridge" } | { kind: "stove" };
/** Game event asking React to open a popup; the payload is a KitchenPopup. */
export const OPEN_POPUP_EVENT = "openPopup";
/** Registry key React sets while one of its popups is open, so the scene ignores movement and E. */
export const MODAL_OPEN_KEY = "modalOpen";

/** Fraction of the remaining distance covered per frame at 60 fps. */
const SMOOTHING = 0.3;

export class KitchenScene extends Phaser.Scene {
  private sprites = new Map<string, PlayerSprite>();
  private customers = new Map<string, CustomerSprite>();
  private tables = new Map<string, TableSprite>();
  /** Blank slips on the wall, by ticket id: the cook sees where tickets are, not what they say. */
  private tickets = new Map<string, Phaser.GameObjects.Rectangle>();
  private fridge!: Phaser.GameObjects.Rectangle;
  private stove!: Phaser.GameObjects.Rectangle;
  /** Flame while cooking, the dish once it's ready. */
  private stoveIcon!: Phaser.GameObjects.Text;
  /** Local time (scene clock) at which the current dish started cooking, to animate its progress bar. */
  private stoveStartedAt = 0;
  private pass!: Phaser.GameObjects.Rectangle;
  private register!: Phaser.GameObjects.Rectangle;
  /** One icon per spot on the pass. */
  private passDishes: Phaser.GameObjects.Text[] = [];
  /** What the pass icons currently show, to redraw only when it changes. */
  private shownPass = "";
  /** Local time (scene clock) at which each player's current action started, to animate its progress bar. */
  private actionStartedAt = new Map<string, number>();
  private bars!: Phaser.GameObjects.Graphics;
  private hint!: Phaser.GameObjects.Text;
  private keys!: Record<"up" | "down" | "left" | "right" | "w" | "a" | "s" | "d", Phaser.Input.Keyboard.Key>;
  private lastInput: InputState = NO_INPUT;

  constructor(private room: KitchenRoom) {
    super("kitchen");
  }

  create() {
    this.drawMap();
    this.fridge = this.add
      .rectangle(FRIDGE.x, FRIDGE.y, FRIDGE.width, FRIDGE.height, 0xcfe6ef)
      .setDepth(Depth.Table);
    this.stove = this.add
      .rectangle(STOVE.x, STOVE.y, STOVE.width, STOVE.height, 0x4a4a4f)
      .setDepth(Depth.Table);
    const burners = this.add.graphics().setDepth(Depth.Table);
    burners.lineStyle(3, 0x2a2a2e);
    for (const [dx, dy] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) {
      burners.strokeCircle(STOVE.x + dx, STOVE.y + dy, 8);
    }
    this.stoveIcon = this.add.text(STOVE.x, STOVE.y, "", { fontSize: "26px" }).setOrigin(0.5).setDepth(Depth.Label);

    this.register = this.add
      .rectangle(REGISTER.x, REGISTER.y, REGISTER.width, REGISTER.height, 0x3f6b4f)
      .setDepth(Depth.Table);
    this.add
      .text(REGISTER.x, REGISTER.y, "CASSA", { ...TEXT_STYLE, fontSize: "12px", fontStyle: "bold", color: "#f6efe4" })
      .setOrigin(0.5)
      .setDepth(Depth.Table);

    // The pass cuts through the wall, so it's drawn on top of it.
    this.pass = this.add.rectangle(PASS.x, PASS.y, PASS.width, PASS.height, 0xc89b6d).setDepth(Depth.Table);
    const spacing = PASS.height / PASS_CAPACITY;
    for (let i = 0; i < PASS_CAPACITY; i++) {
      const y = PASS.y - PASS.height / 2 + spacing * (i + 0.5);
      this.passDishes.push(this.add.text(PASS.x, y, "", { fontSize: "16px" }).setOrigin(0.5).setDepth(Depth.Label));
    }
    this.add
      .text(FRIDGE.x, FRIDGE.y, "FRIGO", { ...TEXT_STYLE, fontSize: "11px", fontStyle: "bold" })
      .setOrigin(0.5)
      .setAngle(-90)
      .setAlpha(0.6)
      .setDepth(Depth.Table);

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
          sprite.held.setText(this.heldIcon(player));
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
        unsubscribe.push(callbacks.listen(customer, "status", (status) => {
          this.refreshCustomerIcon(id, customer);
          if (status === "leaving") this.showCustomerLeaving(id, customer.patience > 0);
        }));
      }),
      callbacks.onRemove("customers", (_customer, id) => this.removeCustomer(id)),

      callbacks.listen("money", (money, previous) => {
        if (previous !== undefined && money > previous) this.showMoneyIn(money - previous);
      }),

      callbacks.listen(this.room.state.stove, "status", (status) => {
        if (status === "cooking") this.stoveStartedAt = this.time.now;
        this.refreshStoveIcon();
      }),

      callbacks.onAdd("tickets", (ticket, id) => {
        const { x, y } = TICKET_SLOTS[ticket.slot];
        const slip = this.add.rectangle(x, y, TICKET_SLOT_SIZE - 8, TICKET_SLOT_SIZE - 4, 0xfffdf6).setDepth(Depth.Table);
        this.tickets.set(id, slip);
      }),
      callbacks.onRemove("tickets", (_ticket, id) => {
        this.tickets.get(id)?.destroy();
        this.tickets.delete(id);
      }),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => unsubscribe.forEach((off) => off()));
  }

  update(_time: number, delta: number) {
    this.sendInput();

    const t = 1 - Math.pow(1 - SMOOTHING, delta / (1000 / 60));
    for (const { body, label, held, target } of this.sprites.values()) {
      body.x = Phaser.Math.Linear(body.x, target.x, t);
      body.y = Phaser.Math.Linear(body.y, target.y, t);
      label.setPosition(body.x, body.y - PLAYER_SIZE / 2 - 6);
      held.setPosition(body.x + PLAYER_SIZE / 2 - 4, body.y + PLAYER_SIZE / 2 - 4);
    }
    for (const { body, icon, target } of this.customers.values()) {
      body.x = Phaser.Math.Linear(body.x, target.x, t);
      body.y = Phaser.Math.Linear(body.y, target.y, t);
      icon.setPosition(body.x + CUSTOMER_SIZE / 2 + 2, body.y - CUSTOMER_SIZE / 2);
    }

    this.refreshPass();
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
    if (document.activeElement instanceof HTMLInputElement || this.registry.get(MODAL_OPEN_KEY)) return;
    const interaction = this.currentInteraction();
    if (!interaction || interaction.kind === "blocked") return;
    if (interaction.kind === "readTicket") this.openPopup({ kind: "ticket", ticketId: interaction.ticketId });
    else if (interaction.kind === "openFridge") this.openPopup({ kind: "fridge" });
    else if (interaction.kind === "openStove") this.openPopup({ kind: "stove" });
    else this.room.send(Message.Interact);
  }

  private openPopup(popup: KitchenPopup) {
    this.game.events.emit(OPEN_POPUP_EVENT, popup);
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
    if (target?.kind === "fridge") this.fridge.setStrokeStyle(HIGHLIGHT.width, HIGHLIGHT.color);
    else this.fridge.setStrokeStyle(2, 0x9bbfcc);
    if (target?.kind === "stove") this.stove.setStrokeStyle(HIGHLIGHT.width, HIGHLIGHT.color);
    else this.stove.setStrokeStyle();
    if (target?.kind === "pass") this.pass.setStrokeStyle(HIGHLIGHT.width, HIGHLIGHT.color);
    else this.pass.setStrokeStyle(2, 0x8a5a3b);
    if (target?.kind === "register") this.register.setStrokeStyle(HIGHLIGHT.width, HIGHLIGHT.color);
    else this.register.setStrokeStyle();

    for (const [id, slip] of this.tickets) {
      if (target?.kind === "ticket" && target.id === id) slip.setStrokeStyle(3, 0xe8833a);
      else slip.setStrokeStyle(1, 0xb9a88f);
    }

    this.hint.setVisible(!!target);
    if (interaction && target) {
      const key = interaction.kind === "blocked" ? "⛔" : "E ·";
      this.hint.setText(`${key} ${interactionLabel(interaction)}`);
      // Things on the top wall have no room above them: show the hint underneath instead.
      if (target.top < 40) this.hint.setOrigin(0.5, 0).setPosition(target.x, target.bottom + 6);
      else this.hint.setOrigin(0.5, 1).setPosition(target.x, target.top - 6);
    }
  }

  /** The thing to highlight for an interaction (a customer, a table, a ticket, a station, the till) and where its edges are. */
  private interactionTarget(interaction: Interaction) {
    if (interaction.kind === "readTicket") {
      const slip = this.tickets.get(interaction.ticketId);
      if (!slip) return null;
      const half = TICKET_SLOT_SIZE / 2;
      return { kind: "ticket", id: interaction.ticketId, x: slip.x, top: slip.y - half, bottom: slip.y + half };
    }
    if (interaction.kind === "openFridge" || interaction.kind === "putBack") {
      return { kind: "fridge", id: "", x: FRIDGE.x, top: FRIDGE.y - FRIDGE.height / 2, bottom: FRIDGE.y + FRIDGE.height / 2 };
    }
    if (
      interaction.kind === "openStove" || interaction.kind === "takeDish"
      || (interaction.kind === "blocked" && interaction.station === "stove")
    ) {
      return { kind: "stove", id: "", x: STOVE.x, top: STOVE.y - STOVE.height / 2, bottom: STOVE.y + STOVE.height / 2 };
    }
    if (
      interaction.kind === "placeOnPass" || interaction.kind === "takeFromPass"
      || (interaction.kind === "blocked" && interaction.station === "pass")
    ) {
      return { kind: "pass", id: "", x: PASS.x, top: PASS.y - PASS.height / 2, bottom: PASS.y + PASS.height / 2 };
    }
    if (interaction.kind === "action" && interaction.action === "checkout") {
      const half = REGISTER.height / 2;
      return { kind: "register", id: "", x: REGISTER.x, top: REGISTER.y - half, bottom: REGISTER.y + half };
    }
    if (interaction.kind === "seat" || interaction.kind === "action") {
      const tableId = interaction.kind === "seat" ? interaction.tableId : interaction.targetId;
      const table = this.room.state.tables.get(tableId);
      if (!table) return null;
      const half = TABLE_SIZE / 2;
      return { kind: "table", id: tableId, x: table.x, top: table.y - half, bottom: table.y + half };
    }
    const customerId = "customerId" in interaction ? interaction.customerId : undefined;
    const sprite = customerId && this.customers.get(customerId);
    if (!customerId || !sprite) return null;
    const { x, y } = sprite.body;
    const half = CUSTOMER_SIZE / 2;
    return { kind: "customer", id: customerId, x, top: y - half - 12, bottom: y + half };
  }

  /** A bar above the target of every action in progress and over the stove while cooking, so both players can see it. */
  private drawActionProgress() {
    for (const [sessionId, startedAt] of this.actionStartedAt) {
      const player = this.room.state.players.get(sessionId);
      if (!player?.action) continue;
      const progress = Math.min(1, (this.time.now - startedAt) / ACTIONS[player.action].durationMs);

      if (player.action === "checkout") {
        // The till sits against the top wall: draw the bar across it.
        this.drawBar(REGISTER.x, REGISTER.y + REGISTER.height / 2 - 6, REGISTER.width - 8, progress, 0x7bd389);
        continue;
      }
      const table = this.room.state.tables.get(player.actionTarget);
      if (table) this.drawBar(table.x, table.y - TABLE_SIZE / 2 - 10, TABLE_SIZE + 10, progress, 0x7bd389);
    }

    const { status, dish } = this.room.state.stove;
    if (status === "cooking" && dish) {
      const progress = Math.min(1, (this.time.now - this.stoveStartedAt) / RECIPES[dish].cookMs);
      this.drawBar(STOVE.x, STOVE.y - STOVE.height / 2 - 10, STOVE.width + 10, progress, 0xf2994a);
    }
  }

  /** Patience bar above every customer whose patience is draining. */
  private drawPatience() {
    for (const [id, { body }] of this.customers) {
      const customer = this.room.state.customers.get(id);
      if (!customer || !CUSTOMER_TIMING.patienceS[customer.status]) continue;

      const color = customer.patience > 0.5 ? 0x7bd389 : customer.patience > 0.25 ? 0xf2c14e : 0xe05a47;
      this.drawBar(body.x, body.y - CUSTOMER_SIZE / 2 - 8, CUSTOMER_SIZE + 6, customer.patience, color);
    }
  }

  private drawBar(centerX: number, y: number, width: number, progress: number, color: number) {
    const x = centerX - width / 2;
    this.bars.fillStyle(0x3b2a1e, 0.8).fillRect(x, y - 4, width, 8);
    this.bars.fillStyle(color).fillRect(x + 1, y - 3, (width - 2) * progress, 6);
  }

  private sendInput() {
    const k = this.keys;
    // Stand still while typing in a React input or while a popup is open.
    const busy = document.activeElement instanceof HTMLInputElement
      || !!this.registry.get(MODAL_OPEN_KEY)
      || !!attendedCustomer(this.room.state, this.room.sessionId, "ordering");
    const input: InputState = busy ? NO_INPUT : {
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
    const held = this.add.text(0, 0, this.heldIcon(player), { fontSize: "20px" }).setOrigin(0.5).setDepth(Depth.Label);

    this.sprites.set(sessionId, { body, label, held, target: { x: player.x, y: player.y } });
  }

  /** A "+3,50 €" floating up from the till. */
  private showMoneyIn(cents: number) {
    const text = this.add
      .text(REGISTER.x, REGISTER.y + REGISTER.height / 2, `+${formatMoney(cents)}`, {
        ...TEXT_STYLE,
        fontSize: "16px",
        fontStyle: "bold",
        color: "#2e7d4f",
      })
      .setOrigin(0.5, 0)
      .setDepth(Depth.Label);
    this.tweens.add({ targets: text, y: text.y + 30, alpha: 0, duration: 1400, onComplete: () => text.destroy() });
  }

  private refreshPass() {
    const dishes = [...this.room.state.pass];
    const key = dishes.join(",");
    if (key === this.shownPass) return;
    this.shownPass = key;
    this.passDishes.forEach((icon, i) => {
      const dish = dishes[i];
      icon.setText(isMenuItem(dish) ? MENU[dish].emoji : "");
    });
  }

  private refreshStoveIcon() {
    const { status, dish } = this.room.state.stove;
    this.stoveIcon.setText(status === "cooking" ? "🔥" : status === "ready" && dish ? MENU[dish].emoji : "");
  }

  private heldIcon(player: Player) {
    return player.holding ? heldItemInfo(player.holding).emoji : "";
  }

  private labelFor(sessionId: string, player: Player) {
    return sessionId === this.room.sessionId ? `${player.name} (tu)` : player.name;
  }

  private removePlayer(sessionId: string) {
    const sprite = this.sprites.get(sessionId);
    sprite?.body.destroy();
    sprite?.label.destroy();
    sprite?.held.destroy();
    this.sprites.delete(sessionId);
    this.actionStartedAt.delete(sessionId);
  }

  private addCustomer(id: string, customer: Customer) {
    const color = Phaser.Display.Color.HexStringToColor(CUSTOMER_COLOR).color;
    const body = this.add.circle(customer.x, customer.y, CUSTOMER_SIZE / 2, color).setDepth(Depth.Player);
    const icon = this.add.text(0, 0, "", { fontSize: "18px" }).setOrigin(0, 1).setDepth(Depth.Label);
    this.customers.set(id, { body, icon, target: { x: customer.x, y: customer.y } });
    this.refreshCustomerIcon(id, customer);
  }

  private refreshCustomerIcon(id: string, customer: Customer) {
    const icons: Partial<Record<CustomerStatus, string>> = {
      readingMenu: "📖",
      readyToOrder: "✋",
      ordering: "📝",
      waitingFood: MENU[customer.wants]?.emoji,
      eating: "😋",
      queuing: "💶",
    };
    this.customers.get(id)?.icon.setText(icons[customer.status] ?? "");
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
    this.tweens.add({ targets: [sprite.body, sprite.icon], alpha: 0, duration: 1000 });
  }

  private removeCustomer(id: string) {
    this.customers.get(id)?.body.destroy();
    this.customers.get(id)?.icon.destroy();
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

    // Pins on the kitchen wall where tickets hang.
    for (const { x, y } of TICKET_SLOTS) {
      g.fillStyle(0x6e4b33);
      g.fillRect(x - TICKET_SLOT_SIZE / 2, y - TICKET_SLOT_SIZE / 2, TICKET_SLOT_SIZE, TICKET_SLOT_SIZE);
    }

    // Exit by the till, and faint marks where the queue forms.
    g.fillStyle(0x3f6b4f);
    g.fillRect(WORLD.width - 6, REGISTER.y - REGISTER.height / 2 - 6, 6, REGISTER.height + 12);
    g.lineStyle(1, 0x8a6a4a, 0.35);
    for (const { x, y } of QUEUE_SPOTS) g.strokeCircle(x, y, CUSTOMER_SIZE / 2 + 2);

    // Doormat where customers come in.
    g.fillStyle(0x9c3d54, 0.55);
    g.fillRect(ENTRANCE.x - ENTRANCE.size / 2, ENTRANCE.y - ENTRANCE.size / 2, ENTRANCE.size, ENTRANCE.size);

    const labelStyle = { ...TEXT_STYLE, fontSize: "18px", fontStyle: "bold" };
    // Area names at the bottom: the top kitchen wall holds the tickets.
    const labelY = WORLD.height - 16;
    this.add.text(WALL.x / 2, labelY, ROLE_INFO.kitchen.area.toUpperCase(), labelStyle).setOrigin(0.5, 1).setAlpha(0.35);
    this.add.text((WALL.x + WORLD.width) / 2, labelY, ROLE_INFO.hall.area.toUpperCase(), labelStyle).setOrigin(0.5, 1).setAlpha(0.35);
    this.add
      .text(ENTRANCE.x, ENTRANCE.y + ENTRANCE.size / 2, "Ingresso", { ...TEXT_STYLE, fontSize: "12px" })
      .setOrigin(0.5, 1)
      .setAlpha(0.6);
  }
}
