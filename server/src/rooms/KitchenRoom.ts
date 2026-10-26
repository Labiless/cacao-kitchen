import { Room, type Client } from "colyseus";
import {
  INGREDIENT_IDS,
  KitchenState,
  MAX_PLAYERS,
  Message,
  Player,
  ROLES,
  ROLE_INFO,
  STARTING_MONEY_CENTS,
  TABLE_LAYOUT,
  Table,
  availableInteraction,
  cleanName,
  isRole,
  type InputState,
  type JoinOptions,
  type Role,
} from "@cacao/shared";
import { Actions } from "./Actions.ts";
import { Customers } from "./Customers.ts";
import { Kitchen } from "./Kitchen.ts";
import { Shifts } from "./Shifts.ts";
import { Shop } from "./Shop.ts";
import type { MessageHandler, RoomContext } from "./context.ts";
import { NO_INPUT, movePlayer, moveToStart } from "./movement.ts";

/**
 * One restaurant, two players. The room owns the state and the players; the game itself lives in its
 * parts: the customers (Customers), the cook's side (Kitchen), timed actions (Actions), the shift
 * cycle (Shifts) and the computer's shop (Shop).
 */
export class KitchenRoom extends Room<{ state: KitchenState }> {
  maxClients = MAX_PLAYERS;
  state = new KitchenState();

  /** Latest input per sessionId. Server-only: not part of the synced state. */
  private heldKeys = new Map<string, InputState>();

  private readonly ctx: RoomContext = {
    state: this.state,
    clock: this.clock,
    broadcast: (type, message) => this.broadcast(type, message),
  };
  private kitchen = new Kitchen(this.ctx);
  private customers = new Customers(this.ctx, this.kitchen);
  private actions = new Actions(this.ctx, this.customers, this.kitchen);
  private shifts = new Shifts(this.ctx, this.customers, this.kitchen, () => this.clearDay());
  private shop = new Shop(this.ctx, this.kitchen);

  onCreate() {
    // The room opens on a break: the first shift starts once everyone is ready.
    this.state.money = STARTING_MONEY_CENTS;
    for (const ingredient of INGREDIENT_IDS) this.state.stock.set(ingredient, 0);
    this.kitchen.resetAppliances();
    for (const { id, x, y } of TABLE_LAYOUT) {
      const table = new Table();
      table.id = id;
      table.x = x;
      table.y = y;
      table.status = "free";
      this.state.tables.set(id, table);
    }

    const on = <T>(type: string, handler: MessageHandler<T>) => this.onMessage(type, handler);
    const onShift = <T>(type: string, handler: MessageHandler<T>) => this.onShiftMessage(type, handler);

    on(Message.Input, (client, input: Partial<InputState>) => {
      // Never trust the client: coerce everything to booleans.
      this.heldKeys.set(client.sessionId, {
        left: !!input?.left,
        right: !!input?.right,
        up: !!input?.up,
        down: !!input?.down,
      });
    });

    on(Message.SetName, (client, name: string) => {
      const player = this.state.players.get(client.sessionId);
      const cleaned = cleanName(name);
      if (player && cleaned) player.name = cleaned;
    });

    onShift(Message.Interact, (client) => this.interact(client.sessionId));

    this.customers.register(onShift, on);
    this.kitchen.register(onShift);
    this.shop.register(onShift);
    this.shifts.register(on);

    this.setSimulationInterval((deltaMs) => this.update(deltaMs / 1000));
  }

  onJoin(client: Client, options: JoinOptions) {
    const role = this.pickRole(options?.role);
    const player = new Player();
    player.role = role;
    player.name = cleanName(options?.name) || ROLE_INFO[role].label;
    player.color = ROLE_INFO[role].color;
    moveToStart(player);

    this.state.players.set(client.sessionId, player);
    this.heldKeys.set(client.sessionId, NO_INPUT);
    console.log(`[${this.roomId}] ${player.name} joined as ${role}`);
  }

  onLeave(client: Client) {
    // A customer they were leading is released by Customers.update().
    this.state.players.delete(client.sessionId);
    this.heldKeys.delete(client.sessionId);
    this.actions.forget(client.sessionId);
    // Whoever is left may have been waiting only for them.
    this.shifts.startIfReady();
  }

  /** The requested role if it's still free, otherwise whichever one is left. */
  private pickRole(preferred: unknown): Role {
    const taken = new Set([...this.state.players.values()].map((p) => p.role));
    if (isRole(preferred) && !taken.has(preferred)) return preferred;
    return ROLES.find((role) => !taken.has(role)) ?? ROLES[0];
  }

  /** Like onMessage, but drops the message outside a shift: nothing can be done while a report is up. */
  private onShiftMessage<T>(type: string, handler: MessageHandler<T>) {
    this.onMessage(type, (client, message: T) => {
      const { phase } = this.state.shift;
      if (phase === "open" || phase === "closing") handler(client, message);
    });
  }

  /** Everything that doesn't carry over from one shift to the next: food, customers, tickets, hands. */
  private clearDay() {
    this.kitchen.clearDay();
    this.customers.clearDay();
    this.state.players.forEach((player, sessionId) => {
      player.ready = false;
      player.holding.clear();
      player.freshness = 0;
      this.actions.clear(sessionId, player);
      moveToStart(player);
    });
  }

  /** E was pressed: do whatever the shared rules say is possible from where the player stands. */
  private interact(sessionId: string) {
    const { state } = this;
    const player = state.players.get(sessionId);
    const interaction = availableInteraction(state, sessionId);
    if (!player || !interaction) return;

    switch (interaction.kind) {
      case "lead":
        this.customers.lead(state.customers.get(interaction.customerId)!, sessionId);
        break;
      case "release":
        this.customers.release(state.customers.get(interaction.customerId)!);
        break;
      case "takeOrder":
        this.customers.takeOrder(state.customers.get(interaction.customerId)!, sessionId);
        break;
      case "seat":
        this.customers.seat(state.customers.get(interaction.customerId)!, state.tables.get(interaction.tableId)!);
        break;
      case "serve":
        player.holding.clear();
        player.freshness = 0;
        this.customers.serve(state.customers.get(interaction.customerId)!, interaction.dish);
        break;
      case "continueRecipe":
        this.kitchen.continueRecipe(player, state.appliances.get(interaction.applianceId)!, interaction.dish, interaction.step);
        break;
      case "takeFromAppliance":
        this.kitchen.takeFromAppliance(player, state.appliances.get(interaction.applianceId)!, interaction.dish, interaction.step);
        break;
      case "placeOnPass":
        this.kitchen.placeOnPass(player, interaction.dish);
        break;
      case "takeFromPass":
        this.kitchen.takeFromPass(player, interaction.dish);
        break;
      case "action":
        this.actions.start(sessionId, player, interaction.action, interaction.targetId);
        break;
      case "readTicket":
      case "openStorage":
      case "openAppliance":
      case "openPhone":
      case "openComputer":
      case "openRecipeBook":
      case "blocked":
        // Nothing to do on the server: these only open a popup (or explain why E does nothing).
        break;
    }
  }

  private update(dt: number) {
    this.shifts.update();
    this.state.players.forEach((player, sessionId) => {
      movePlayer(this.state, player, this.heldKeys.get(sessionId) ?? NO_INPUT, dt);
      this.actions.update(sessionId, player);
    });
    this.customers.update(dt);
    this.kitchen.update(dt);
  }
}
