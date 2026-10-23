import { useEffect, useState } from "react";
import {
  INGREDIENTS,
  MENU,
  Message,
  RECIPES,
  type CookMessage,
  unlockedMenu,
  type MenuItemId,
} from "@cacao/shared";
import type { KitchenRoom } from "../network.ts";

interface Props {
  room: KitchenRoom;
  stoveId: string;
  onClose: () => void;
}

/** The cook picks what to make with the ingredient in their hands. */
export function StoveDialog({ room, stoveId, onClose }: Props) {
  const holding = room.state.players.get(room.sessionId)?.holding;
  const [selected, setSelected] = useState<MenuItemId | null>(null);
  const canCook = (dish: MenuItemId) => RECIPES[dish].ingredient === holding;

  function cook() {
    if (!selected || !canCook(selected)) return;
    room.send(Message.Cook, { stoveId, dish: selected } satisfies CookMessage);
    onClose();
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "Enter") cook();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="backdrop">
      <div className="card dialog stove-dialog" role="dialog" aria-label="Fornello">
        <h2>Fornello</h2>
        <small className="hint">Cosa vuoi cucinare?</small>
        <div className="menu-grid">
          {unlockedMenu(room.state).map((id) => {
            const recipe = RECIPES[id];
            return (
              <button
                key={id}
                type="button"
                className={id === selected ? "menu-item selected" : "menu-item"}
                aria-pressed={id === selected}
                disabled={!canCook(id)}
                onClick={() => setSelected(id)}
              >
                <span className="menu-emoji">{MENU[id].emoji}</span>
                <span>
                  {MENU[id].label}
                  <small className="recipe">
                    {INGREDIENTS[recipe.ingredient].emoji} {INGREDIENTS[recipe.ingredient].label} · {recipe.cookMs / 1000}s
                  </small>
                </span>
              </button>
            );
          })}
        </div>
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onClose}>Chiudi</button>
          <button type="button" disabled={!selected} onClick={cook}>Cucina</button>
        </div>
      </div>
    </div>
  );
}
