import type * as Phaser from "phaser";
import {
  CUSTOMER_SIZE,
  DELIVERY_BAY,
  ENTRANCE,
  ENTRANCE_LINE_LENGTH,
  QUEUE_SPOTS,
  REGISTER,
  ROLE_INFO,
  TICKET_SLOTS,
  TICKET_SLOT_SIZE,
  WALL,
  WORLD,
  entranceSpot,
} from "@cacao/shared";
import { TEXT_STYLE } from "./sceneStyle.ts";

/**
 * The parts of the map that never change: kitchen tiles on the left, dining hall floorboards on the
 * right, the wall in between, and the marks on the floor and walls.
 */
export function drawMap(scene: Phaser.Scene) {
  const g = scene.add.graphics();
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

  // Loading bay where the supplier's truck stops.
  g.fillStyle(0xb8ad97, 0.6);
  g.fillRect(DELIVERY_BAY.x - DELIVERY_BAY.width / 2, DELIVERY_BAY.y - DELIVERY_BAY.height / 2, DELIVERY_BAY.width, DELIVERY_BAY.height);
  scene.add
    .text(DELIVERY_BAY.x, DELIVERY_BAY.y + DELIVERY_BAY.height / 2 - 2, "Consegne", { ...TEXT_STYLE, fontSize: "11px" })
    .setOrigin(0.5, 1)
    .setAlpha(0.6);

  // Doormat where customers come in, and marks where the line forms along the bottom wall.
  g.fillStyle(0x9c3d54, 0.55);
  g.fillRect(ENTRANCE.x - ENTRANCE.size / 2, ENTRANCE.y - ENTRANCE.size / 2, ENTRANCE.size, ENTRANCE.size);
  for (let i = 1; i < ENTRANCE_LINE_LENGTH; i++) {
    const { x, y } = entranceSpot(i);
    g.strokeCircle(x, y, CUSTOMER_SIZE / 2 + 2);
  }

  // Area names where there's room: the tickets hang on the top kitchen wall, the line forms along the bottom of the hall.
  const labelStyle = { ...TEXT_STYLE, fontSize: "18px", fontStyle: "bold" };
  scene.add.text(WALL.x / 2, WORLD.height - 16, ROLE_INFO.kitchen.area.toUpperCase(), labelStyle).setOrigin(0.5, 1).setAlpha(0.35);
  scene.add.text((WALL.x + WORLD.width) / 2, 16, ROLE_INFO.hall.area.toUpperCase(), labelStyle).setOrigin(0.5, 0).setAlpha(0.35);
  scene.add
    .text(ENTRANCE.x, ENTRANCE.y + ENTRANCE.size / 2, "Ingresso", { ...TEXT_STYLE, fontSize: "12px" })
    .setOrigin(0.5, 1)
    .setAlpha(0.6);
}
