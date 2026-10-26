import { useEffect, useState } from "react";
import {
  APPLIANCE_TIERS,
  EQUIPMENT,
  MAX_APPLIANCE_TIER,
  MENU,
  Message,
  formatMoney,
  ingredientsAfterCooking,
  recipesStartingAt,
  upgradePrice,
  type MenuItemId,
  type StartRecipeMessage,
  type UpgradeApplianceMessage,
} from "@cacao/shared";
import type { KitchenRoom } from "../network.ts";
import { useRoomState } from "./useRoomState.ts";
import { RecipeSteps } from "./RecipeSteps.tsx";

interface Props {
  room: KitchenRoom;
  applianceId: string;
  onClose: () => void;
}

/**
 * At an appliance: the cook picks which recipe to start here with the ingredients in their hands, or
 * takes the appliance up a level so it works faster.
 */
export function ApplianceDialog({ room, applianceId, onClose }: Props) {
  const appliance = room.state.appliances.get(applianceId);
  const holding = [...(room.state.players.get(room.sessionId)?.holding ?? [])];
  const money = useRoomState(room, (state) => state.money);
  const tier = useRoomState(room, (state) => state.appliances.get(applianceId)?.tier ?? 1);
  const [selected, setSelected] = useState<MenuItemId | null>(null);
  /** Possible when everything the recipe needs is in hand. */
  const canStart = (dish: MenuItemId) => ingredientsAfterCooking(dish, holding) !== null;

  function start() {
    if (!selected || !canStart(selected)) return;
    room.send(Message.StartRecipe, { applianceId, dish: selected } satisfies StartRecipeMessage);
    onClose();
  }

  function upgrade() {
    room.send(Message.UpgradeAppliance, { applianceId } satisfies UpgradeApplianceMessage);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      // Enter on a focused button already presses that button.
      if (event.key === "Enter" && !(document.activeElement instanceof HTMLButtonElement)) start();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!appliance) return null;
  const { label, emoji } = EQUIPMENT[appliance.kind];
  const recipes = recipesStartingAt(room.state, appliance.kind);
  const price = upgradePrice(appliance.kind, tier);
  /** How much faster than as bought, e.g. "25%". */
  const faster = (level: number) => `${Math.round((1 - APPLIANCE_TIERS[level - 1].speed) * 100)}%`;

  return (
    <div className="backdrop">
      <div className="card dialog appliance-dialog" role="dialog" aria-label={label}>
        <h2>{emoji} {label} · livello {tier}</h2>

        <small className="hint">
          {holding.length ? "Cosa vuoi iniziare?" : "Prendi gli ingredienti dal frigo per iniziare una ricetta qui."}
        </small>
        {recipes.length === 0 && <p className="hint">Nessuna ricetta del menù inizia qui.</p>}
        <div className="recipe-choices">
          {recipes.map((id) => (
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

        <div className="upgrade">
          {price === null ? (
            <span>⭐ Livello massimo: lavora il {faster(MAX_APPLIANCE_TIER)} più veloce.</span>
          ) : (
            <>
              <span>
                <strong>Migliora al livello {tier + 1}</strong>
                <small className="recipe">
                  Ogni passaggio qui dura il {faster(tier + 1)} in meno{tier > 1 ? ` (ora ${faster(tier)})` : ""}.
                </small>
              </span>
              <button type="button" disabled={money < price} onClick={upgrade}>{formatMoney(price)}</button>
            </>
          )}
        </div>

        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onClose}>Chiudi</button>
          {recipes.length > 0 && <button type="button" disabled={!selected} onClick={start}>Inizia</button>}
        </div>
      </div>
    </div>
  );
}
