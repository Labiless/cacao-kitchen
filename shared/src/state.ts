import { schema, t, type SchemaType } from "@colyseus/schema";
import type { Role } from "./index.ts";
import type { CustomerStatus, TableStatus } from "./hall.ts";
import type { ActionId } from "./actions.ts";
import type { MenuItemId } from "./menu.ts";
import type { DeliveryStatus, StoveStatus } from "./kitchen.ts";

export const Player = schema({
  name: t.string(),
  role: t.string<Role>(),
  color: t.string(),
  x: t.number(),
  y: t.number(),
  /** Action in progress, or "" when idle. */
  action: t.string<ActionId | "">().default(""),
  /** Id of the table the action is performed on. */
  actionTarget: t.string().default(""),
  /** What the player carries (HeldItem ids): one dish, or up to MAX_HELD_INGREDIENTS ingredients. */
  holding: t.array("string"),
  /** Freshness of the dish they carry: 1 = just cooked, 0 = thrown away. See DISH_FRESH_S. */
  freshness: t.number().default(0),
}, "Player");
export type Player = SchemaType<typeof Player>;

export const Table = schema({
  id: t.string(),
  x: t.number(),
  y: t.number(),
  status: t.string<TableStatus>(),
}, "Table");
export type Table = SchemaType<typeof Table>;

export const Customer = schema({
  id: t.string(),
  x: t.number(),
  y: t.number(),
  status: t.string<CustomerStatus>(),
  /** 1 = full, 0 = out of patience. See CUSTOMER_TIMING.patienceS for when it drains. */
  patience: t.number(),
  /** sessionId of the waiter leading them (following) or taking their order (ordering). */
  waiterId: t.string().default(""),
  /** Table they sit at, once seated. */
  tableId: t.string().default(""),
  /** What they're going to ask for. */
  wants: t.string<MenuItemId>(),
  /** What they owe for what they've been served, in cents; paid at the till. */
  bill: t.number().default(0),
}, "Customer");
export type Customer = SchemaType<typeof Customer>;

/**
 * An order ticket sent by the waiter, waiting on the kitchen's ticket rail.
 * It's just paper: it outlives the customer and stays until the cook throws it away.
 */
export const Ticket = schema({
  id: t.string(),
  /** Progressive number printed on the ticket. */
  number: t.number(),
  /** Where it hangs on the kitchen wall (index into TICKET_SLOTS). */
  slot: t.uint8(),
  tableId: t.string(),
  /** What the waiter selected, which may not be what the customer asked for. */
  item: t.string<MenuItemId>(),
}, "Ticket");
export type Ticket = SchemaType<typeof Ticket>;

export const Stove = schema({
  id: t.string(),
  /** Center of the grid square it stands on. */
  x: t.number(),
  y: t.number(),
  status: t.string<StoveStatus>().default("idle"),
  /** What's cooking or ready to be picked up; "" when idle. */
  dish: t.string<MenuItemId | "">().default(""),
  /** Freshness of the ready dish: 1 = just cooked, 0 = thrown away. See DISH_FRESH_S. */
  freshness: t.number().default(0),
}, "Stove");
/** A dish waiting on the pass. */
export const PassDish = schema({
  dish: t.string<MenuItemId>(),
  /** 1 = just cooked, 0 = thrown away. See DISH_FRESH_S. */
  freshness: t.number(),
}, "PassDish");
export type PassDish = SchemaType<typeof PassDish>;
export type Stove = SchemaType<typeof Stove>;

/** The one supplier order that can be in progress at a time. */
export const Delivery = schema({
  status: t.string<DeliveryStatus>().default("none"),
  /** Units of each ingredient on the truck, by IngredientId. */
  items: t.map("number"),
}, "Delivery");
export type Delivery = SchemaType<typeof Delivery>;

export const KitchenState = schema({
  players: t.map(Player),
  tables: t.map(Table),
  customers: t.map(Customer),
  tickets: t.map(Ticket),
  stoves: t.map(Stove),
  /** Dishes waiting on the pass, oldest first. */
  pass: t.array(PassDish),
  /** Ids of the customers queuing at the till, front of the queue first. */
  queue: t.array("string"),
  /** The restaurant's money, in cents. */
  money: t.number().default(0),
  /** Units of each ingredient in the fridge, by IngredientId. */
  fridge: t.map("number"),
  delivery: Delivery,
  /** Menu items whose recipe the restaurant knows: the menu. Customers order from these, stock or no stock. */
  unlockedRecipes: t.array("string"),
}, "KitchenState");
export type KitchenState = SchemaType<typeof KitchenState>;
