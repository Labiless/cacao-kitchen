import { useEffect } from "react";
import { INGREDIENTS, INGREDIENT_IDS, Message, type IngredientId, type TakeIngredientMessage } from "@cacao/shared";
import type { KitchenRoom } from "../network.ts";
import { useRoomState } from "./useRoomState.ts";

interface Props {
  room: KitchenRoom;
  onClose: () => void;
}

/** The open fridge: the cook picks one ingredient to carry. */
export function FridgeDialog({ room, onClose }: Props) {
  const stock = useRoomState(room, (state) => JSON.stringify(state.fridge.toJSON()));
  const fridge = JSON.parse(stock) as Record<string, number>;

  function take(ingredient: IngredientId) {
    room.send(Message.TakeIngredient, { ingredient } satisfies TakeIngredientMessage);
    onClose();
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
      <div className="card dialog fridge-dialog" role="dialog" aria-label="Frigo">
        <h2>Frigo</h2>
        <small className="hint">Cosa prendi? Gli ingredienti si ordinano al telefono, in sala.</small>
        <div className="menu-grid">
          {INGREDIENT_IDS.map((id) => {
            const units = fridge[id] ?? 0;
            return (
              <button key={id} type="button" className="menu-item" disabled={units === 0} onClick={() => take(id)}>
                <span className="menu-emoji">{INGREDIENTS[id].emoji}</span>
                <span>
                  {INGREDIENTS[id].label}
                  <small className="recipe">{units === 0 ? "Finito" : `× ${units}`}</small>
                </span>
              </button>
            );
          })}
        </div>
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onClose}>Chiudi</button>
        </div>
      </div>
    </div>
  );
}
