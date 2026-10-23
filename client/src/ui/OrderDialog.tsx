import { useEffect, useState } from "react";
import { MENU, MENU_ITEMS, Message, orderPhrase, type MenuItemId, type PlaceOrderMessage } from "@cacao/shared";
import type { KitchenRoom } from "../network.ts";

interface Props {
  room: KitchenRoom;
  customerId: string;
  wants: MenuItemId;
}

/** Opened when the waiter takes an order: the customer says what they want, the waiter picks it from the menu. */
export function OrderDialog({ room, customerId, wants }: Props) {
  const [selected, setSelected] = useState<MenuItemId | null>(null);

  function send() {
    if (!selected) return;
    room.send(Message.PlaceOrder, { item: selected } satisfies PlaceOrderMessage);
  }

  function cancel() {
    room.send(Message.CancelOrder);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") cancel();
      if (event.key === "Enter") send();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="backdrop">
      <div className="card dialog order-dialog" role="dialog" aria-label="Ordinazione">
        <p className="speech">“{orderPhrase(customerId, wants)}”</p>

        <div>
          <small className="hint">Seleziona cosa ordina il cliente</small>
          <div className="menu-grid">
            {MENU_ITEMS.map((id) => (
              <button
                key={id}
                type="button"
                className={id === selected ? "menu-item selected" : "menu-item"}
                aria-pressed={id === selected}
                onClick={() => setSelected(id)}
              >
                <span className="menu-emoji">{MENU[id].emoji}</span>
                {MENU[id].label}
              </button>
            ))}
          </div>
        </div>

        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={cancel}>Annulla</button>
          <button type="button" disabled={!selected} onClick={send}>Invia ordine</button>
        </div>
      </div>
    </div>
  );
}
