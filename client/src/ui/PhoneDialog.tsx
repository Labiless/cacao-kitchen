import { useEffect, useState } from "react";
import {
  DELIVERY,
  INGREDIENTS,
  Message,
  STORAGE_INFO,
  formatMoney,
  unlockedIngredients,
  type IngredientId,
  type OrderSuppliesMessage,
} from "@cacao/shared";
import type { KitchenRoom } from "../network.ts";
import { useRoomState } from "./useRoomState.ts";

interface Props {
  room: KitchenRoom;
  onClose: () => void;
}

const DELIVERY_STATUS_TEXT = {
  onTheWay: "🚚 Consegna in arrivo… Non puoi ordinare altro finché non la ritiri.",
  arrived: "🚚 Il fornitore è arrivato: ritira la consegna nella zona consegne.",
} as const;

/** The cook puts together one order of ingredient packs; it's paid now and delivered by truck. */
export function PhoneDialog({ room, onClose }: Props) {
  const money = useRoomState(room, (state) => state.money);
  const delivery = useRoomState(room, (state) => state.delivery.status);
  const stockKey = useRoomState(room, (state) => JSON.stringify(state.stock.toJSON()));
  const stock = JSON.parse(stockKey) as Record<string, number>;
  // Only what the menu needs: new ingredients show up once their recipe is bought.
  const ingredients = useRoomState(room, (state) => unlockedIngredients(state).join(","))
    .split(",")
    .filter(Boolean) as IngredientId[];

  const [packs, setPacks] = useState<Partial<Record<IngredientId, number>>>({});
  const total = ingredients.reduce((sum, id) => sum + (packs[id] ?? 0) * INGREDIENTS[id].pack.priceCents, 0);
  const anything = ingredients.some((id) => (packs[id] ?? 0) > 0);
  const canOrder = delivery === "none" && anything && total <= money;

  function change(id: IngredientId, by: number) {
    setPacks((current) => ({
      ...current,
      [id]: Math.min(DELIVERY.maxPacks, Math.max(0, (current[id] ?? 0) + by)),
    }));
  }

  function order() {
    if (!canOrder) return;
    room.send(Message.OrderSupplies, { packs } satisfies OrderSuppliesMessage);
    setPacks({});
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
        {delivery === "none" ? (
          <small className="hint">
            Si paga subito, il fornitore arriva in {DELIVERY.arrivalS.min}–{DELIVERY.arrivalS.max} secondi.
            In cassa: {formatMoney(money)}
          </small>
        ) : (
          <p className="delivery-status">{DELIVERY_STATUS_TEXT[delivery]}</p>
        )}

        <ul className="shop-list">
          {ingredients.map((id) => {
            const { label, emoji, pack } = INGREDIENTS[id];
            const count = packs[id] ?? 0;
            return (
              <li key={id}>
                <span className="menu-emoji">{emoji}</span>
                <span className="shop-item">
                  {pack.units} × {label} · {formatMoney(pack.priceCents)}
                  <small className="recipe">
                    In {STORAGE_INFO[INGREDIENTS[id].storage].label.toLowerCase()}: {stock[id] ?? 0}
                  </small>
                </span>
                <span className="stepper">
                  <button type="button" className="secondary" disabled={count === 0} onClick={() => change(id, -1)}>−</button>
                  <span>{count}</span>
                  <button
                    type="button"
                    className="secondary"
                    disabled={delivery !== "none" || count >= DELIVERY.maxPacks}
                    onClick={() => change(id, +1)}
                  >
                    +
                  </button>
                </span>
              </li>
            );
          })}
        </ul>

        <div className="dialog-actions">
          <span className={total > money ? "order-total error" : "order-total"}>Totale {formatMoney(total)}</span>
          <button type="button" className="secondary" onClick={onClose}>Chiudi</button>
          <button type="button" disabled={!canOrder} onClick={order}>Ordina</button>
        </div>
      </div>
    </div>
  );
}
