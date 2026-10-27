import * as Phaser from "phaser";
import {
  COMPUTER,
  CUSTOMER_SIZE,
  CUSTOMER_TIMING,
  DECORATIONS,
  DECORATION_SIZE,
  DECORATION_SLOTS,
  MENU,
  RECIPE_BOOK,
  REGISTER,
  TABLE_SIZE,
  TABLE_STATUS_INFO,
  formatMoney,
  starIcons,
  type ActionId,
  type Customer,
  type CustomerStatus,
  type Table,
} from "@cacao/shared";
import { sounds } from "./Sounds.ts";
import {
  addCharacter,
  animateWalk,
  customerSheet,
  directionOf,
  heightAboveFeet,
  type Direction,
  type SheetKey,
} from "./characterSprites.ts";
import {
  Depth,
  HIGHLIGHT,
  SMOOTHING,
  TEXT_STYLE,
  levelColor,
  outline,
  peopleDepth,
  type RoomCallbacks,
  type Target,
  type Unsubscribe,
  type ViewContext,
} from "./sceneStyle.ts";

interface CustomerSprite {
  /** Where the customer is drawn: the center of their spot, catching up with the server. */
  pos: { x: number; y: number };
  /** Latest authoritative position from the server; we interpolate towards it. */
  target: { x: number; y: number };
  /** The character, standing on the bottom edge of their spot. */
  sprite: Phaser.GameObjects.Sprite;
  sheet: SheetKey;
  facing: Direction;
  /** A ring under their feet, shown when E would act on them. */
  ring: Phaser.GameObjects.Ellipse;
  /** Shows what the customer is up to, e.g. a raised hand when ready to order. */
  icon: Phaser.GameObjects.Text;
}

/** Below this distance (px) from where the server has them, a customer counts as standing still. */
const MOVING_THRESHOLD = 1;

interface TableSprite {
  body: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

/** What a customer is up to, shown next to them (to the waiter only). */
const STATUS_ICONS: Partial<Record<CustomerStatus, string>> = {
  readingMenu: "📖",
  readyToOrder: "✋",
  ordering: "📝",
  eating: "😋",
  queuing: "💶",
};

/**
 * The dining hall: tables, customers and decorations, and the waiter's furniture (till, computer,
 * recipe book). How customers are doing (status, patience, reviews) is only shown to the waiter.
 */
export class HallView {
  private customers = new Map<string, CustomerSprite>();
  private tables = new Map<string, TableSprite>();
  private decorations = new Map<string, Phaser.GameObjects.Text>();
  private register: Phaser.GameObjects.Rectangle;
  private computer: Phaser.GameObjects.Rectangle;
  private recipeBook: Phaser.GameObjects.Rectangle;

  constructor(private ctx: ViewContext) {
    const { scene } = ctx;
    this.register = scene.add
      .rectangle(REGISTER.x, REGISTER.y, REGISTER.width, REGISTER.height, 0x3f6b4f)
      .setDepth(Depth.Table);
    scene.add
      .text(REGISTER.x, REGISTER.y, "CASSA", { ...TEXT_STYLE, fontSize: "12px", fontStyle: "bold", color: "#f6efe4" })
      .setOrigin(0.5)
      .setDepth(Depth.Table);

    this.computer = scene.add
      .rectangle(COMPUTER.x, COMPUTER.y, COMPUTER.width, COMPUTER.height, 0x2f3b45)
      .setDepth(Depth.Table);
    scene.add.text(COMPUTER.x, COMPUTER.y, "💻", { fontSize: "18px" }).setOrigin(0.5).setDepth(Depth.Table);

    this.recipeBook = scene.add
      .rectangle(RECIPE_BOOK.x, RECIPE_BOOK.y, RECIPE_BOOK.width, RECIPE_BOOK.height, 0x7a3b2e)
      .setDepth(Depth.Table);
    scene.add.text(RECIPE_BOOK.x, RECIPE_BOOK.y, "📖", { fontSize: "18px" }).setOrigin(0.5).setDepth(Depth.Table);
  }

  subscribe(callbacks: RoomCallbacks): Unsubscribe[] {
    const { ctx } = this;
    // Declared up front: onAdd fires synchronously for entities already in the room.
    const unsubscribe: Unsubscribe[] = [];
    unsubscribe.push(
      callbacks.onAdd("tables", (table, id) => {
        this.addTable(id, table);
        unsubscribe.push(callbacks.listen(table, "status", (status, previous) => {
          this.refreshTable(id, table);
          if (status === "free" && previous === "dirty") ctx.playSound("sparkle", "hall", table.x);
        }));
      }),

      callbacks.onAdd("customers", (customer, id) => {
        this.addCustomer(id, customer);
        ctx.playSound("doorbell", "hall", customer.x);
        unsubscribe.push(callbacks.onChange(customer, () => {
          const entry = this.customers.get(id);
          if (entry) entry.target = { x: customer.x, y: customer.y };
        }));
        unsubscribe.push(callbacks.listen(customer, "status", (status) => {
          this.refreshCustomerIcon(id, customer);
          if (status === "leaving") this.showCustomerLeaving(id, customer);
          this.customerSound(customer);
        }));
      }),
      callbacks.onRemove("customers", (_customer, id) => this.removeCustomer(id)),

      // Everyone sees the decorations: they're part of the room.
      callbacks.onAdd("decorations", (decoration, id) => {
        const { x, y } = DECORATION_SLOTS[decoration.slot];
        const text = ctx.scene.add
          .text(x, y, DECORATIONS[decoration.kind].emoji, { fontSize: `${DECORATION_SIZE - 4}px` })
          .setOrigin(0.5)
          .setDepth(Depth.Table);
        this.decorations.set(id, text);
        ctx.playSound("place", null, x);
      }),
      callbacks.onRemove("decorations", (_decoration, id) => {
        this.decorations.get(id)?.destroy();
        this.decorations.delete(id);
      }),

      callbacks.listen("money", (money, previous) => {
        if (previous !== undefined && money > previous && ctx.sees("hall")) {
          this.showMoneyIn(money - previous);
          ctx.playSound("register", "hall", REGISTER.x);
        }
      }),
    );
    return unsubscribe;
  }

  /**
   * Customers catch up with where the server says they are, walking while they do. Standing still,
   * they face their table when seated and the hall while in a line.
   */
  update(delta: number) {
    const t = 1 - Math.pow(1 - SMOOTHING, delta / (1000 / 60));
    for (const [id, entry] of this.customers) {
      const { pos, target, sprite, sheet, ring, icon } = entry;
      const dx = target.x - pos.x;
      const dy = target.y - pos.y;
      const moving = Math.hypot(dx, dy) > MOVING_THRESHOLD;
      if (moving) entry.facing = directionOf(dx, dy);
      else entry.facing = this.restingDirection(id) ?? entry.facing;
      animateWalk(sprite, sheet, entry.facing, moving);

      pos.x = Phaser.Math.Linear(pos.x, target.x, t);
      pos.y = Phaser.Math.Linear(pos.y, target.y, t);
      const feet = pos.y + CUSTOMER_SIZE / 2;
      sprite.setPosition(pos.x, feet).setDepth(peopleDepth(feet));
      ring.setPosition(pos.x, feet - 3);
      icon.setPosition(pos.x + 10, feet - heightAboveFeet(sheet) + 10);
    }
  }

  /** Where a customer is drawn right now, and how high they reach (with room for their patience bar). */
  customerBox(id: string) {
    const entry = this.customers.get(id);
    if (!entry) return undefined;
    const feet = entry.pos.y + CUSTOMER_SIZE / 2;
    return { x: entry.pos.x, top: feet - heightAboveFeet(entry.sheet) - 12, bottom: feet };
  }

  /** Which way a customer who isn't walking looks: at their table when seated, into the hall when in a line. */
  private restingDirection(id: string): Direction | null {
    const customer = this.ctx.room.state.customers.get(id);
    if (!customer) return null;
    if (customer.tableId) return "down";
    if (customer.status === "waiting" || customer.status === "queuing") return "up";
    return null;
  }

  highlight(target: Target | null) {
    for (const [id, { body }] of this.tables) outline(body, target?.kind === "table" && target.id === id);
    for (const [id, { ring }] of this.customers) ring.setVisible(target?.kind === "customer" && target.id === id);
    outline(this.register, target?.kind === "register");
    outline(this.computer, target?.kind === "computer");
    outline(this.recipeBook, target?.kind === "recipeBook");
  }

  /** The progress bar of the waiter's timed actions: over the table being cleaned, or across the till. */
  drawActionBar(action: ActionId, targetId: string, progress: number) {
    if (action === "checkout") {
      // The till sits against the top wall: draw the bar across it.
      this.ctx.bars.draw(REGISTER.x, REGISTER.y + REGISTER.height / 2 - 6, REGISTER.width - 8, progress, 0x7bd389);
      return;
    }
    const table = this.ctx.room.state.tables.get(targetId);
    if (table) this.ctx.bars.draw(table.x, table.y - TABLE_SIZE / 2 - 10, TABLE_SIZE + 10, progress, 0x7bd389);
  }

  /** Patience bar above every customer whose patience is draining. */
  drawPatience() {
    if (!this.ctx.sees("hall")) return;
    for (const [id, { pos, sheet }] of this.customers) {
      const customer = this.ctx.room.state.customers.get(id);
      if (!customer || !CUSTOMER_TIMING.patienceS[customer.status]) continue;
      const aboveHead = pos.y + CUSTOMER_SIZE / 2 - heightAboveFeet(sheet) - 5;
      this.ctx.bars.draw(pos.x, aboveHead, CUSTOMER_SIZE + 6, customer.patience, levelColor(customer.patience));
    }
  }

  /** What the waiter hears as a customer moves on: led, seated, order sent, served, gone. */
  private customerSound(customer: Customer) {
    const { ctx } = this;
    const { x } = customer;
    switch (customer.status) {
      case "following": ctx.playSound("pop", "hall", x); break;
      case "readingMenu": ctx.playSound("chair", "hall", x); break;
      case "waitingFood": ctx.playSound("scribble", "hall", x); break;
      case "eating": ctx.playSound("serve", "hall", x); break;
      case "leaving":
        if (!ctx.isLive() || !ctx.sees("hall")) break;
        if (customer.rating) sounds.playStars(customer.rating, ctx.panFor(x));
        else if (customer.patience === 0) sounds.play("angry", ctx.panFor(x));
        break;
    }
  }

  /** A "+3,50 €" floating up from the till. */
  private showMoneyIn(cents: number) {
    const text = this.ctx.scene.add
      .text(REGISTER.x, REGISTER.y + REGISTER.height / 2, `+${formatMoney(cents)}`, {
        ...TEXT_STYLE,
        fontSize: "16px",
        fontStyle: "bold",
        color: "#2e7d4f",
      })
      .setOrigin(0.5, 0)
      .setDepth(Depth.Label);
    this.ctx.scene.tweens.add({ targets: text, y: text.y + 30, alpha: 0, duration: 1400, onComplete: () => text.destroy() });
  }

  private addCustomer(id: string, customer: Customer) {
    const { scene } = this.ctx;
    const sheet = customerSheet(id);
    const feet = customer.y + CUSTOMER_SIZE / 2;
    const sprite = addCharacter(scene, sheet, customer.x, feet).setDepth(peopleDepth(feet));
    const ring = scene.add
      .ellipse(customer.x, feet - 3, CUSTOMER_SIZE + 6, 12)
      .setStrokeStyle(HIGHLIGHT.width, HIGHLIGHT.color)
      .setDepth(Depth.Table)
      .setVisible(false);
    const icon = scene.add.text(0, 0, "", { fontSize: "18px" }).setOrigin(0, 1).setDepth(Depth.Label);
    this.customers.set(id, {
      pos: { x: customer.x, y: customer.y },
      target: { x: customer.x, y: customer.y },
      sprite,
      sheet,
      facing: "left",
      ring,
      icon,
    });
    this.refreshCustomerIcon(id, customer);
  }

  private refreshCustomerIcon(id: string, customer: Customer) {
    const icon = customer.status === "waitingFood" ? MENU[customer.wants]?.emoji : STATUS_ICONS[customer.status];
    this.customers.get(id)?.icon.setText(this.ctx.sees("hall") ? icon ?? "" : "");
  }

  /**
   * Fades the customer out, showing the waiter how it went: their review in stars, or an angry face if
   * they left before even getting a table.
   */
  private showCustomerLeaving(id: string, customer: Customer) {
    const { scene } = this.ctx;
    const entry = this.customers.get(id);
    if (!entry) return;
    entry.ring.setVisible(false);
    scene.tweens.add({ targets: [entry.sprite, entry.icon], alpha: 0, duration: 1000 });
    if (!this.ctx.sees("hall")) return;

    const x = entry.pos.x;
    const headTop = entry.pos.y + CUSTOMER_SIZE / 2 - heightAboveFeet(entry.sheet);
    const text = customer.rating
      ? scene.add.text(x, headTop, starIcons(customer.rating), {
        ...TEXT_STYLE,
        fontSize: "16px",
        fontStyle: "bold",
        color: "#d99a00",
        stroke: "#fffaf3",
        strokeThickness: 3,
      })
      : scene.add.text(x, headTop, customer.patience > 0 ? "😊" : "😠", { fontSize: "24px" });
    text.setOrigin(0.5, 1).setDepth(Depth.Label);
    // Reviews stay up a little longer, so there's time to read them.
    const duration = customer.rating ? 2000 : 1200;
    scene.tweens.add({ targets: text, y: text.y - 30, alpha: 0, duration, onComplete: () => text.destroy() });
  }

  private removeCustomer(id: string) {
    const entry = this.customers.get(id);
    entry?.sprite.destroy();
    entry?.ring.destroy();
    entry?.icon.destroy();
    this.customers.delete(id);
  }

  private addTable(id: string, table: Table) {
    const { scene } = this.ctx;
    const body = scene.add.rectangle(table.x, table.y, TABLE_SIZE, TABLE_SIZE).setDepth(Depth.Table);
    const label = scene.add
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
    sprite.label.setText(this.ctx.sees("hall") ? info.label : "");
  }
}
