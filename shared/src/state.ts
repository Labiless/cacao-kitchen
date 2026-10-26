import { schema, t, type SchemaType } from "@colyseus/schema";
import type { Role } from "./index.ts";
import type { CustomerStatus, DecorationId, TableStatus } from "./hall.ts";
import type { ActionId } from "./actions.ts";
import type { MenuItemId } from "./menu.ts";
import type { ApplianceStatus, DeliveryStatus, EquipmentId } from "./kitchen.ts";
import type { ShiftPhase } from "./shift.ts";

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
  /**
   * What the player carries (HeldItem ids): one finished dish, one half-made dish (see prepItem), or up
   * to MAX_HELD_INGREDIENTS ingredients.
   */
  holding: t.array("string"),
  /** Freshness of the dish they carry: 1 = just cooked, 0 = thrown away. See DISH_FRESH_S. */
  freshness: t.number().default(0),
  /** Between shifts: whether they've said they're ready for the next one. */
  ready: t.boolean().default(false),
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
  /** Tip they'll leave on top of the bill, in cents; set when served. See tipFor. */
  tip: t.number().default(0),
  /** Stars from their review, set as they leave; 0 = no review (they never got a table). See reviewStars. */
  rating: t.uint8().default(0),
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

/** A piece of kitchen equipment on the grid: a stove, an oven, the freezer… */
export const Appliance = schema({
  id: t.string(),
  kind: t.string<EquipmentId>(),
  /** Center of the grid square it stands on. */
  x: t.number(),
  y: t.number(),
  status: t.string<ApplianceStatus>().default("idle"),
  /** The dish whose step is in progress or done; "" when idle. */
  dish: t.string<MenuItemId | "">().default(""),
  /** Its level, 1 to MAX_APPLIANCE_TIER: higher levels make steps quicker (see stepMs). */
  tier: t.uint8().default(1),
  /** Index into the dish's recipe steps of the step in progress or done. */
  step: t.uint8().default(0),
  /** Freshness of a finished dish waiting on it: 1 = just cooked, 0 = thrown away. See DISH_FRESH_S. */
  freshness: t.number().default(0),
}, "Appliance");
export type Appliance = SchemaType<typeof Appliance>;
/** A dish waiting on the pass. */
export const PassDish = schema({
  dish: t.string<MenuItemId>(),
  /** 1 = just cooked, 0 = thrown away. See DISH_FRESH_S. */
  freshness: t.number(),
}, "PassDish");
export type PassDish = SchemaType<typeof PassDish>;

/** A decoration in the dining hall. */
export const Decoration = schema({
  id: t.string(),
  kind: t.string<DecorationId>(),
  /** Index into DECORATION_SLOTS. */
  slot: t.uint8(),
}, "Decoration");
export type Decoration = SchemaType<typeof Decoration>;

/** The one supplier order that can be in progress at a time. */
export const Delivery = schema({
  status: t.string<DeliveryStatus>().default("none"),
  /** Units of each ingredient on the truck, by IngredientId. */
  items: t.map("number"),
}, "Delivery");
export type Delivery = SchemaType<typeof Delivery>;

/** The money in and out over one shift, in cents, plus how the customers went. */
export const ShiftReport = schema({
  salesCents: t.number().default(0),
  tipsCents: t.number().default(0),
  /** Ingredient orders on the phone. */
  ingredientsCents: t.number().default(0),
  /** Appliances, decorations and recipes. */
  improvementsCents: t.number().default(0),
  /** Wages and bills: charged when the shift ends. */
  staffCents: t.number().default(0),
  billsCents: t.number().default(0),
  /** Customers who paid, and customers who left unhappy without paying. */
  paid: t.number().default(0),
  lost: t.number().default(0),
  /** Level reached by passing this shift, or 0 if it didn't go up (game over, or already at the top). */
  newLevel: t.number().default(0),
  /** Sum and number of the reviews left during the shift: the shift's score is their average. */
  ratingSum: t.number().default(0),
  ratingCount: t.number().default(0),
}, "ShiftReport");
export type ShiftReport = SchemaType<typeof ShiftReport>;

export const Shift = schema({
  /** Number of the current shift, or of the one just finished during a break; 0 before the first. */
  day: t.number().default(0),
  phase: t.string<ShiftPhase>().default("break"),
  /** Time left before closing, while open. */
  secondsLeft: t.number().default(0),
  /** For the current shift, or the one just finished during a break. */
  report: ShiftReport,
}, "Shift");
export type Shift = SchemaType<typeof Shift>;

export const KitchenState = schema({
  players: t.map(Player),
  tables: t.map(Table),
  customers: t.map(Customer),
  tickets: t.map(Ticket),
  /** Everything placed on the kitchen grid, by id. The fridge is fixed and isn't one of them. */
  appliances: t.map(Appliance),
  /** Decorations in the hall, by id. Like appliances, they stay from one shift to the next. */
  decorations: t.map(Decoration),
  /** Dishes waiting on the pass, oldest first. */
  pass: t.array(PassDish),
  /** Ids of the customers queuing at the till, front of the queue first. */
  queue: t.array("string"),
  /** The restaurant's money, in cents. */
  money: t.number().default(0),
  /** Units of each ingredient in the fridge or freezer (see INGREDIENTS[id].storage), by IngredientId. */
  stock: t.map("number"),
  delivery: Delivery,
  /** One more for every shift passed (see nextLevel): the level decides which recipes are on the menu. */
  level: t.number().default(1),
  shift: Shift,
  /** The restaurant's stars: the average score of every shift that got reviews; 0 before the first. */
  stars: t.number().default(0),
  /** How many shifts `stars` averages over. */
  ratedShifts: t.number().default(0),
}, "KitchenState");
export type KitchenState = SchemaType<typeof KitchenState>;
