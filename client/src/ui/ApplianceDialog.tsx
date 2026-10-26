import { useEffect, useState } from "react";
import {
  EQUIPMENT,
  MENU,
  Message,
  ingredientsAfterCooking,
  recipesStartingAt,
  type MenuItemId,
  type StartRecipeMessage,
} from "@cacao/shared";
import type { KitchenRoom } from "../network.ts";
import { RecipeSteps } from "./RecipeSteps.tsx";

interface Props {
  room: KitchenRoom;
  applianceId: string;
  onClose: () => void;
}

/** The cook picks which recipe to start here with the ingredients in their hands. */
export function ApplianceDialog({ room, applianceId, onClose }: Props) {
  const appliance = room.state.appliances.get(applianceId);
  const holding = [...(room.state.players.get(room.sessionId)?.holding ?? [])];
  const [selected, setSelected] = useState<MenuItemId | null>(null);
  /** Possible when everything the recipe needs is in hand. */
  const canStart = (dish: MenuItemId) => ingredientsAfterCooking(dish, holding) !== null;

  function start() {
    if (!selected || !canStart(selected)) return;
    room.send(Message.StartRecipe, { applianceId, dish: selected } satisfies StartRecipeMessage);
    onClose();
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "Enter") start();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!appliance) return null;
  const { label, emoji } = EQUIPMENT[appliance.kind];

  return (
    <div className="backdrop">
      <div className="card dialog appliance-dialog" role="dialog" aria-label={label}>
        <h2>{emoji} {label}</h2>
        <small className="hint">Cosa vuoi iniziare?</small>
        <div className="recipe-choices">
          {recipesStartingAt(room.state, appliance.kind).map((id) => (
            <button
              key={id}
              type="button"
              className={id === selected ? "menu-item selected" : "menu-item"}
              aria-pressed={id === selected}
              disabled={!canStart(id)}
              onClick={() => setSelected(id)}
            >
              <span className="menu-emoji">{MENU[id].emoji}</span>
              <span>
                {MENU[id].label}
                <RecipeSteps dish={id} />
              </span>
            </button>
          ))}
        </div>
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onClose}>Chiudi</button>
          <button type="button" disabled={!selected} onClick={start}>Inizia</button>
        </div>
      </div>
    </div>
  );
}
