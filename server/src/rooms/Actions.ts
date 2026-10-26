import {
  ACTIONS,
  customerReadyToPay,
  isNearDeliveryBay,
  isNearRegister,
  isNearTable,
  tableActionFor,
  type ActionId,
  type Player,
} from "@cacao/shared";
import type { Customers } from "./Customers.ts";
import type { Kitchen } from "./Kitchen.ts";
import type { RoomContext } from "./context.ts";

/**
 * Timed actions (cleaning a table, taking payment, unloading a delivery): they complete after
 * ACTIONS[id].durationMs, unless the player walks away or the target changes first.
 */
export class Actions {
  /** When each player's current action completes, in room clock milliseconds. Server-only. */
  private endsAt = new Map<string, number>();

  constructor(private ctx: RoomContext, private customers: Customers, private kitchen: Kitchen) {}

  start(sessionId: string, player: Player, action: ActionId, targetId: string) {
    player.action = action;
    player.actionTarget = targetId;
    this.endsAt.set(sessionId, this.ctx.clock.currentTime + ACTIONS[action].durationMs);
  }

  /** Completes the player's action when its time is up, or cancels it if it's no longer possible. */
  update(sessionId: string, player: Player) {
    if (!player.action) return;

    // Walked away, or the target changed under us: the action is lost.
    if (!this.canContinue(player)) {
      this.clear(sessionId, player);
      return;
    }
    if (this.ctx.clock.currentTime < (this.endsAt.get(sessionId) ?? 0)) return;

    const { state } = this.ctx;
    switch (player.action) {
      case "cleanTable":
        state.tables.get(player.actionTarget)!.status = "free";
        break;
      case "checkout":
        this.customers.checkout(state.customers.get(player.actionTarget)!);
        break;
      case "receiveDelivery":
        this.kitchen.receiveDelivery();
        break;
    }
    this.clear(sessionId, player);
  }

  clear(sessionId: string, player: Player) {
    player.action = "";
    player.actionTarget = "";
    this.endsAt.delete(sessionId);
  }

  /** A player left the room: forget their action. */
  forget(sessionId: string) {
    this.endsAt.delete(sessionId);
  }

  private canContinue(player: Player) {
    const { state } = this.ctx;
    switch (player.action) {
      case "cleanTable": {
        const table = state.tables.get(player.actionTarget);
        return !!table && isNearTable(player, table) && tableActionFor(table.status) === "cleanTable";
      }
      case "checkout":
        return isNearRegister(player) && customerReadyToPay(state)?.id === player.actionTarget;
      case "receiveDelivery":
        return isNearDeliveryBay(player) && state.delivery.status === "arrived";
      default:
        return false;
    }
  }
}
