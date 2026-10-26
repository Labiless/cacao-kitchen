import * as Phaser from "phaser";
import {
  DECORATIONS,
  DECORATION_SIZE,
  DECORATION_SLOTS,
  EQUIPMENT,
  KITCHEN_GRID,
  Message,
  canPlaceDecoration,
  canPlaceEquipment,
  cellCenter,
  type BuyDecorationMessage,
  type BuyEquipmentMessage,
  type DecorationId,
  type EquipmentId,
} from "@cacao/shared";
import type { KitchenRoom } from "../network.ts";

const VALID = 0x7bd389;
const INVALID = 0xe05a47;

/** Something bought on the computer that still has to be placed. */
export type PlacementItem = { type: "equipment"; id: EquipmentId } | { type: "decoration"; id: DecorationId };

/** How close (px) the mouse must be to a decoration slot to pick it. */
const SLOT_PICK_RADIUS = 30;

/**
 * Placement mode after buying on the computer. Equipment goes on the kitchen grid: the grid shows up
 * and a ghost of the item follows the mouse, snapping to grid squares. Decorations go on the fixed
 * spots in the hall, which show up as circles. A click on a free square or spot buys and places it,
 * Esc (or right click) cancels without spending anything.
 */
export class Placement {
  private item: PlacementItem | null = null;
  /** The grid square or decoration slot under the mouse. */
  private target: { col: number; row: number } | { slot: number } | null = null;
  private guides: Phaser.GameObjects.Graphics;
  private ghost: Phaser.GameObjects.Rectangle;
  private ghostIcon: Phaser.GameObjects.Text;
  private banner: Phaser.GameObjects.Text;
  /** Decorations when the slot circles were last drawn: they only change when one is bought. */
  private drawnDecorations = -1;

  constructor(private scene: Phaser.Scene, private room: KitchenRoom, depth: number) {
    this.guides = scene.add.graphics().setDepth(depth).setVisible(false);
    this.ghost = scene.add.rectangle(0, 0, 1, 1).setDepth(depth).setVisible(false);
    this.ghostIcon = scene.add.text(0, 0, "", { fontSize: "24px" }).setOrigin(0.5).setDepth(depth).setVisible(false);
    this.banner = scene.add
      .text(scene.scale.width / 2, scene.scale.height - 12, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "14px",
        color: "#fffaf3",
        backgroundColor: "#3b2a1e",
        padding: { x: 10, y: 6 },
      })
      .setOrigin(0.5, 1)
      .setDepth(depth)
      .setVisible(false);

    scene.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => this.track(pointer));
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (!this.item) return;
      if (pointer.rightButtonDown()) this.stop();
      else this.place(pointer);
    });
    scene.input.keyboard!.on("keydown-ESC", () => this.stop());
  }

  get active() {
    return this.item !== null;
  }

  start(item: PlacementItem) {
    this.item = item;
    this.target = null;
    const size = item.type === "equipment" ? KITCHEN_GRID.cell - 4 : DECORATION_SIZE + 6;
    this.ghost.setSize(size, size);
    const { label, emoji } = item.type === "equipment" ? EQUIPMENT[item.id] : DECORATIONS[item.id];
    this.ghostIcon.setText(emoji);
    const where = item.type === "equipment" ? "una casella libera in cucina" : "un posto libero in sala";
    this.banner.setText(`Clicca ${where} per posizionare: ${label} · Esc per annullare`).setVisible(true);
    this.drawGuides();
  }

  stop() {
    this.item = null;
    this.target = null;
    for (const object of [this.guides, this.ghost, this.ghostIcon, this.banner]) object.setVisible(false);
  }

  /** Re-checks the spot under the mouse: a grid square can become free or taken while placing (the cook moves). */
  update() {
    if (!this.item) return;
    if (this.item.type === "decoration" && this.room.state.decorations.size !== this.drawnDecorations) this.drawGuides();
    if (this.target) this.showGhost();
  }

  private track(pointer: Phaser.Input.Pointer) {
    if (!this.item) return;
    this.target = this.item.type === "equipment" ? gridCellAt(pointer) : decorationSlotAt(pointer);
    if (this.target) this.showGhost();
    else {
      this.ghost.setVisible(false);
      this.ghostIcon.setVisible(false);
    }
  }

  private canPlace() {
    const { target } = this;
    if (!target) return false;
    return "slot" in target
      ? canPlaceDecoration(this.room.state, target.slot)
      : canPlaceEquipment(this.room.state, target.col, target.row);
  }

  private showGhost() {
    const { target } = this;
    if (!target) return;
    const { x, y } = "slot" in target ? DECORATION_SLOTS[target.slot] : cellCenter(target.col, target.row);
    const color = this.canPlace() ? VALID : INVALID;
    this.ghost.setPosition(x, y).setFillStyle(color, 0.35).setStrokeStyle(2, color).setVisible(true);
    this.ghostIcon.setPosition(x, y).setVisible(true);
  }

  private place(pointer: Phaser.Input.Pointer) {
    this.track(pointer);
    const { item, target } = this;
    if (!item || !target || !this.canPlace()) return;
    if (item.type === "equipment" && "col" in target) {
      this.room.send(Message.BuyEquipment, { item: item.id, ...target } satisfies BuyEquipmentMessage);
    } else if (item.type === "decoration" && "slot" in target) {
      this.room.send(Message.BuyDecoration, { item: item.id, slot: target.slot } satisfies BuyDecorationMessage);
    }
    this.stop();
  }

  /** The kitchen grid for equipment, or a circle on every free decoration spot. */
  private drawGuides() {
    this.guides.clear();
    this.drawnDecorations = this.room.state.decorations.size;
    if (this.item?.type === "equipment") {
      const { cell, cols, rows } = KITCHEN_GRID;
      this.guides.lineStyle(1, 0x3b2a1e, 0.35);
      for (let col = 0; col <= cols; col++) this.guides.lineBetween(col * cell, 0, col * cell, rows * cell);
      for (let row = 0; row <= rows; row++) this.guides.lineBetween(0, row * cell, cols * cell, row * cell);
    } else {
      this.guides.lineStyle(2, VALID, 0.8);
      DECORATION_SLOTS.forEach(({ x, y }, slot) => {
        if (canPlaceDecoration(this.room.state, slot)) this.guides.strokeCircle(x, y, DECORATION_SIZE / 2 + 2);
      });
    }
    this.guides.setVisible(true);
  }
}

function gridCellAt(pointer: Phaser.Input.Pointer) {
  const col = Math.floor(pointer.worldX / KITCHEN_GRID.cell);
  const row = Math.floor(pointer.worldY / KITCHEN_GRID.cell);
  const inside = col >= 0 && row >= 0 && col < KITCHEN_GRID.cols && row < KITCHEN_GRID.rows;
  return inside ? { col, row } : null;
}

/** The decoration slot nearest the mouse, if it's close enough. */
function decorationSlotAt(pointer: Phaser.Input.Pointer) {
  let best: { slot: number } | null = null;
  let bestDistance = SLOT_PICK_RADIUS;
  DECORATION_SLOTS.forEach(({ x, y }, slot) => {
    const distance = Math.hypot(pointer.worldX - x, pointer.worldY - y);
    if (distance <= bestDistance) {
      best = { slot };
      bestDistance = distance;
    }
  });
  return best;
}
