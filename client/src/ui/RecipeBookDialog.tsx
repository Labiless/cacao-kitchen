import { useEffect } from "react";
import {
  EQUIPMENT,
  MAX_LEVEL,
  MENU,
  formatMoney,
  missingEquipment,
  recipeComplexity,
  recipesAtLevel,
  type MenuItemId,
} from "@cacao/shared";
import type { KitchenRoom } from "../network.ts";
import { useRoomState } from "./useRoomState.ts";
import { RecipeSteps } from "./RecipeSteps.tsx";

interface Props {
  room: KitchenRoom;
  onClose: () => void;
}

const LEVELS = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).filter((level) => recipesAtLevel(level).length);

/**
 * Every recipe, by the restaurant level that puts it on the menu, and what the kitchen still needs
 * to make the ones already on it.
 */
export function RecipeBookDialog({ room, onClose }: Props) {
  const level = useRoomState(room, (state) => state.level);
  /** Missing appliances per recipe, re-read whenever something is bought. */
  const missing = JSON.parse(useRoomState(room, (state) => JSON.stringify(
    Object.fromEntries(Object.keys(MENU).map((id) => [id, missingEquipment(state, id as MenuItemId)])),
  ))) as Record<MenuItemId, ReturnType<typeof missingEquipment>>;

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
          Ogni turno superato è un livello in più, e ogni livello mette nel menù nuove ricette: i clienti le ordinano
          subito, anche se in cucina manca un elettrodomestico (si compra dal computer). Il ristorante è al livello {level}.
        </small>
        <div className="recipe-book-pages">
          {LEVELS.map((unlockLevel) => (
            <section key={unlockLevel} className={unlockLevel > level ? "locked" : undefined}>
              <h3>{unlockLevel > level ? "🔒 " : ""}Livello {unlockLevel}</h3>
              <ul className="shop-list">
                {recipesAtLevel(unlockLevel).map((id) => {
                  const { label, emoji, priceCents } = MENU[id];
                  const steps = recipeComplexity(id);
                  const needs = missing[id];
                  return (
                    <li key={id}>
                      <span className="menu-emoji">{emoji}</span>
                      <span className="shop-item">
                        {label}
                        <small className="recipe">
                          {steps === 1 ? "1 passaggio" : `${steps} passaggi`} · vendi a {formatMoney(priceCents)}
                        </small>
                        <RecipeSteps dish={id} />
                        {unlockLevel <= level && needs.length > 0 && (
                          <small className="recipe missing">
                            Serve: {needs.map((kind) => `${EQUIPMENT[kind].emoji} ${EQUIPMENT[kind].label}`).join(", ")}
                          </small>
                        )}
                      </span>
                      {unlockLevel > level ? (
                        <span className="badge waiting">Livello {unlockLevel}</span>
                      ) : needs.length ? (
                        <span className="badge missing-badge">Manca attrezzatura</span>
                      ) : (
                        <span className="badge">Nel menù</span>
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
