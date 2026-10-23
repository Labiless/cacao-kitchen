import { schema, t, type SchemaType } from "@colyseus/schema";
import type { Role } from "./index.ts";
import type { CustomerStatus, TableStatus } from "./hall.ts";
import type { ActionId } from "./actions.ts";
import type { MenuItemId } from "./menu.ts";

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
}, "Customer");
export type Customer = SchemaType<typeof Customer>;

/** An order sent by the waiter; what the kitchen will cook. */
export const Order = schema({
  id: t.string(),
  customerId: t.string(),
  tableId: t.string(),
  /** What the waiter selected, which may not be what the customer asked for. */
  item: t.string<MenuItemId>(),
}, "Order");
export type Order = SchemaType<typeof Order>;

export const KitchenState = schema({
  players: t.map(Player),
  tables: t.map(Table),
  customers: t.map(Customer),
  orders: t.map(Order),
}, "KitchenState");
export type KitchenState = SchemaType<typeof KitchenState>;
