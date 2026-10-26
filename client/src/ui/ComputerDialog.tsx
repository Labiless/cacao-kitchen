import { useEffect } from "react";
import { EQUIPMENT, EQUIPMENT_IDS, canBuyEquipment, formatMoney, type EquipmentId } from "@cacao/shared";
import type { KitchenRoom } from "../network.ts";
import { useRoomState } from "./useRoomState.ts";

interface Props {
  room: KitchenRoom;
  /** Picked an item: it's paid for once it's placed in the kitchen. */
  onBuy: (item: EquipmentId) => void;
  onClose: () => void;
}

/** Catalogue of equipment and supplies the waiter can buy for the kitchen. */
export function ComputerDialog({ room, onBuy, onClose }: Props) {
  const money = useRoomState(room, (state) => state.money);
  /** Unique appliances the kitchen already has, which can't be bought again. */
  const owned = useRoomState(room, (state) => EQUIPMENT_IDS.filter((id) => !canBuyEquipment(state, id)).join(","));

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="backdrop">
      <div className="card dialog phone-dialog" role="dialog" aria-label="Computer">
        <h2>💻 Elettrodomestici</h2>
        <small className="hint">Paghi quando lo posizioni in cucina. In cassa: {formatMoney(money)}</small>
        <ul className="shop-list">
          {EQUIPMENT_IDS.map((id) => {
            const { label, emoji, description, priceCents } = EQUIPMENT[id];
            return (
              <li key={id}>
                <span className="menu-emoji">{emoji}</span>
                <span className="shop-item">
                  {label}
                  <small className="recipe">{description}</small>
                </span>
                {owned.split(",").includes(id) ? (
                  <span className="badge">In cucina</span>
                ) : (
                  <button type="button" disabled={money < priceCents} onClick={() => onBuy(id)}>
                    {formatMoney(priceCents)}
                  </button>
                )}
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
