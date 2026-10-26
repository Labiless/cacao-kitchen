import { useEffect } from "react";
import {
  DECORATIONS,
  DECORATION_IDS,
  DECORATION_SLOTS,
  EQUIPMENT,
  EQUIPMENT_IDS,
  FULL_DECOR_BEAUTY,
  canBuyEquipment,
  decorPoints,
  MENU,
  RECIPES,
  formatMoney,
  recipesNeeding,
} from "@cacao/shared";
import type { KitchenRoom } from "../network.ts";
import type { PlacementItem } from "../game/createGame.ts";
import { useRoomState } from "./useRoomState.ts";

interface Props {
  room: KitchenRoom;
  /** Picked an item: it's paid for once it's placed in the kitchen or the hall. */
  onBuy: (item: PlacementItem) => void;
  onClose: () => void;
}

/** Catalogue of what the waiter can buy: appliances for the kitchen, decorations for the hall. */
export function ComputerDialog({ room, onBuy, onClose }: Props) {
  const money = useRoomState(room, (state) => state.money);
  /** Unique appliances the kitchen already has, which can't be bought again. */
  const owned = useRoomState(room, (state) => EQUIPMENT_IDS.filter((id) => !canBuyEquipment(state, id)).join(","));
  const points = useRoomState(room, decorPoints);
  const usedSlots = useRoomState(room, (state) => state.decorations.size);
  const level = useRoomState(room, (state) => state.level);
  const hallFull = usedSlots >= DECORATION_SLOTS.length;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="backdrop">
      <div className="card dialog computer-dialog" role="dialog" aria-label="Computer">
        <h2>💻 Acquisti</h2>
        <small className="hint">Paghi quando lo posizioni. In cassa: {formatMoney(money)}</small>
        <div className="recipe-book-pages">
          <section>
            <h3>Elettrodomestici · in cucina</h3>
            <ul className="shop-list">
              {EQUIPMENT_IDS.map((id) => {
                const { label, emoji, description, priceCents } = EQUIPMENT[id];
                return (
                  <li key={id}>
                    <span className="menu-emoji">{emoji}</span>
                    <span className="shop-item">
                      {label}
                      <small className="recipe">{description}</small>
                      <small className="recipe">
                        Serve per:{" "}
                        {recipesNeeding(id)
                          .map((dish) => {
                            const { unlockLevel } = RECIPES[dish];
                            return `${MENU[dish].emoji} ${MENU[dish].label}${unlockLevel > level ? ` (🔒 liv. ${unlockLevel})` : ""}`;
                          })
                          .join(", ")}
                      </small>
                    </span>
                    {owned.split(",").includes(id) ? (
                      <span className="badge">In cucina</span>
                    ) : (
                      <button type="button" disabled={money < priceCents} onClick={() => onBuy({ type: "equipment", id })}>
                        {formatMoney(priceCents)}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section>
            <h3>Decorazioni · in sala</h3>
            <small className="hint">
              Rendono la sala più bella e migliorano le recensioni. Bellezza: {Math.min(points, FULL_DECOR_BEAUTY)}/
              {FULL_DECOR_BEAUTY} · posti liberi: {DECORATION_SLOTS.length - usedSlots}/{DECORATION_SLOTS.length}
            </small>
            <ul className="shop-list">
              {DECORATION_IDS.map((id) => {
                const { label, emoji, description, priceCents, beauty } = DECORATIONS[id];
                return (
                  <li key={id}>
                    <span className="menu-emoji">{emoji}</span>
                    <span className="shop-item">
                      {label}
                      <small className="recipe">{description} · +{beauty} bellezza</small>
                    </span>
                    <button
                      type="button"
                      disabled={money < priceCents || hallFull}
                      onClick={() => onBuy({ type: "decoration", id })}
                    >
                      {formatMoney(priceCents)}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onClose}>Chiudi</button>
        </div>
      </div>
    </div>
  );
}
