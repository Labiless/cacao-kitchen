import * as Phaser from "phaser";
import {
  EQUIPMENT,
  KITCHEN_GRID,
  Message,
  canPlaceEquipment,
  cellCenter,
  type BuyEquipmentMessage,
  type EquipmentId,
} from "@cacao/shared";
import type { KitchenRoom } from "../network.ts";

const VALID = 0x7bd389;
const INVALID = 0xe05a47;

/**
 * Placement mode after buying equipment on the computer: the kitchen grid shows up, a ghost of the
 * item follows the mouse snapping to grid squares, a click on a free square buys and places it,
 * Esc (or right click) cancels without spending anything.
 */
export class EquipmentPlacement {
  private item: EquipmentId | null = null;
  private cell: { col: number; row: number } | null = null;
  private grid: Phaser.GameObjects.Graphics;
  private ghost: Phaser.GameObjects.Rectangle;
  private ghostIcon: Phaser.GameObjects.Text;
  private banner: Phaser.GameObjects.Text;

  constructor(private scene: Phaser.Scene, private room: KitchenRoom, depth: number) {
    const size = KITCHEN_GRID.cell - 4;
    this.grid = scene.add.graphics().setDepth(depth).setVisible(false);
    this.ghost = scene.add.rectangle(0, 0, size, size).setDepth(depth).setVisible(false);
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

  start(item: EquipmentId) {
    this.item = item;
    this.cell = null;
    this.drawGrid();
    this.ghostIcon.setText(EQUIPMENT[item].emoji);
    this.banner
      .setText(`Clicca una casella libera in cucina per posizionare: ${EQUIPMENT[item].label} · Esc per annullare`)
      .setVisible(true);
  }

  stop() {
    this.item = null;
    this.cell = null;
    for (const object of [this.grid, this.ghost, this.ghostIcon, this.banner]) object.setVisible(false);
  }

  /** Re-checks the square under the mouse: it can become free or taken while placing (the cook moves). */
  update() {
    if (this.item && this.cell) this.showGhost(this.cell.col, this.cell.row);
  }

  private track(pointer: Phaser.Input.Pointer) {
    if (!this.item) return;
    const col = Math.floor(pointer.worldX / KITCHEN_GRID.cell);
    const row = Math.floor(pointer.worldY / KITCHEN_GRID.cell);
    const inside = col >= 0 && row >= 0 && col < KITCHEN_GRID.cols && row < KITCHEN_GRID.rows;
    this.cell = inside ? { col, row } : null;
    if (this.cell) this.showGhost(col, row);
    else {
      this.ghost.setVisible(false);
      this.ghostIcon.setVisible(false);
    }
  }

  private showGhost(col: number, row: number) {
    const { x, y } = cellCenter(col, row);
    const color = canPlaceEquipment(this.room.state, col, row) ? VALID : INVALID;
    this.ghost.setPosition(x, y).setFillStyle(color, 0.35).setStrokeStyle(2, color).setVisible(true);
    this.ghostIcon.setPosition(x, y).setVisible(true);
  }

  private place(pointer: Phaser.Input.Pointer) {
    this.track(pointer);
    if (!this.item || !this.cell || !canPlaceEquipment(this.room.state, this.cell.col, this.cell.row)) return;
    this.room.send(Message.BuyEquipment, { item: this.item, ...this.cell } satisfies BuyEquipmentMessage);
    this.stop();
  }

  private drawGrid() {
    const { cell, cols, rows } = KITCHEN_GRID;
    this.grid.clear().lineStyle(1, 0x3b2a1e, 0.35);
    for (let col = 0; col <= cols; col++) this.grid.lineBetween(col * cell, 0, col * cell, rows * cell);
    for (let row = 0; row <= rows; row++) this.grid.lineBetween(0, row * cell, cols * cell, row * cell);
    this.grid.setVisible(true);
  }
}
