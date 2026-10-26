import * as Phaser from "phaser";
import {
  COMPUTER,
  CUSTOMER_COLOR,
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
  Depth,
  SMOOTHING,
  TEXT_STYLE,
  levelColor,
  outline,
  type RoomCallbacks,
  type Target,
  type Unsubscribe,
  type ViewContext,
} from "./sceneStyle.ts";

interface CustomerSprite {
  body: Phaser.GameObjects.Arc;
  /** Shows what the customer is up to, e.g. a raised hand when ready to order. */
  icon: Phaser.GameObjects.Text;
  /** Latest authoritative position from the server; we interpolate towards it. */
  target: { x: number; y: number };
}

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
          const sprite = this.customers.get(id);
          if (sprite) sprite.target = { x: customer.x, y: customer.y };
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

  /** Customers catch up with where the server says they are. */
  update(delta: number) {
    const t = 1 - Math.pow(1 - SMOOTHING, delta / (1000 / 60));
    for (const { body, icon, target } of this.customers.values()) {
      body.x = Phaser.Math.Linear(body.x, target.x, t);
      body.y = Phaser.Math.Linear(body.y, target.y, t);
      icon.setPosition(body.x + CUSTOMER_SIZE / 2 + 2, body.y - CUSTOMER_SIZE / 2);
    }
  }

  /** Where the customer is drawn right now (their sprite catches up with the server smoothly). */
  customerPosition(id: string) {
    const sprite = this.customers.get(id);
    return sprite && { x: sprite.body.x, y: sprite.body.y };
  }

  highlight(target: Target | null) {
    for (const [id, { body }] of this.tables) outline(body, target?.kind === "table" && target.id === id);
    for (const [id, { body }] of this.customers) outline(body, target?.kind === "customer" && target.id === id);
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
    for (const [id, { body }] of this.customers) {
      const customer = this.ctx.room.state.customers.get(id);
      if (!customer || !CUSTOMER_TIMING.patienceS[customer.status]) continue;
      this.ctx.bars.draw(body.x, body.y - CUSTOMER_SIZE / 2 - 8, CUSTOMER_SIZE + 6, customer.patience, levelColor(customer.patience));
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
    const color = Phaser.Display.Color.HexStringToColor(CUSTOMER_COLOR).color;
    const body = scene.add.circle(customer.x, customer.y, CUSTOMER_SIZE / 2, color).setDepth(Depth.Player);
    const icon = scene.add.text(0, 0, "", { fontSize: "18px" }).setOrigin(0, 1).setDepth(Depth.Label);
    this.customers.set(id, { body, icon, target: { x: customer.x, y: customer.y } });
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
    const sprite = this.customers.get(id);
    if (!sprite) return;
    scene.tweens.add({ targets: [sprite.body, sprite.icon], alpha: 0, duration: 1000 });
    if (!this.ctx.sees("hall")) return;

    const { x, y } = sprite.body;
    const text = customer.rating
      ? scene.add.text(x, y - CUSTOMER_SIZE / 2, starIcons(customer.rating), {
        ...TEXT_STYLE,
        fontSize: "16px",
        fontStyle: "bold",
        color: "#d99a00",
        stroke: "#fffaf3",
        strokeThickness: 3,
      })
      : scene.add.text(x, y - CUSTOMER_SIZE / 2, customer.patience > 0 ? "😊" : "😠", { fontSize: "24px" });
    text.setOrigin(0.5, 1).setDepth(Depth.Label);
    // Reviews stay up a little longer, so there's time to read them.
    const duration = customer.rating ? 2000 : 1200;
    scene.tweens.add({ targets: text, y: text.y - 30, alpha: 0, duration, onComplete: () => text.destroy() });
  }

  private removeCustomer(id: string) {
    this.customers.get(id)?.body.destroy();
    this.customers.get(id)?.icon.destroy();
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
