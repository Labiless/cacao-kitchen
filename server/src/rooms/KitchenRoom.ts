import { Room, type Client } from "colyseus";
import {
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
  isRole,
  overlapsTable,
  zoneFor,
  type InputState,
  type JoinOptions,
  type Role,
} from "@cacao/shared";

const NO_INPUT: InputState = { left: false, right: false, up: false, down: false };

export class KitchenRoom extends Room<{ state: KitchenState }> {
  maxClients = MAX_PLAYERS;
  state = new KitchenState();

  /** Latest input per sessionId. Server-only: not part of the synced state. */
  private heldKeys = new Map<string, InputState>();

  onCreate() {
    for (const { id, x, y } of TABLE_LAYOUT) {
      const table = new Table();
      table.id = id;
      table.x = x;
      table.y = y;
      table.status = "free";
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
  }

  private update(dt: number) {
    const half = PLAYER_SIZE / 2;
    this.state.players.forEach((player, sessionId) => {
      const zone = zoneFor(player.role);
      const input = this.heldKeys.get(sessionId) ?? NO_INPUT;
      let dx = Number(input.right) - Number(input.left);
      let dy = Number(input.down) - Number(input.up);
      if (dx === 0 && dy === 0) return;

      // Normalize so diagonal movement isn't faster.
      const length = Math.hypot(dx, dy);
      dx /= length;
      dy /= length;

      // One axis at a time, so a player blocked by a table can still slide along it.
      const nextX = clamp(player.x + dx * PLAYER_SPEED * dt, zone.minX, zone.maxX);
      if (!this.hitsTable(nextX, player.y)) player.x = nextX;
      const nextY = clamp(player.y + dy * PLAYER_SPEED * dt, half, WORLD.height - half);
      if (!this.hitsTable(player.x, nextY)) player.y = nextY;
    });
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
