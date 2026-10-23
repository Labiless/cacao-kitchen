import { useEffect } from "react";
import {
  INGREDIENTS,
  INGREDIENT_IDS,
  Message,
  formatMoney,
  type BuyIngredientMessage,
  type IngredientId,
} from "@cacao/shared";
import type { KitchenRoom } from "../network.ts";
import { useRoomState } from "./useRoomState.ts";

interface Props {
  room: KitchenRoom;
  onClose: () => void;
}

/** The waiter orders ingredients by the pack; they go straight into the fridge. */
export function PhoneDialog({ room, onClose }: Props) {
  const money = useRoomState(room, (state) => state.money);
  const stock = useRoomState(room, (state) => JSON.stringify(state.fridge.toJSON()));
  const fridge = JSON.parse(stock) as Record<string, number>;

  function buy(ingredient: IngredientId) {
    room.send(Message.BuyIngredient, { ingredient } satisfies BuyIngredientMessage);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="backdrop">
      <div className="card dialog phone-dialog" role="dialog" aria-label="Telefono">
        <h2>📞 Ordina ingredienti</h2>
        <small className="hint">Arrivano subito nel frigo. In cassa: {formatMoney(money)}</small>
        <ul className="shop-list">
          {INGREDIENT_IDS.map((id) => {
            const { label, emoji, pack } = INGREDIENTS[id];
            return (
              <li key={id}>
                <span className="menu-emoji">{emoji}</span>
                <span className="shop-item">
                  {pack.units} × {label}
                  <small className="recipe">In frigo: {fridge[id] ?? 0}</small>
                </span>
                <button type="button" disabled={money < pack.priceCents} onClick={() => buy(id)}>
                  {formatMoney(pack.priceCents)}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onClose}>Chiudi</button>
        </div>
      </div>
    </div>
  );
}
