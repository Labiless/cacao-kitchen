import { Room, type Client } from "colyseus";
import {
  KitchenState,
  MAX_PLAYERS,
  Message,
  PLAYER_COLORS,
  PLAYER_SIZE,
  PLAYER_SPEED,
  Player,
  WORLD,
  type InputState,
  type JoinOptions,
} from "@cacao/shared";

const NO_INPUT: InputState = { left: false, right: false, up: false, down: false };

export class KitchenRoom extends Room<{ state: KitchenState }> {
  maxClients = MAX_PLAYERS;
  state = new KitchenState();

  /** Latest input per sessionId. Server-only: not part of the synced state. */
  private heldKeys = new Map<string, InputState>();

  onCreate() {
    this.onMessage(Message.Input, (client, input: Partial<InputState>) => {
      // Never trust the client: coerce everything to booleans.
      this.heldKeys.set(client.sessionId, {
        left: !!input?.left,
        right: !!input?.right,
        up: !!input?.up,
        down: !!input?.down,
      });
    });

    this.setSimulationInterval((deltaMs) => this.update(deltaMs / 1000));
  }

  onJoin(client: Client, options: JoinOptions) {
    const taken = new Set([...this.state.players.values()].map((p) => p.color));
    const color = PLAYER_COLORS.find((c) => !taken.has(c)) ?? PLAYER_COLORS[0];
    const index = this.state.players.size;

    const player = new Player();
    player.name = String(options?.name ?? "").trim().slice(0, 16) || `Cuoco ${index + 1}`;
    player.color = color;
    player.x = WORLD.width * (index === 0 ? 0.3 : 0.7);
    player.y = WORLD.height / 2;

    this.state.players.set(client.sessionId, player);
    this.heldKeys.set(client.sessionId, NO_INPUT);
    console.log(`[${this.roomId}] ${player.name} joined`);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.heldKeys.delete(client.sessionId);
  }

  private update(dt: number) {
    const half = PLAYER_SIZE / 2;
    this.state.players.forEach((player, sessionId) => {
      const input = this.heldKeys.get(sessionId) ?? NO_INPUT;
      let dx = Number(input.right) - Number(input.left);
      let dy = Number(input.down) - Number(input.up);
      if (dx === 0 && dy === 0) return;

      // Normalize so diagonal movement isn't faster.
      const length = Math.hypot(dx, dy);
      dx /= length;
      dy /= length;

      player.x = clamp(player.x + dx * PLAYER_SPEED * dt, half, WORLD.width - half);
      player.y = clamp(player.y + dy * PLAYER_SPEED * dt, half, WORLD.height - half);
    });
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
