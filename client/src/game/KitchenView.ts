import * as Phaser from "phaser";
import {
  APPLIANCE_SIZE,
  DELIVERY_BAY,
  EQUIPMENT,
  FRIDGE,
  MENU,
  Message,
  PASS,
  PASS_CAPACITY,
  PHONE,
  RECIPES,
  TICKET_SLOTS,
  TICKET_SLOT_SIZE,
  isFinalStep,
  isMenuItem,
  stepMs,
  type Appliance,
  type DishSpoiledMessage,
} from "@cacao/shared";
import { sounds } from "./Sounds.ts";
import {
  Depth,
  TEXT_STYLE,
  levelColor,
  outline,
  type RoomCallbacks,
  type Target,
  type Unsubscribe,
  type ViewContext,
} from "./sceneStyle.ts";

interface ApplianceSprite {
  body: Phaser.GameObjects.Rectangle;
  /** What the appliance is; for the cook, what's on it once a step is done. */
  icon: Phaser.GameObjects.Text;
  /** Its level, shown in a corner from level 2. */
  tier: Phaser.GameObjects.Text;
  /** Local time (scene clock) at which the current step started, and how long it lasts, for its progress bar. */
  startedAt: number;
  durationMs: number;
}

/**
 * The cook's side: the fridge, the phone, the appliances, the tickets on the wall, the delivery truck
 * and the pass. What's going on in there (tickets, what's cooking, the truck) is only shown to the
 * cook; the pass, where the two sides meet, is shown to both.
 */
export class KitchenView {
  private appliances = new Map<string, ApplianceSprite>();
  /** Blank slips on the wall, by ticket id: the cook sees where tickets are, not what they say. */
  private tickets = new Map<string, Phaser.GameObjects.Rectangle>();
  private fridge: Phaser.GameObjects.Rectangle;
  private phone: Phaser.GameObjects.Rectangle;
  private pass: Phaser.GameObjects.Rectangle;
  /** One icon per spot on the pass. */
  private passDishes: Phaser.GameObjects.Text[] = [];
  /** What the pass icons currently show, to redraw only when it changes. */
  private shownPass = "";
  /** Dishes on the pass last frame, to ring the bell when one is added. */
  private passCount = 0;
  /** The supplier's truck, shown at the bay while it waits to be unloaded. */
  private truck: Phaser.GameObjects.Rectangle;
  private truckIcon: Phaser.GameObjects.Text;

  constructor(private ctx: ViewContext) {
    const { scene } = ctx;
    this.fridge = scene.add
      .rectangle(FRIDGE.x, FRIDGE.y, FRIDGE.width, FRIDGE.height, 0xcfe6ef)
      .setDepth(Depth.Table);
    scene.add
      .text(FRIDGE.x, FRIDGE.y, "FRIGO", { ...TEXT_STYLE, fontSize: "11px", fontStyle: "bold" })
      .setOrigin(0.5)
      .setAngle(-90)
      .setAlpha(0.6)
      .setDepth(Depth.Table);

    this.phone = scene.add
      .rectangle(PHONE.x, PHONE.y, PHONE.width, PHONE.height, 0x2f3b45)
      .setDepth(Depth.Table);
    scene.add.text(PHONE.x, PHONE.y, "📞", { fontSize: "16px" }).setOrigin(0.5).setDepth(Depth.Table);

    this.truck = scene.add
      .rectangle(DELIVERY_BAY.x, DELIVERY_BAY.y, DELIVERY_BAY.width - 16, DELIVERY_BAY.height - 20, 0xe9e2d0)
      .setDepth(Depth.Table)
      .setVisible(false);
    this.truckIcon = scene.add.text(DELIVERY_BAY.x, DELIVERY_BAY.y, "🚚", { fontSize: "36px" })
      .setOrigin(0.5)
      .setDepth(Depth.Table)
      .setVisible(false);

    // The pass cuts through the wall, so it's drawn on top of it.
    this.pass = scene.add.rectangle(PASS.x, PASS.y, PASS.width, PASS.height, 0xc89b6d).setDepth(Depth.Table);
    const spacing = PASS.height / PASS_CAPACITY;
    for (let i = 0; i < PASS_CAPACITY; i++) {
      const y = PASS.y - PASS.height / 2 + spacing * (i + 0.5);
      this.passDishes.push(scene.add.text(PASS.x, y, "", { fontSize: "16px" }).setOrigin(0.5).setDepth(Depth.Label));
    }
  }

  subscribe(callbacks: RoomCallbacks): Unsubscribe[] {
    const { ctx } = this;
    const { room } = ctx;
    // Declared up front: onAdd fires synchronously for entities already in the room.
    const unsubscribe: Unsubscribe[] = [];
    unsubscribe.push(
      room.onMessage(Message.DishSpoiled, (message: DishSpoiledMessage) => {
        this.showDishSpoiled(message);
        ctx.playSound("trash", message.seenBy === "everyone" ? null : message.seenBy, message.x);
      }),

      callbacks.listen(room.state.delivery, "status", (status) => {
        // Kitchen business: only the cook sees the truck.
        const visible = status === "arrived" && ctx.sees("kitchen");
        this.truck.setVisible(visible);
        this.truckIcon.setVisible(visible);
        if (status === "arrived") ctx.playSound("truck", "kitchen", DELIVERY_BAY.x);
      }),

      callbacks.onAdd("appliances", (appliance, id) => {
        this.addAppliance(id, appliance);
        ctx.playSound("place", null, appliance.x);
        unsubscribe.push(callbacks.listen(appliance, "status", (status) => {
          const sprite = this.appliances.get(id);
          if (!sprite) return;
          if (status === "working" && appliance.dish) {
            sprite.startedAt = ctx.scene.time.now;
            // Fixed when the step starts: upgrading mid-step only speeds up the next ones.
            sprite.durationMs = stepMs(RECIPES[appliance.dish].steps[appliance.step].ms, appliance.tier);
          }
          this.refreshApplianceIcon(sprite, appliance);
          this.applianceSound(id, appliance);
        }));
        unsubscribe.push(callbacks.listen(appliance, "tier", (tier, previous) => {
          this.appliances.get(id)?.tier.setText(tier > 1 ? `Lv${tier}` : "");
          if (previous !== undefined && tier > previous) ctx.playSound("sparkle", "kitchen", appliance.x);
        }));
      }),
      // Appliances go away when the game starts over.
      callbacks.onRemove("appliances", (_appliance, id) => this.removeAppliance(id)),

      callbacks.onAdd("tickets", (ticket, id) => {
        const { x, y } = TICKET_SLOTS[ticket.slot];
        const slip = ctx.scene.add
          .rectangle(x, y, TICKET_SLOT_SIZE - 8, TICKET_SLOT_SIZE - 4, 0xfffdf6)
          .setDepth(Depth.Table)
          .setVisible(ctx.sees("kitchen"));
        this.tickets.set(id, slip);
        ctx.playSound("ticket", "kitchen", x);
      }),
      callbacks.onRemove("tickets", (_ticket, id) => {
        this.tickets.get(id)?.destroy();
        this.tickets.delete(id);
      }),
    );
    return unsubscribe;
  }

  /** The dishes on the pass, and the bell when one is added (both sides hear it: the cook rings, the waiter answers). */
  update() {
    const dishes = [...this.ctx.room.state.pass].map((onPass) => onPass.dish);
    const key = dishes.join(",");
    if (key !== this.shownPass) {
      this.shownPass = key;
      this.passDishes.forEach((icon, i) => {
        const dish = dishes[i];
        icon.setText(isMenuItem(dish) ? MENU[dish].emoji : "");
      });
    }

    if (dishes.length > this.passCount) this.ctx.playSound("passBell", null, PASS.x);
    this.passCount = dishes.length;
  }

  highlight(target: Target | null) {
    outline(this.fridge, target?.kind === "fridge", { width: 2, color: 0x9bbfcc });
    outline(this.phone, target?.kind === "phone");
    outline(this.pass, target?.kind === "pass", { width: 2, color: 0x8a5a3b });
    outline(this.truck, target?.kind === "truck", { width: 2, color: 0x8a7563 });
    for (const [id, { body }] of this.appliances) outline(body, target?.kind === "appliance" && target.id === id);
    for (const [id, slip] of this.tickets) {
      if (target?.kind === "ticket" && target.id === id) slip.setStrokeStyle(3, 0xe8833a);
      else slip.setStrokeStyle(1, 0xb9a88f);
    }
  }

  /** The progress bar of the cook's timed action: unloading the truck. */
  drawActionBar(progress: number) {
    this.ctx.bars.draw(DELIVERY_BAY.x, DELIVERY_BAY.y - DELIVERY_BAY.height / 2 + 6, DELIVERY_BAY.width - 10, progress, 0x7bd389);
  }

  /** A bar over each appliance while a step is in progress (for the cook). */
  drawApplianceProgress() {
    if (!this.ctx.sees("kitchen")) return;
    for (const [id, { startedAt, durationMs }] of this.appliances) {
      const appliance = this.ctx.room.state.appliances.get(id);
      if (appliance?.status !== "working" || !appliance.dish) continue;
      const progress = Math.min(1, (this.ctx.scene.time.now - startedAt) / durationMs);
      this.ctx.bars.draw(appliance.x, appliance.y - APPLIANCE_SIZE / 2 - 8, APPLIANCE_SIZE + 6, progress, 0xf2994a);
    }
  }

  /**
   * How long finished dishes have left before they're thrown away: on the pass for everyone, on the
   * appliances only for the cook (dishes in the cook's hands: see PlayersView).
   */
  drawFreshness() {
    const { ctx } = this;
    [...ctx.room.state.pass].forEach((onPass, i) => {
      const icon = this.passDishes[i];
      if (icon) ctx.bars.draw(icon.x, icon.y + 8, 22, onPass.freshness, levelColor(onPass.freshness), 4);
    });
    if (!ctx.sees("kitchen")) return;

    for (const appliance of ctx.room.state.appliances.values()) {
      // A half-made dish doesn't go stale (its freshness stays 0): no bar.
      if (appliance.status === "ready" && appliance.freshness > 0) {
        const { x, y, freshness } = appliance;
        ctx.bars.draw(x, y - APPLIANCE_SIZE / 2 - 8, APPLIANCE_SIZE + 6, freshness, levelColor(freshness));
      }
    }
  }

  /** The cook hears every appliance at work, a click when a step starts and the timer when it's done. */
  private applianceSound(id: string, appliance: Appliance) {
    const { ctx } = this;
    if (!ctx.sees("kitchen")) return;
    if (appliance.status === "working") {
      // Also when joining mid-step: the loop is the appliance's state, not an event.
      sounds.startLoop(id, appliance.kind, ctx.panFor(appliance.x));
      ctx.playSound("stepStart", "kitchen", appliance.x);
    } else {
      sounds.stopLoop(id);
      if (appliance.status === "ready") ctx.playSound("stepDone", "kitchen", appliance.x);
    }
  }

  /** "🗑️ Buttato" where a dish went bad. */
  private showDishSpoiled({ x, y, seenBy }: DishSpoiledMessage) {
    const { scene } = this.ctx;
    if (seenBy !== "everyone" && !this.ctx.sees(seenBy)) return;
    const text = scene.add
      .text(x, y, "🗑️ Buttato", { ...TEXT_STYLE, fontSize: "14px", fontStyle: "bold", color: "#c0392b" })
      .setOrigin(0.5)
      .setDepth(Depth.Label);
    scene.tweens.add({ targets: text, y: y - 30, alpha: 0, duration: 1600, onComplete: () => text.destroy() });
  }

  private addAppliance(id: string, appliance: Appliance) {
    const { scene } = this.ctx;
    const color = Phaser.Display.Color.HexStringToColor(EQUIPMENT[appliance.kind].color).color;
    const body = scene.add.rectangle(appliance.x, appliance.y, APPLIANCE_SIZE, APPLIANCE_SIZE, color).setDepth(Depth.Table);
    const icon = scene.add.text(appliance.x, appliance.y, "", { fontSize: "24px" }).setOrigin(0.5).setDepth(Depth.Label);
    const half = APPLIANCE_SIZE / 2;
    const tier = scene.add
      .text(appliance.x + half - 2, appliance.y + half - 1, "", {
        ...TEXT_STYLE,
        fontSize: "10px",
        fontStyle: "bold",
        color: "#fffaf3",
        backgroundColor: "#d99a00",
        padding: { x: 2, y: 0 },
      })
      .setOrigin(1, 1)
      .setDepth(Depth.Label);
    const sprite = { body, icon, tier, startedAt: 0, durationMs: 1 };
    this.appliances.set(id, sprite);
    this.refreshApplianceIcon(sprite, appliance);
  }

  private removeAppliance(id: string) {
    sounds.stopLoop(id);
    const sprite = this.appliances.get(id);
    sprite?.body.destroy();
    sprite?.icon.destroy();
    sprite?.tier.destroy();
    this.appliances.delete(id);
  }

  /**
   * Everyone sees what the appliance is. Only the cook sees what's on it once a step is done: the
   * dish, faded while it's still half-made.
   */
  private refreshApplianceIcon({ icon }: ApplianceSprite, appliance: Appliance) {
    const { dish, status, step } = appliance;
    const cook = this.ctx.sees("kitchen");
    if (status === "ready" && dish && cook) {
      icon.setText(MENU[dish].emoji).setAlpha(isFinalStep(dish, step) ? 1 : 0.55);
    } else {
      icon.setText(EQUIPMENT[appliance.kind].emoji).setAlpha(status === "working" && cook ? 1 : 0.7);
    }
  }
}
