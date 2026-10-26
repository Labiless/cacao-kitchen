import { useEffect } from "react";
import { MENU, Message, orderChoices, unlockedMenu, type MenuItemId, type PlaceOrderMessage } from "@cacao/shared";
import type { KitchenRoom } from "../network.ts";

interface Props {
  room: KitchenRoom;
  customerId: string;
  wants: MenuItemId;
}

/**
 * Opened when the waiter takes an order: the customer shows a picture of the dish they want, the waiter
 * clicks the matching one among a few. The click sends the order straight away.
 */
export function OrderDialog({ room, customerId, wants }: Props) {
  const choices = orderChoices(customerId, wants, unlockedMenu(room.state));

  function send(item: MenuItemId) {
    room.send(Message.PlaceOrder, { item } satisfies PlaceOrderMessage);
  }

  function cancel() {
    room.send(Message.CancelOrder);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") cancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="backdrop">
      <div className="card dialog order-dialog" role="dialog" aria-label="Ordinazione">
        <p className="speech order-wish" aria-label="Il cliente indica un piatto">{MENU[wants].emoji}</p>

        <div>
          <small className="hint">Tocca il piatto che vuole il cliente</small>
          <div className="order-choices">
            {choices.map((id) => (
              <button
                key={id}
                type="button"
                className="menu-item order-choice"
                aria-label={MENU[id].label}
                onClick={() => send(id)}
              >
                {MENU[id].emoji}
              </button>
            ))}
          </div>
        </div>

        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={cancel}>Annulla</button>
        </div>
      </div>
    </div>
  );
}
