import {
  DECORATIONS,
  Decoration,
  EQUIPMENT,
  Message,
  canBuyEquipment,
  canPlaceDecoration,
  canPlaceEquipment,
  isDecoration,
  isEquipment,
  isNearComputer,
  type BuyDecorationMessage,
  type BuyEquipmentMessage,
} from "@cacao/shared";
import type { Kitchen } from "./Kitchen.ts";
import type { OnMessage, RoomContext } from "./context.ts";

/** The waiter's computer: appliances for the kitchen and decorations for the hall, paid when placed. */
export class Shop {
  private decorationCount = 0;

  constructor(private ctx: RoomContext, private kitchen: Kitchen) {}

  register(onShift: OnMessage) {
    const { state } = this.ctx;
    /** The waiter, if they're at the computer. */
    const buyer = (sessionId: string) => {
      const player = state.players.get(sessionId);
      return player?.role === "hall" && isNearComputer(player) ? player : null;
    };
    const pay = (priceCents: number) => {
      state.money -= priceCents;
      state.shift.report.improvementsCents += priceCents;
    };

    onShift(Message.BuyDecoration, (client, message: BuyDecorationMessage) => {
      if (!buyer(client.sessionId) || !isDecoration(message?.item)) return;
      const { priceCents } = DECORATIONS[message.item];
      if (state.money < priceCents || !canPlaceDecoration(state, message.slot)) return;

      pay(priceCents);
      const decoration = new Decoration();
      decoration.id = `d${++this.decorationCount}`;
      decoration.kind = message.item;
      decoration.slot = message.slot;
      state.decorations.set(decoration.id, decoration);
    });

    onShift(Message.BuyEquipment, (client, message: BuyEquipmentMessage) => {
      if (!buyer(client.sessionId) || !isEquipment(message?.item)) return;
      const { priceCents } = EQUIPMENT[message.item];
      if (state.money < priceCents || !canBuyEquipment(state, message.item)) return;
      if (!canPlaceEquipment(state, message.col, message.row)) return;

      pay(priceCents);
      this.kitchen.addAppliance(message.item, message.col, message.row);
    });
  }
}
