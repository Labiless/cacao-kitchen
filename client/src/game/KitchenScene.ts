import * as Phaser from "phaser";
import { Callbacks } from "@colyseus/sdk";
import {
  ACTIONS,
  CUSTOMER_COLOR,
  CUSTOMER_SIZE,
  CUSTOMER_TIMING,
  ENTRANCE,
  ENTRANCE_LINE_LENGTH,
  FRIDGE,
  MENU,
  PASS,
  PASS_CAPACITY,
  PHONE,
  QUEUE_SPOTS,
  RECIPES,
  REGISTER,
  STOVE_SIZE,
  COMPUTER,
  RECIPE_BOOK,
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
  entranceSpot,
  formatMoney,
  heldDish,
  heldItemInfo,
  isMenuItem,
  interactionLabel,
  type Customer,
  type CustomerStatus,
  type InputState,
  type Interaction,
  type DishSpoiledMessage,
  type EquipmentId,
  type HeldItem,
  type Player,
  type Role,
  type Stove,
  type Table,
} from "@cacao/shared";
import type { KitchenRoom } from "../network.ts";
import { EquipmentPlacement } from "./EquipmentPlacement.ts";

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

interface StoveSprite {
  body: Phaser.GameObjects.Rectangle;
  burners: Phaser.GameObjects.Graphics;
  /** Flame while cooking, the dish once it's ready. */
  icon: Phaser.GameObjects.Text;
  /** Local time (scene clock) at which the current dish started cooking, to animate its progress bar. */
  startedAt: number;
}

interface TableSprite {
  body: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

/** Draw order: floor < tables < people < labels and bars < placement overlay. */
const Depth = { Table: 1, Player: 2, Label: 3, Overlay: 4 } as const;

const TEXT_STYLE = { fontFamily: "system-ui, sans-serif", color: "#3b2a1e" } as const;
const HIGHLIGHT = { width: 4, color: 0xfff3c4 } as const;

const NO_INPUT: InputState = { left: false, right: false, up: false, down: false };

/** A popup that only exists in React, opened from the scene. */
export type ScenePopup =
  | { kind: "ticket"; ticketId: string }
  | { kind: "fridge" }
  | { kind: "stove"; stoveId: string }
  | { kind: "phone" }
  | { kind: "computer" }
  | { kind: "recipeBook" };
/** Game event asking React to open a popup; the payload is a ScenePopup. */
export const OPEN_POPUP_EVENT = "openPopup";
/** Game event from React to start placing bought equipment in the kitchen; the payload is an EquipmentId. */
export const START_PLACEMENT_EVENT = "startPlacement";
/** Registry key React sets while one of its popups is open, so the scene ignores movement and E. */
export const MODAL_OPEN_KEY = "modalOpen";

/** Green while there's plenty left, then yellow, then red: for patience and freshness bars. */
function levelColor(fraction: number) {
  return fraction > 0.5 ? 0x7bd389 : fraction > 0.25 ? 0xf2c14e : 0xe05a47;
}

/** Fraction of the remaining distance covered per frame at 60 fps. */
const SMOOTHING = 0.3;

export class KitchenScene extends Phaser.Scene {
  private sprites = new Map<string, PlayerSprite>();
  private customers = new Map<string, CustomerSprite>();
  private tables = new Map<string, TableSprite>();
  /** Blank slips on the wall, by ticket id: the cook sees where tickets are, not what they say. */
  private tickets = new Map<string, Phaser.GameObjects.Rectangle>();
  private fridge!: Phaser.GameObjects.Rectangle;
  private stoves = new Map<string, StoveSprite>();
  private placement!: EquipmentPlacement;
  private pass!: Phaser.GameObjects.Rectangle;
  private register!: Phaser.GameObjects.Rectangle;
  private phone!: Phaser.GameObjects.Rectangle;
  private computer!: Phaser.GameObjects.Rectangle;
  private recipeBook!: Phaser.GameObjects.Rectangle;
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

    this.register = this.add
      .rectangle(REGISTER.x, REGISTER.y, REGISTER.width, REGISTER.height, 0x3f6b4f)
      .setDepth(Depth.Table);
    this.add
      .text(REGISTER.x, REGISTER.y, "CASSA", { ...TEXT_STYLE, fontSize: "12px", fontStyle: "bold", color: "#f6efe4" })
      .setOrigin(0.5)
      .setDepth(Depth.Table);

    this.phone = this.add
      .rectangle(PHONE.x, PHONE.y, PHONE.width, PHONE.height, 0x2f3b45)
      .setDepth(Depth.Table);
    this.add.text(PHONE.x, PHONE.y, "📞", { fontSize: "16px" }).setOrigin(0.5).setDepth(Depth.Table);
    this.computer = this.add
      .rectangle(COMPUTER.x, COMPUTER.y, COMPUTER.width, COMPUTER.height, 0x2f3b45)
      .setDepth(Depth.Table);
    this.add.text(COMPUTER.x, COMPUTER.y, "💻", { fontSize: "18px" }).setOrigin(0.5).setDepth(Depth.Table);
    this.recipeBook = this.add
      .rectangle(RECIPE_BOOK.x, RECIPE_BOOK.y, RECIPE_BOOK.width, RECIPE_BOOK.height, 0x7a3b2e)
      .setDepth(Depth.Table);
    this.add.text(RECIPE_BOOK.x, RECIPE_BOOK.y, "📖", { fontSize: "18px" }).setOrigin(0.5).setDepth(Depth.Table);

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
    // E or the space bar.
    this.input.keyboard!.on("keydown-E", () => this.interact());
    this.input.keyboard!.on("keydown-SPACE", () => this.interact());

    this.placement = new EquipmentPlacement(this, this.room, Depth.Overlay);
    const startPlacement = (item: EquipmentId) => this.placement.start(item);
    this.game.events.on(START_PLACEMENT_EVENT, startPlacement);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(START_PLACEMENT_EVENT, startPlacement));

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
        unsubscribe.push(callbacks.listen(customer, "status", (status) => {
          this.refreshCustomerIcon(id, customer);
          if (status === "leaving") this.showCustomerLeaving(id, customer.patience > 0);
        }));
      }),
      callbacks.onRemove("customers", (_customer, id) => this.removeCustomer(id)),

      this.room.onMessage(Message.DishSpoiled, (message: DishSpoiledMessage) => this.showDishSpoiled(message)),

      callbacks.listen("money", (money, previous) => {
        if (previous !== undefined && money > previous && this.sees("hall")) this.showMoneyIn(money - previous);
      }),

      callbacks.onAdd("stoves", (stove, id) => {
        this.addStove(id, stove);
        unsubscribe.push(callbacks.listen(stove, "status", (status) => {
          const sprite = this.stoves.get(id);
          if (!sprite) return;
          if (status === "cooking") sprite.startedAt = this.time.now;
          if (!this.sees("kitchen")) return;
          sprite.icon.setText(status === "cooking" ? "🔥" : status === "ready" && stove.dish ? MENU[stove.dish].emoji : "");
        }));
      }),

      callbacks.onAdd("tickets", (ticket, id) => {
        const { x, y } = TICKET_SLOTS[ticket.slot];
        const slip = this.add
          .rectangle(x, y, TICKET_SLOT_SIZE - 8, TICKET_SLOT_SIZE - 4, 0xfffdf6)
          .setDepth(Depth.Table)
          .setVisible(this.sees("kitchen"));
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
    for (const [sessionId, { body, label, held, target }] of this.sprites) {
      body.x = Phaser.Math.Linear(body.x, target.x, t);
      body.y = Phaser.Math.Linear(body.y, target.y, t);
      label.setPosition(body.x, body.y - PLAYER_SIZE / 2 - 6);
      // setText is a no-op when nothing changed; `holding` is a list, so it's simplest to check every frame.
      const player = this.room.state.players.get(sessionId);
      if (player) held.setText(this.heldIcon(player));
      held.setPosition(body.x + PLAYER_SIZE / 2 - 4, body.y + PLAYER_SIZE / 2 - 4);
    }
    for (const { body, icon, target } of this.customers.values()) {
      body.x = Phaser.Math.Linear(body.x, target.x, t);
      body.y = Phaser.Math.Linear(body.y, target.y, t);
      icon.setPosition(body.x + CUSTOMER_SIZE / 2 + 2, body.y - CUSTOMER_SIZE / 2);
    }

    this.refreshPass();
    this.placement.update();
    this.bars.clear();
    this.drawInteractionHint();
    this.drawActionProgress();
    this.drawPatience();
    this.drawFreshness();
  }

  /**
   * Each player only sees the details of their own side: the cook doesn't see how customers are doing,
   * the waiter doesn't see tickets or what's cooking. Both see the room itself, the people and the pass.
   */
  private sees(area: Role) {
    return this.room.state.players.get(this.room.sessionId)?.role === area;
  }

  /** What E would do for the local player right now, judged from where they appear on screen. */
  private currentInteraction() {
    const mySprite = this.sprites.get(this.room.sessionId);
    if (!mySprite) return null;
    return availableInteraction(this.room.state, this.room.sessionId, mySprite.body);
  }

  private interact() {
    if (document.activeElement instanceof HTMLInputElement || this.registry.get(MODAL_OPEN_KEY)) return;
    if (this.placement.active) return;
    const interaction = this.currentInteraction();
    if (!interaction || interaction.kind === "blocked") return;
    if (interaction.kind === "readTicket") this.openPopup({ kind: "ticket", ticketId: interaction.ticketId });
    else if (interaction.kind === "openFridge") this.openPopup({ kind: "fridge" });
    else if (interaction.kind === "openStove") this.openPopup({ kind: "stove", stoveId: interaction.stoveId });
    else if (interaction.kind === "openPhone") this.openPopup({ kind: "phone" });
    else if (interaction.kind === "openComputer") this.openPopup({ kind: "computer" });
    else if (interaction.kind === "openRecipeBook") this.openPopup({ kind: "recipeBook" });
    else this.room.send(Message.Interact);
  }

  private openPopup(popup: ScenePopup) {
    this.game.events.emit(OPEN_POPUP_EVENT, popup);
  }

  /** Outlines what the local waiter can act on and shows which key to press. */
  private drawInteractionHint() {
    const interaction = this.placement.active ? null : this.currentInteraction();
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
    for (const [id, { body }] of this.stoves) {
      if (target?.kind === "stove" && target.id === id) body.setStrokeStyle(HIGHLIGHT.width, HIGHLIGHT.color);
      else body.setStrokeStyle();
    }
    if (target?.kind === "pass") this.pass.setStrokeStyle(HIGHLIGHT.width, HIGHLIGHT.color);
    else this.pass.setStrokeStyle(2, 0x8a5a3b);
    if (target?.kind === "register") this.register.setStrokeStyle(HIGHLIGHT.width, HIGHLIGHT.color);
    else this.register.setStrokeStyle();
    if (target?.kind === "phone") this.phone.setStrokeStyle(HIGHLIGHT.width, HIGHLIGHT.color);
    else this.phone.setStrokeStyle();
    if (target?.kind === "computer") this.computer.setStrokeStyle(HIGHLIGHT.width, HIGHLIGHT.color);
    else this.computer.setStrokeStyle();
    if (target?.kind === "recipeBook") this.recipeBook.setStrokeStyle(HIGHLIGHT.width, HIGHLIGHT.color);
    else this.recipeBook.setStrokeStyle();

    for (const [id, slip] of this.tickets) {
      if (target?.kind === "ticket" && target.id === id) slip.setStrokeStyle(3, 0xe8833a);
      else slip.setStrokeStyle(1, 0xb9a88f);
    }

    this.hint.setVisible(!!target);
    if (interaction && target) {
      const key = interaction.kind === "blocked" ? "⛔" : "E/Spazio ·";
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
    if (interaction.kind === "openFridge") {
      return { kind: "fridge", id: "", x: FRIDGE.x, top: FRIDGE.y - FRIDGE.height / 2, bottom: FRIDGE.y + FRIDGE.height / 2 };
    }
    const stoveId = interaction.kind === "openStove" || interaction.kind === "takeDish" ? interaction.stoveId
      : interaction.kind === "blocked" && interaction.station === "stove" ? interaction.stationId
      : undefined;
    if (stoveId) {
      const stove = this.room.state.stoves.get(stoveId);
      if (!stove) return null;
      const half = STOVE_SIZE / 2;
      return { kind: "stove", id: stoveId, x: stove.x, top: stove.y - half, bottom: stove.y + half };
    }
    if (
      interaction.kind === "placeOnPass" || interaction.kind === "takeFromPass"
      || (interaction.kind === "blocked" && interaction.station === "pass")
    ) {
      return { kind: "pass", id: "", x: PASS.x, top: PASS.y - PASS.height / 2, bottom: PASS.y + PASS.height / 2 };
    }
    if (interaction.kind === "openPhone") {
      const half = PHONE.height / 2;
      return { kind: "phone", id: "", x: PHONE.x, top: PHONE.y - half, bottom: PHONE.y + half };
    }
    if (interaction.kind === "openComputer") {
      const half = COMPUTER.height / 2;
      return { kind: "computer", id: "", x: COMPUTER.x, top: COMPUTER.y - half, bottom: COMPUTER.y + half };
    }
    if (interaction.kind === "openRecipeBook") {
      const half = RECIPE_BOOK.height / 2;
      return { kind: "recipeBook", id: "", x: RECIPE_BOOK.x, top: RECIPE_BOOK.y - half, bottom: RECIPE_BOOK.y + half };
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

  /** A bar above the target of every action in progress and over each stove while cooking, so both players can see it. */
  private drawActionProgress() {
    for (const [sessionId, startedAt] of this.actionStartedAt) {
      const player = this.room.state.players.get(sessionId);
      if (!player?.action) continue;
      // Cleaning and checkout happen in the hall.
      if (!this.sees("hall")) continue;
      const progress = Math.min(1, (this.time.now - startedAt) / ACTIONS[player.action].durationMs);

      if (player.action === "checkout") {
        // The till sits against the top wall: draw the bar across it.
        this.drawBar(REGISTER.x, REGISTER.y + REGISTER.height / 2 - 6, REGISTER.width - 8, progress, 0x7bd389);
        continue;
      }
      const table = this.room.state.tables.get(player.actionTarget);
      if (table) this.drawBar(table.x, table.y - TABLE_SIZE / 2 - 10, TABLE_SIZE + 10, progress, 0x7bd389);
    }

    for (const [id, { startedAt }] of this.stoves) {
      if (!this.sees("kitchen")) break;
      const stove = this.room.state.stoves.get(id);
      if (stove?.status !== "cooking" || !stove.dish) continue;
      const progress = Math.min(1, (this.time.now - startedAt) / RECIPES[stove.dish].cookMs);
      this.drawBar(stove.x, stove.y - STOVE_SIZE / 2 - 8, STOVE_SIZE + 6, progress, 0xf2994a);
    }
  }

  /** Patience bar above every customer whose patience is draining. */
  private drawPatience() {
    if (!this.sees("hall")) return;
    for (const [id, { body }] of this.customers) {
      const customer = this.room.state.customers.get(id);
      if (!customer || !CUSTOMER_TIMING.patienceS[customer.status]) continue;

      this.drawBar(body.x, body.y - CUSTOMER_SIZE / 2 - 8, CUSTOMER_SIZE + 6, customer.patience, levelColor(customer.patience));
    }
  }

  private drawBar(centerX: number, y: number, width: number, progress: number, color: number, height = 8) {
    const x = centerX - width / 2;
    this.bars.fillStyle(0x3b2a1e, 0.8).fillRect(x, y - height / 2, width, height);
    this.bars.fillStyle(color).fillRect(x + 1, y - height / 2 + 1, (width - 2) * progress, height - 2);
  }

  private sendInput() {
    const k = this.keys;
    // Stand still while typing in a React input or while a popup is open.
    const busy = document.activeElement instanceof HTMLInputElement
      || !!this.registry.get(MODAL_OPEN_KEY)
      || this.placement.active
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
    const dishes = [...this.room.state.pass].map((onPass) => onPass.dish);
    const key = dishes.join(",");
    if (key === this.shownPass) return;
    this.shownPass = key;
    this.passDishes.forEach((icon, i) => {
      const dish = dishes[i];
      icon.setText(isMenuItem(dish) ? MENU[dish].emoji : "");
    });
  }

  /**
   * How long cooked dishes have left before they're thrown away: on the pass for everyone, on the
   * stoves and in the cook's hands only for the cook.
   */
  private drawFreshness() {
    [...this.room.state.pass].forEach((onPass, i) => {
      const icon = this.passDishes[i];
      if (icon) this.drawBar(icon.x, icon.y + 8, 22, onPass.freshness, levelColor(onPass.freshness), 4);
    });
    if (!this.sees("kitchen")) return;

    for (const stove of this.room.state.stoves.values()) {
      if (stove.status === "ready") {
        this.drawBar(stove.x, stove.y - STOVE_SIZE / 2 - 8, STOVE_SIZE + 6, stove.freshness, levelColor(stove.freshness));
      }
    }
    for (const [sessionId, { body }] of this.sprites) {
      const player = this.room.state.players.get(sessionId);
      if (player?.role === "kitchen" && heldDish(player.holding)) {
        this.drawBar(body.x, body.y + PLAYER_SIZE / 2 + 6, PLAYER_SIZE, player.freshness, levelColor(player.freshness), 5);
      }
    }
  }

  /** "🗑️ Buttato" where a dish went bad. */
  private showDishSpoiled({ x, y, seenBy }: DishSpoiledMessage) {
    if (seenBy !== "everyone" && !this.sees(seenBy)) return;
    const text = this.add
      .text(x, y, "🗑️ Buttato", { ...TEXT_STYLE, fontSize: "14px", fontStyle: "bold", color: "#c0392b" })
      .setOrigin(0.5)
      .setDepth(Depth.Label);
    this.tweens.add({ targets: text, y: y - 30, alpha: 0, duration: 1600, onComplete: () => text.destroy() });
  }

  private addStove(id: string, stove: Stove) {
    const body = this.add.rectangle(stove.x, stove.y, STOVE_SIZE, STOVE_SIZE, 0x4a4a4f).setDepth(Depth.Table);
    const burners = this.add.graphics().setDepth(Depth.Table).lineStyle(3, 0x2a2a2e);
    const offset = STOVE_SIZE / 4;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      burners.strokeCircle(stove.x + dx * offset, stove.y + dy * offset, 7);
    }
    const icon = this.add.text(stove.x, stove.y, "", { fontSize: "24px" }).setOrigin(0.5).setDepth(Depth.Label);
    this.stoves.set(id, { body, burners, icon, startedAt: 0 });
  }

  /** What the player is carrying: shown for yourself and for whoever works on your side. */
  private heldIcon(player: Player) {
    if (!this.sees(player.role)) return "";
    return [...player.holding].map((item) => heldItemInfo(item as HeldItem).emoji).join("");
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
    this.customers.get(id)?.icon.setText(this.sees("hall") ? icons[customer.status] ?? "" : "");
  }

  /** Fades the customer out, with a face showing how it went for the waiter. */
  private showCustomerLeaving(id: string, happy: boolean) {
    const sprite = this.customers.get(id);
    if (!sprite) return;
    this.tweens.add({ targets: [sprite.body, sprite.icon], alpha: 0, duration: 1000 });
    if (!this.sees("hall")) return;

    const face = this.add
      .text(sprite.body.x, sprite.body.y - CUSTOMER_SIZE / 2, happy ? "😊" : "😠", { fontSize: "24px" })
      .setOrigin(0.5, 1)
      .setDepth(Depth.Label);
    this.tweens.add({ targets: face, y: face.y - 30, alpha: 0, duration: 1200, onComplete: () => face.destroy() });
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
    sprite.label.setText(this.sees("hall") ? info.label : "");
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

    // Doormat where customers come in, and marks where the line forms along the bottom wall.
    g.fillStyle(0x9c3d54, 0.55);
    g.fillRect(ENTRANCE.x - ENTRANCE.size / 2, ENTRANCE.y - ENTRANCE.size / 2, ENTRANCE.size, ENTRANCE.size);
    for (let i = 1; i < ENTRANCE_LINE_LENGTH; i++) {
      const { x, y } = entranceSpot(i);
      g.strokeCircle(x, y, CUSTOMER_SIZE / 2 + 2);
    }

    // Area names where there's room: the tickets hang on the top kitchen wall, the line forms along the bottom of the hall.
    const labelStyle = { ...TEXT_STYLE, fontSize: "18px", fontStyle: "bold" };
    this.add.text(WALL.x / 2, WORLD.height - 16, ROLE_INFO.kitchen.area.toUpperCase(), labelStyle).setOrigin(0.5, 1).setAlpha(0.35);
    this.add.text((WALL.x + WORLD.width) / 2, 16, ROLE_INFO.hall.area.toUpperCase(), labelStyle).setOrigin(0.5, 0).setAlpha(0.35);
    this.add
      .text(ENTRANCE.x, ENTRANCE.y + ENTRANCE.size / 2, "Ingresso", { ...TEXT_STYLE, fontSize: "12px" })
      .setOrigin(0.5, 1)
      .setAlpha(0.6);
  }
}
