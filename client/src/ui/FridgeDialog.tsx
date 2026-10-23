import { useEffect } from "react";
import { INGREDIENTS, INGREDIENT_IDS, Message, type IngredientId, type TakeIngredientMessage } from "@cacao/shared";
import type { KitchenRoom } from "../network.ts";

interface Props {
  room: KitchenRoom;
  onClose: () => void;
}

/** The open fridge: the cook picks one ingredient to carry. */
export function FridgeDialog({ room, onClose }: Props) {
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
        <small className="hint">Cosa prendi?</small>
        <div className="menu-grid">
          {INGREDIENT_IDS.map((id) => (
            <button key={id} type="button" className="menu-item" onClick={() => take(id)}>
              <span className="menu-emoji">{INGREDIENTS[id].emoji}</span>
              {INGREDIENTS[id].label}
            </button>
          ))}
        </div>
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onClose}>Chiudi</button>
        </div>
      </div>
    </div>
  );
}
