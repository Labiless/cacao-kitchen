import * as Phaser from "phaser";
import { WORLD } from "@cacao/shared";
import type { KitchenRoom } from "../network.ts";
import { KitchenScene } from "./KitchenScene.ts";

export { MODAL_OPEN_KEY, OPEN_POPUP_EVENT, type KitchenPopup } from "./KitchenScene.ts";

export function createGame(parent: HTMLElement, room: KitchenRoom) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: WORLD.width,
    height: WORLD.height,
    backgroundColor: "#f6efe4",
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: new KitchenScene(room),
  });
}
