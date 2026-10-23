import { Room, type Client } from "colyseus";
import {
  ACTIONS,
  KitchenState,
  MAX_PLAYERS,
  Message,
  PLAYER_SIZE,
  PLAYER_SPEED,
  Player,
  ROLES,
  ROLE_INFO,
  TABLE_LAYOUT,
  Table,
  WORLD,
  cleanName,
  isNearTable,
  isRole,
  overlapsTable,
  tableActionFor,
  zoneFor,
  type InputState,
  type InteractMessage,
  type JoinOptions,
  type Role,
} from "@cacao/shared";

const NO_INPUT: InputState = { left: false, right: false, up: false, down: false };

/** Temporary: with no customers yet, a cleaned table gets dirty again on its own so cleaning can be tested. */
const REDIRTY_AFTER_MS = 6000;

export class KitchenRoom extends Room<{ state: KitchenState }> {
  maxClients = MAX_PLAYERS;
  state = new KitchenState();

  /** Latest input per sessionId. Server-only: not part of the synced state. */
  private heldKeys = new Map<string, InputState>();
  /** When each player's current action completes, in room clock time. Server-only. */
  private actionEndsAt = new Map<string, number>();

  onCreate() {
    for (const { id, x, y } of TABLE_LAYOUT) {
      const table = new Table();
      table.id = id;
      table.x = x;
      table.y = y;
      table.status = "dirty";
      this.state.tables.set(id, table);
    }

    this.onMessage(Message.Input, (client, input: Partial<InputState>) => {
      // Never trust the client: coerce everything to booleans.
      this.heldKeys.set(client.sessionId, {
        left: !!input?.left,
        right: !!input?.right,
        up: !!input?.up,
        down: !!input?.down,
      });
    });

    this.onMessage(Message.SetName, (client, name: string) => {
      const player = this.state.players.get(client.sessionId);
      const cleaned = cleanName(name);
      if (player && cleaned) player.name = cleaned;
    });

    this.onMessage(Message.Interact, (client, message: InteractMessage) => {
      this.startTableAction(client.sessionId, String(message?.tableId));
    });

    this.setSimulationInterval((deltaMs) => this.update(deltaMs / 1000));
  }

  onJoin(client: Client, options: JoinOptions) {
    const role = this.pickRole(options?.role);
    const zone = zoneFor(role);

    const player = new Player();
    player.role = role;
    player.name = cleanName(options?.name) || ROLE_INFO[role].label;
    player.color = ROLE_INFO[role].color;
    player.x = (zone.minX + zone.maxX) / 2;
    player.y = WORLD.height / 2;

    this.state.players.set(client.sessionId, player);
    this.heldKeys.set(client.sessionId, NO_INPUT);
    console.log(`[${this.roomId}] ${player.name} joined as ${role}`);
  }

  /** The requested role if it's still free, otherwise whichever one is left. */
  private pickRole(preferred: unknown): Role {
    const taken = new Set([...this.state.players.values()].map((p) => p.role));
    if (isRole(preferred) && !taken.has(preferred)) return preferred;
    return ROLES.find((role) => !taken.has(role)) ?? ROLES[0];
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.heldKeys.delete(client.sessionId);
    this.actionEndsAt.delete(client.sessionId);
  }

  private startTableAction(sessionId: string, tableId: string) {
    const player = this.state.players.get(sessionId);
    const table = this.state.tables.get(tableId);
    if (!player || !table || player.role !== "hall" || player.action) return;
    if (!isNearTable(player, table)) return;

    const action = tableActionFor(table.status);
    if (!action) return;

    player.action = action;
    player.actionTarget = tableId;
    this.actionEndsAt.set(sessionId, this.clock.currentTime + ACTIONS[action].durationMs);
  }

  /** Completes the player's action when its time is up, or cancels it if it's no longer possible. */
  private updateAction(sessionId: string, player: Player) {
    if (!player.action) return;
    const table = this.state.tables.get(player.actionTarget);

    // Walked away, or the table changed under us: the action is lost.
    if (!table || !isNearTable(player, table) || tableActionFor(table.status) !== player.action) {
      this.clearAction(sessionId, player);
      return;
    }
    if (this.clock.currentTime < (this.actionEndsAt.get(sessionId) ?? 0)) return;

    switch (player.action) {
      case "cleanTable":
        table.status = "free";
        this.clock.setTimeout(() => (table.status = "dirty"), REDIRTY_AFTER_MS);
        break;
    }
    this.clearAction(sessionId, player);
  }

  private clearAction(sessionId: string, player: Player) {
    player.action = "";
    player.actionTarget = "";
    this.actionEndsAt.delete(sessionId);
  }

  private update(dt: number) {
    this.state.players.forEach((player, sessionId) => {
      this.movePlayer(player, this.heldKeys.get(sessionId) ?? NO_INPUT, dt);
      this.updateAction(sessionId, player);
    });
  }

  private movePlayer(player: Player, input: InputState, dt: number) {
    let dx = Number(input.right) - Number(input.left);
    let dy = Number(input.down) - Number(input.up);
    if (dx === 0 && dy === 0) return;

    // Normalize so diagonal movement isn't faster.
    const length = Math.hypot(dx, dy);
    dx /= length;
    dy /= length;

    // One axis at a time, so a player blocked by a table can still slide along it.
    const zone = zoneFor(player.role);
    const half = PLAYER_SIZE / 2;
    const nextX = clamp(player.x + dx * PLAYER_SPEED * dt, zone.minX, zone.maxX);
    if (!this.hitsTable(nextX, player.y)) player.x = nextX;
    const nextY = clamp(player.y + dy * PLAYER_SPEED * dt, half, WORLD.height - half);
    if (!this.hitsTable(player.x, nextY)) player.y = nextY;
  }

  private hitsTable(x: number, y: number) {
    for (const table of this.state.tables.values()) {
      if (overlapsTable({ x, y }, table)) return true;
    }
    return false;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
