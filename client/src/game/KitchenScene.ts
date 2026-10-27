import * as Phaser from "phaser";
import {
  Message,
  WORLD,
  attendedCustomer,
  availableInteraction,
  interactionLabel,
  type InputState,
  type Interaction,
  type Role,
} from "@cacao/shared";
import type { KitchenRoom } from "../network.ts";
import { HallView } from "./HallView.ts";
import { KitchenView } from "./KitchenView.ts";
import { PlayersView } from "./PlayersView.ts";
import { Placement, type PlacementItem } from "./Placement.ts";
import { sounds, type SoundName } from "./Sounds.ts";
import { interactionTarget } from "./interactionTarget.ts";
import { drawMap } from "./mapDrawing.ts";
import { createCharacterAnimations, loadCharacterSprites } from "./characterSprites.ts";
import { Bars, Depth, TEXT_STYLE, roomCallbacks, type Unsubscribe, type ViewContext } from "./sceneStyle.ts";

const NO_INPUT: InputState = { left: false, right: false, up: false, down: false };

/** A popup that only exists in React, opened from the scene. */
export type ScenePopup =
  | { kind: "ticket"; ticketId: string }
  | { kind: "storage"; storage: "fridge" | "freezer" }
  | { kind: "appliance"; applianceId: string }
  | { kind: "phone" }
  | { kind: "computer" }
  | { kind: "recipeBook" };
/** Game event asking React to open a popup; the payload is a ScenePopup. */
export const OPEN_POPUP_EVENT = "openPopup";
/** Game event from React to start placing something bought on the computer; the payload is a PlacementItem. */
export const START_PLACEMENT_EVENT = "startPlacement";
/** Registry key React sets while one of its popups is open, so the scene ignores movement and E. */
export const MODAL_OPEN_KEY = "modalOpen";

/** Sounds when E opens a popup. */
const POPUP_SOUNDS: Partial<Record<Interaction["kind"], SoundName>> = {
  readTicket: "pageFlip", openStorage: "fridge", openPhone: "pickUp", openComputer: "keyboard", openRecipeBook: "pageFlip",
};

/**
 * The game map. It draws the room through three views (the hall, the kitchen, the players) and takes
 * care of what's common to them: the local player's keys and E, the hint for what E does, popups,
 * placing things bought on the computer, and the shift's sounds.
 */
export class KitchenScene extends Phaser.Scene {
  private hall!: HallView;
  private kitchen!: KitchenView;
  private players!: PlayersView;
  private placement!: Placement;
  private bars!: Bars;
  private hint!: Phaser.GameObjects.Text;
  private keys!: Record<"up" | "down" | "left" | "right" | "w" | "a" | "s" | "d", Phaser.Input.Keyboard.Key>;
  private lastInput: InputState = NO_INPUT;
  /**
   * False while the state callbacks replay what's already in the room on joining: only changes that
   * happen while playing make a sound.
   */
  private live = false;

  constructor(private room: KitchenRoom) {
    super("kitchen");
  }

  preload() {
    loadCharacterSprites(this);
  }

  create() {
    drawMap(this);
    createCharacterAnimations(this);

    this.bars = new Bars(this.add.graphics().setDepth(Depth.Label));
    const ctx: ViewContext = {
      scene: this,
      room: this.room,
      bars: this.bars,
      sees: (area) => this.sees(area),
      playSound: (name, side, x) => this.playSound(name, side, x),
      panFor: (x) => this.panFor(x),
      isLive: () => this.live,
    };
    this.hall = new HallView(ctx);
    this.kitchen = new KitchenView(ctx);
    this.players = new PlayersView(ctx);

    this.hint = this.add
      .text(0, 0, "", { ...TEXT_STYLE, fontSize: "13px", backgroundColor: "#fffaf3", padding: { x: 6, y: 3 } })
      .setOrigin(0.5, 1)
      .setDepth(Depth.Label)
      .setVisible(false);

    // No key capture: otherwise Phaser swallows these keys and they can't be typed into React inputs.
    this.keys = this.input.keyboard!.addKeys({
      up: "UP", down: "DOWN", left: "LEFT", right: "RIGHT", w: "W", a: "A", s: "S", d: "D",
    }, false) as typeof this.keys;
    // E or the space bar.
    this.input.keyboard!.on("keydown-E", () => this.interact());
    this.input.keyboard!.on("keydown-SPACE", () => this.interact());
    // Browsers only start audio after a gesture.
    this.input.keyboard!.on("keydown", () => sounds.unlock());
    this.input.on(Phaser.Input.Events.POINTER_DOWN, () => sounds.unlock());

    this.placement = new Placement(this, this.room, Depth.Overlay);
    const startPlacement = (item: PlacementItem) => this.placement.start(item);
    this.game.events.on(START_PLACEMENT_EVENT, startPlacement);

    const callbacks = roomCallbacks(this.room);
    const unsubscribe: Unsubscribe[] = [
      ...this.players.subscribe(callbacks),
      ...this.hall.subscribe(callbacks),
      ...this.kitchen.subscribe(callbacks),
      callbacks.listen(this.room.state.shift, "phase", (phase, previous) => {
        if (phase === "open") this.playSound("shiftOpen", null);
        if (phase === "closing") this.playSound("shiftClosing", null);
        // A shift passed is a level passed: fanfare (just a chime once at the top level).
        if (phase === "break" && previous === "closing") {
          this.playSound(this.room.state.shift.report.newLevel ? "levelUp" : "shiftEnd", null);
        }
        if (phase === "gameOver") this.playSound("gameOver", null);
        if (phase === "break" || phase === "gameOver") sounds.stopAllLoops();
      }),
    ];
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubscribe.forEach((off) => off());
      this.game.events.off(START_PLACEMENT_EVENT, startPlacement);
      sounds.stopAllLoops();
    });
    this.live = true;
  }

  update(_time: number, delta: number) {
    this.sendInput();

    this.players.update(delta);
    this.hall.update(delta);
    this.kitchen.update();
    this.placement.update();

    this.bars.clear();
    this.drawInteractionHint();
    this.drawActionProgress();
    this.kitchen.drawApplianceProgress();
    this.hall.drawPatience();
    this.kitchen.drawFreshness();
    this.players.drawFreshness();
  }

  /**
   * Each player only sees the details of their own side: the cook doesn't see how customers are doing,
   * the waiter doesn't see tickets or what's cooking. Both see the room itself, the people and the pass.
   */
  private sees(area: Role) {
    return this.room.state.players.get(this.room.sessionId)?.role === area;
  }

  /**
   * Plays a sound for whoever works on `side` (null: both), panned to where it happens on the map.
   * Silent while the room's existing state is being replayed on joining.
   */
  private playSound(name: SoundName, side: Role | null, x = WORLD.width / 2) {
    if (!this.live || (side && !this.sees(side))) return;
    sounds.play(name, this.panFor(x));
  }

  /** Stereo position for something at `x`: a bit to the left in the kitchen, to the right in the hall. */
  private panFor(x: number) {
    return ((x / WORLD.width) * 2 - 1) * 0.6;
  }

  /** What E would do for the local player right now, judged from where they appear on screen. */
  private currentInteraction() {
    const position = this.players.myPosition();
    if (!position) return null;
    return availableInteraction(this.room.state, this.room.sessionId, position);
  }

  private interact() {
    if (document.activeElement instanceof HTMLInputElement || this.registry.get(MODAL_OPEN_KEY)) return;
    if (this.placement.active) return;
    const interaction = this.currentInteraction();
    if (!interaction || interaction.kind === "blocked") return;

    const popupSound = POPUP_SOUNDS[interaction.kind];
    if (popupSound) this.playSound(popupSound, null, this.players.myPosition()?.x);
    if (interaction.kind === "readTicket") this.openPopup({ kind: "ticket", ticketId: interaction.ticketId });
    else if (interaction.kind === "openStorage") this.openPopup({ kind: "storage", storage: interaction.storage });
    else if (interaction.kind === "openAppliance") this.openPopup({ kind: "appliance", applianceId: interaction.applianceId });
    else if (interaction.kind === "openPhone") this.openPopup({ kind: "phone" });
    else if (interaction.kind === "openComputer") this.openPopup({ kind: "computer" });
    else if (interaction.kind === "openRecipeBook") this.openPopup({ kind: "recipeBook" });
    else this.room.send(Message.Interact);
  }

  private openPopup(popup: ScenePopup) {
    this.game.events.emit(OPEN_POPUP_EVENT, popup);
  }

  /** Outlines what the local player can act on and shows which key to press. */
  private drawInteractionHint() {
    const interaction = this.placement.active ? null : this.currentInteraction();
    const target = interaction && interactionTarget(interaction, this.room.state, (id) => this.hall.customerBox(id));
    this.hall.highlight(target);
    this.kitchen.highlight(target);

    this.hint.setVisible(!!target);
    if (interaction && target) {
      const key = interaction.kind === "blocked" ? "⛔" : "E/Spazio ·";
      this.hint.setText(`${key} ${interactionLabel(interaction)}`);
      // Things on the top wall have no room above them: show the hint underneath instead.
      if (target.top < 40) this.hint.setOrigin(0.5, 0).setPosition(target.x, target.bottom + 6);
      else this.hint.setOrigin(0.5, 1).setPosition(target.x, target.top - 6);
    }
  }

  /** A bar over the target of every timed action in progress, seen only from the side where it happens. */
  private drawActionProgress() {
    for (const { player, progress } of this.players.actionsInProgress()) {
      if (!this.sees(player.role) || !player.action) continue;
      if (player.action === "receiveDelivery") this.kitchen.drawActionBar(progress);
      else this.hall.drawActionBar(player.action, player.actionTarget, progress);
    }
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
}
