import { useEffect } from "react";
import {
  INGREDIENTS,
  INGREDIENT_IDS,
  MAX_HELD_INGREDIENTS,
  Message,
  STORAGE_INFO,
  heldIngredients,
  readyMadeDish,
  unlockedIngredients,
  type IngredientId,
  type Storage,
  type TakeIngredientMessage,
} from "@cacao/shared";
import type { KitchenRoom } from "../network.ts";
import { useRoomState } from "./useRoomState.ts";

interface Props {
  room: KitchenRoom;
  storage: Storage;
  onClose: () => void;
}

/**
 * The open fridge or freezer: the cook takes ingredients (up to two in hand) or puts back the ones
 * they carry that belong here. Something served as it is (a can of cola) comes out as the dish.
 */
export function StorageDialog({ room, storage, onClose }: Props) {
  const stockKey = useRoomState(room, (state) => JSON.stringify(state.stock.toJSON()));
  const stock = JSON.parse(stockKey) as Record<string, number>;
  const unlocked = useRoomState(room, (state) => unlockedIngredients(state).join(",")).split(",");
  const kept = (id: IngredientId) => INGREDIENTS[id].storage === storage;
  const shelves = INGREDIENT_IDS.filter((id) => kept(id) && (unlocked.includes(id) || (stock[id] ?? 0) > 0));
  const inHand = useRoomState(room, (state) => {
    const holding = state.players.get(room.sessionId)?.holding ?? [];
    return heldIngredients(holding).join(",");
  }).split(",").filter(Boolean) as IngredientId[];
  const handsFull = inHand.length >= MAX_HELD_INGREDIENTS;
  const { label, emoji } = STORAGE_INFO[storage];

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
      <div className="card dialog storage-dialog" role="dialog" aria-label={label}>
        <h2>{emoji} {label}</h2>
        <small className="hint">
          Puoi portare fino a {MAX_HELD_INGREDIENTS} ingredienti. Si ordinano al telefono, sopra il frigo.
        </small>
        {shelves.length === 0 && <p className="hint">Vuoto.</p>}
        <div className="menu-grid">
          {shelves.map((id) => {
            const units = stock[id] ?? 0;
            // Ready-made dishes need empty hands.
            const blocked = readyMadeDish(id) ? inHand.length > 0 : handsFull;
            return (
              <button
                key={id}
                type="button"
                className="menu-item"
                disabled={units === 0 || blocked}
                onClick={() => take(id)}
              >
                <span className="menu-emoji">{INGREDIENTS[id].emoji}</span>
                <span>
                  {INGREDIENTS[id].label}
                  <small className="recipe">
                    {units === 0 ? "Finito" : `× ${units}`}
                    {readyMadeDish(id) && " · pronto da servire"}
                  </small>
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
                <button
                  key={`${id}-${i}`}
                  type="button"
                  className="menu-item"
                  disabled={!kept(id)}
                  onClick={() => putBack(id)}
                >
                  <span className="menu-emoji">{INGREDIENTS[id].emoji}</span>
                  <span>
                    {INGREDIENTS[id].label}
                    <small className="recipe">
                      {kept(id) ? `Rimetti nel ${label.toLowerCase()}` : `Va nel ${STORAGE_INFO[INGREDIENTS[id].storage].label.toLowerCase()}`}
                    </small>
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
