import { useEffect } from "react";
import {
  INGREDIENTS,
  MENU,
  MENU_ITEMS,
  Message,
  RECIPES,
  formatMoney,
  type BuyRecipeMessage,
  type MenuItemId,
} from "@cacao/shared";
import type { KitchenRoom } from "../network.ts";
import { useRoomState } from "./useRoomState.ts";

interface Props {
  room: KitchenRoom;
  onClose: () => void;
}

/** Every recipe: the ones on the menu, and the ones the waiter can buy to add to it. */
export function RecipeBookDialog({ room, onClose }: Props) {
  const money = useRoomState(room, (state) => state.money);
  const unlocked = useRoomState(room, (state) => [...state.unlockedRecipes].join(",")).split(",");

  function buy(recipe: MenuItemId) {
    room.send(Message.BuyRecipe, { recipe } satisfies BuyRecipeMessage);
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
      <div className="card dialog phone-dialog" role="dialog" aria-label="Libro delle ricette">
        <h2>📖 Libro delle ricette</h2>
        <small className="hint">
          Una ricetta comprata va nel menù: i clienti la ordinano e il cuoco può ordinarne l'ingrediente al telefono.
          In cassa: {formatMoney(money)}
        </small>
        <ul className="shop-list">
          {MENU_ITEMS.map((id) => {
            const { label, emoji, priceCents } = MENU[id];
            const { ingredients, cookMs, unlockPriceCents } = RECIPES[id];
            const known = unlocked.includes(id);
            return (
              <li key={id}>
                <span className="menu-emoji">{emoji}</span>
                <span className="shop-item">
                  {label}
                  <small className="recipe">
                    {ingredients.map((i) => `${INGREDIENTS[i].emoji} ${INGREDIENTS[i].label}`).join(" + ")}
                    {` · ${cookMs / 1000}s · vendi a ${formatMoney(priceCents)}`}
                  </small>
                </span>
                {known || unlockPriceCents === undefined ? (
                  <span className="badge">Nel menù</span>
                ) : (
                  <button type="button" disabled={money < unlockPriceCents} onClick={() => buy(id)}>
                    {formatMoney(unlockPriceCents)}
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
