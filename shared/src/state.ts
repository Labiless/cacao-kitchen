import { schema, t, type SchemaType } from "@colyseus/schema";
import type { Role } from "./index.ts";
import type { TableStatus } from "./hall.ts";

export const Player = schema({
  name: t.string(),
  role: t.string<Role>(),
  color: t.string(),
  x: t.number(),
  y: t.number(),
}, "Player");
export type Player = SchemaType<typeof Player>;

export const Table = schema({
  id: t.string(),
  x: t.number(),
  y: t.number(),
  status: t.string<TableStatus>(),
}, "Table");
export type Table = SchemaType<typeof Table>;

export const KitchenState = schema({
  players: t.map(Player),
  tables: t.map(Table),
}, "KitchenState");
export type KitchenState = SchemaType<typeof KitchenState>;
