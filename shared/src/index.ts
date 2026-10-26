// Values that both the server and the client must agree on.
// The synced room state (Colyseus Schema) lives in ./state.ts, the dining hall layout and customers
// in ./hall.ts, the kitchen layout in ./kitchen.ts, what a player can do (timed actions, E interactions)
// in ./actions.ts, the menu in ./menu.ts.

import { PLAYER_SIZE, WALL, WORLD } from "./world.ts";
import type { IngredientId, MenuItemId } from "./menu.ts";
import type { EquipmentId } from "./kitchen.ts";
import type { DecorationId } from "./hall.ts";

export const ROOM_NAME = "kitchen";
export const MAX_PLAYERS = 2;
export const SERVER_PORT = 2567;

export const ROLES = ["kitchen", "hall"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_INFO: Record<Role, { label: string; area: string; color: string }> = {
  kitchen: { label: "Cuoco", area: "Cucina", color: "#e8833a" },
  hall: { label: "Cameriere", area: "Sala", color: "#3aa7a3" },
};

export function isRole(value: unknown): value is Role {
  return ROLES.includes(value as Role);
}

/** Horizontal range a player's center may occupy: their own half, minus the wall. */
export function zoneFor(role: Role) {
  const half = PLAYER_SIZE / 2;
  return role === "kitchen"
    ? { minX: half, maxX: WALL.x - WALL.thickness / 2 - half }
    : { minX: WALL.x + WALL.thickness / 2 + half, maxX: WORLD.width - half };
}

export const MAX_NAME_LENGTH = 16;

export const Message = {
  Input: "input",
  SetName: "setName",
  /** No payload: the server works out what pressing E does (see availableInteraction). */
  Interact: "interact",
  /** Payload: PlaceOrderMessage. Sent from the order dialog. */
  PlaceOrder: "placeOrder",
  /** No payload. Closes the order dialog without ordering. */
  CancelOrder: "cancelOrder",
  /** Payload: DiscardTicketMessage. The cook throws a ticket away. */
  DiscardTicket: "discardTicket",
  /** Payload: TakeIngredientMessage. Sent from the fridge or freezer popup. */
  TakeIngredient: "takeIngredient",
  /** Payload: TakeIngredientMessage. Puts one carried ingredient back, from the fridge or freezer popup. */
  PutBackIngredient: "putBackIngredient",
  /** Payload: StartRecipeMessage. Sent from an appliance popup: the first step of a recipe. */
  StartRecipe: "startRecipe",
  /** Payload: BuyEquipmentMessage. Sent when the waiter places what they bought on the computer. */
  BuyEquipment: "buyEquipment",
  /** Payload: BuyDecorationMessage. Sent when the waiter places a decoration they bought on the computer. */
  BuyDecoration: "buyDecoration",
  /** Payload: BuyRecipeMessage. Sent from the recipe book. */
  BuyRecipe: "buyRecipe",
  /** Server → clients. Payload: DishSpoiledMessage. A dish went bad and was thrown away. */
  DishSpoiled: "dishSpoiled",
  /** Payload: OrderSuppliesMessage. Sent from the phone popup; one order at a time. */
  OrderSupplies: "orderSupplies",
  /** No payload. Between shifts: this player is ready for the next one. */
  Ready: "ready",
} as const;

export interface OrderSuppliesMessage {
  /** How many packs of each ingredient. */
  packs: Partial<Record<IngredientId, number>>;
}

export interface StartRecipeMessage {
  applianceId: string;
  dish: MenuItemId;
}

export interface BuyDecorationMessage {
  item: DecorationId;
  /** Index into DECORATION_SLOTS. */
  slot: number;
}

export interface BuyRecipeMessage {
  recipe: MenuItemId;
}

export interface DishSpoiledMessage {
  /** Where it was thrown away. */
  x: number;
  y: number;
  /** Who gets to see it: the kitchen for appliances and the cook's hands, everyone for the pass. */
  seenBy: Role | "everyone";
}

export interface BuyEquipmentMessage {
  item: EquipmentId;
  /** Grid square in the kitchen where it goes (see KITCHEN_GRID). */
  col: number;
  row: number;
}

export interface TakeIngredientMessage {
  ingredient: IngredientId;
}

export interface DiscardTicketMessage {
  ticketId: string;
}

export interface PlaceOrderMessage {
  item: MenuItemId;
}

/** Keys currently held by a player; sent to the server whenever it changes. */
export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

export interface JoinOptions {
  /** Optional: players joining from an invite link pick their name once inside. */
  name?: string;
  /** Only honored for the room creator; whoever joins next gets the other role. */
  role?: Role;
}

/** Trims and caps a player-provided name; returns "" if nothing usable is left. */
export function cleanName(raw: unknown) {
  return String(raw ?? "").trim().slice(0, MAX_NAME_LENGTH);
}

export * from "./world.ts";
export * from "./state.ts";
export * from "./hall.ts";
export * from "./kitchen.ts";
export * from "./actions.ts";
export * from "./menu.ts";
export * from "./shift.ts";
export * from "./reviews.ts";
