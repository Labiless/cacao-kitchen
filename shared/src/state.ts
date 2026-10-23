import { schema, t, type SchemaType } from "@colyseus/schema";

export const Player = schema({
  name: t.string(),
  color: t.string(),
  x: t.number(),
  y: t.number(),
}, "Player");
export type Player = SchemaType<typeof Player>;

export const KitchenState = schema({
  players: t.map(Player),
}, "KitchenState");
export type KitchenState = SchemaType<typeof KitchenState>;
