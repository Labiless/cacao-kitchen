import { useEffect } from "react";
import {
  EQUIPMENT,
  MENU,
  MENU_ITEMS,
  Message,
  RECIPES,
  formatMoney,
  missingEquipment,
  recipeLevel,
  type BuyRecipeMessage,
  type MenuItemId,
} from "@cacao/shared";
import type { KitchenRoom } from "../network.ts";
import { useRoomState } from "./useRoomState.ts";
import { RecipeSteps } from "./RecipeSteps.tsx";

interface Props {
  room: KitchenRoom;
  onClose: () => void;
}

const LEVELS = [...new Set(MENU_ITEMS.map(recipeLevel))].sort((a, b) => a - b);

/**
 * Every recipe by complexity: the ones on the menu, and the ones the waiter can buy to add to it once
 * the kitchen has the appliances they need.
 */
export function RecipeBookDialog({ room, onClose }: Props) {
  const money = useRoomState(room, (state) => state.money);
  const unlocked = useRoomState(room, (state) => [...state.unlockedRecipes].join(",")).split(",");
  /** Missing appliances per recipe, re-read whenever something is bought. */
  const missing = JSON.parse(useRoomState(room, (state) => JSON.stringify(
    Object.fromEntries(MENU_ITEMS.map((id) => [id, missingEquipment(state, id)])),
  ))) as Record<MenuItemId, ReturnType<typeof missingEquipment>>;

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
      <div className="card dialog recipe-book" role="dialog" aria-label="Libro delle ricette">
        <h2>📖 Libro delle ricette</h2>
        <small className="hint">
          Una ricetta comprata va nel menù: i clienti la ordinano e il cuoco può ordinarne gli ingredienti al telefono.
          Prima servono gli elettrodomestici, dal computer. In cassa: {formatMoney(money)}
        </small>
        <div className="recipe-book-pages">
          {LEVELS.map((level) => (
            <section key={level}>
              <h3>Livello {level} · {level === 1 ? "1 passaggio" : `${level} passaggi`}</h3>
              <ul className="shop-list">
                {MENU_ITEMS.filter((id) => recipeLevel(id) === level).map((id) => {
                  const { label, emoji, priceCents } = MENU[id];
                  const { unlockPriceCents } = RECIPES[id];
                  const known = unlocked.includes(id) || unlockPriceCents === undefined;
                  const needs = missing[id];
                  return (
                    <li key={id}>
                      <span className="menu-emoji">{emoji}</span>
                      <span className="shop-item">
                        {label}
                        <small className="recipe">Vendi a {formatMoney(priceCents)}</small>
                        <RecipeSteps dish={id} />
                        {!known && needs.length > 0 && (
                          <small className="recipe missing">
                            Serve: {needs.map((kind) => `${EQUIPMENT[kind].emoji} ${EQUIPMENT[kind].label}`).join(", ")}
                          </small>
                        )}
                      </span>
                      {known ? (
                        <span className="badge">Nel menù</span>
                      ) : (
                        <button
                          type="button"
                          disabled={money < unlockPriceCents! || needs.length > 0}
                          onClick={() => buy(id)}
                        >
                          {formatMoney(unlockPriceCents!)}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onClose}>Chiudi</button>
        </div>
      </div>
    </div>
  );
}
