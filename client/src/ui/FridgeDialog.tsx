import { useEffect } from "react";
import {
  INGREDIENTS,
  INGREDIENT_IDS,
  MAX_HELD_INGREDIENTS,
  Message,
  heldIngredients,
  unlockedIngredients,
  type IngredientId,
  type TakeIngredientMessage,
} from "@cacao/shared";
import type { KitchenRoom } from "../network.ts";
import { useRoomState } from "./useRoomState.ts";

interface Props {
  room: KitchenRoom;
  onClose: () => void;
}

/** The open fridge: the cook takes ingredients (up to two in hand) or puts back the ones they carry. */
export function FridgeDialog({ room, onClose }: Props) {
  const stock = useRoomState(room, (state) => JSON.stringify(state.fridge.toJSON()));
  const fridge = JSON.parse(stock) as Record<string, number>;
  const unlocked = useRoomState(room, (state) => unlockedIngredients(state).join(","));
  const shelves = INGREDIENT_IDS.filter((id) => unlocked.split(",").includes(id) || (fridge[id] ?? 0) > 0);
  const inHand = useRoomState(room, (state) => {
    const holding = state.players.get(room.sessionId)?.holding ?? [];
    return heldIngredients(holding).join(",");
  }).split(",").filter(Boolean) as IngredientId[];
  const handsFull = inHand.length >= MAX_HELD_INGREDIENTS;

  function take(ingredient: IngredientId) {
    room.send(Message.TakeIngredient, { ingredient } satisfies TakeIngredientMessage);
  }

  function putBack(ingredient: IngredientId) {
    room.send(Message.PutBackIngredient, { ingredient } satisfies TakeIngredientMessage);
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
        <small className="hint">
          Puoi portare fino a {MAX_HELD_INGREDIENTS} ingredienti. Si ordinano al telefono, in sala.
        </small>
        <div className="menu-grid">
          {shelves.map((id) => {
            const units = fridge[id] ?? 0;
            return (
              <button
                key={id}
                type="button"
                className="menu-item"
                disabled={units === 0 || handsFull}
                onClick={() => take(id)}
              >
                <span className="menu-emoji">{INGREDIENTS[id].emoji}</span>
                <span>
                  {INGREDIENTS[id].label}
                  <small className="recipe">{units === 0 ? "Finito" : `× ${units}`}</small>
                </span>
              </button>
            );
          })}
        </div>

        <div>
          <small className="hint">In mano {inHand.length}/{MAX_HELD_INGREDIENTS}</small>
          {inHand.length === 0 ? (
            <p className="hint">Niente.</p>
          ) : (
            <div className="menu-grid">
              {inHand.map((id, i) => (
                <button key={`${id}-${i}`} type="button" className="menu-item" onClick={() => putBack(id)}>
                  <span className="menu-emoji">{INGREDIENTS[id].emoji}</span>
                  <span>
                    {INGREDIENTS[id].label}
                    <small className="recipe">Rimetti in frigo</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onClose}>Chiudi</button>
        </div>
      </div>
    </div>
  );
}
