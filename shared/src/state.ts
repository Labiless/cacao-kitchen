import { schema, t, type SchemaType } from "@colyseus/schema";
import type { Role } from "./index.ts";
import type { CustomerStatus, TableStatus } from "./hall.ts";
import type { ActionId } from "./actions.ts";

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
  /** 1 = just arrived, 0 = out of patience. Only drains while waiting at the entrance. */
  patience: t.number(),
  /** sessionId of the waiter leading them, while following. */
  leaderId: t.string().default(""),
  /** Table they sit at, while seated. */
  tableId: t.string().default(""),
}, "Customer");
export type Customer = SchemaType<typeof Customer>;

export const KitchenState = schema({
  players: t.map(Player),
  tables: t.map(Table),
  customers: t.map(Customer),
}, "KitchenState");
export type KitchenState = SchemaType<typeof KitchenState>;
