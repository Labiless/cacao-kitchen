import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from "react";
import {
  MAX_LEVEL,
  Message,
  attendedCustomer,
  formatClock,
  formatMoney,
  formatStars,
  type MenuItemId,
} from "@cacao/shared";
import type { KitchenRoom } from "../network.ts";
import { copyToClipboard, inviteLink } from "../invite.ts";
import {
  MODAL_OPEN_KEY,
  OPEN_POPUP_EVENT,
  START_PLACEMENT_EVENT,
  createGame,
  type PlacementItem,
  type ScenePopup,
} from "../game/createGame.ts";
import { StorageDialog } from "./StorageDialog.tsx";
import { ApplianceDialog } from "./ApplianceDialog.tsx";
import { PhoneDialog } from "./PhoneDialog.tsx";
import { ComputerDialog } from "./ComputerDialog.tsx";
import { RecipeBookDialog } from "./RecipeBookDialog.tsx";
import { useRoomState } from "./useRoomState.ts";
import { NameDialog } from "./NameDialog.tsx";
import { OrderDialog } from "./OrderDialog.tsx";
import { TicketDialog } from "./TicketDialog.tsx";
import { sounds } from "../game/Sounds.ts";
import { ShiftDialog } from "./ShiftDialog.tsx";
import { useDialogKeyboard } from "./useDialogKeyboard.ts";

interface Props {
  room: KitchenRoom;
  askName: boolean;
  onNameChosen: () => void;
  onLeave: () => void;
}

export function GameView({ room, askName, onNameChosen, onLeave }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<ReturnType<typeof createGame> | null>(null);
  const [copied, setCopied] = useState<"ok" | "error" | null>(null);
  useDialogKeyboard();
  const money = useRoomState(room, (state) => state.money);
  const day = useRoomState(room, (state) => state.shift.day);
  const phase = useRoomState(room, (state) => state.shift.phase);
  const secondsLeft = useRoomState(room, (state) => state.shift.secondsLeft);
  const stars = useRoomState(room, (state) => state.stars);
  const ratedShifts = useRoomState(room, (state) => state.ratedShifts);
  const level = useRoomState(room, (state) => state.level);
  /** Between shifts, or the game is over: the report is up and nothing else can be done. */
  const reportUp = phase === "break" || phase === "gameOver";
  const muted = useSyncExternalStore(subscribeMuted, getMuted);
  const [ordering, setOrdering] = useState<{ customerId: string; wants: MenuItemId } | null>(null);
  /** Popup opened from the scene (a ticket, the fridge or freezer, an appliance, the phone, the computer, the recipe book), if any. */
  const [popup, setPopup] = useState<ScenePopup | null>(null);

  // Audio can only start after a gesture, and clicks on React buttons count too.
  useEffect(() => {
    const unlock = () => sounds.unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // Phaser owns the canvas; React only mounts/unmounts it.
  useEffect(() => {
    const game = createGame(containerRef.current!, room);
    gameRef.current = game;
    game.events.on(OPEN_POPUP_EVENT, (opened: ScenePopup) => setPopup(opened));
    return () => {
      gameRef.current = null;
      game.destroy(true);
    };
  }, [room]);

  // The shift is over: whatever was open is closed, the report takes over.
  useEffect(() => {
    if (reportUp) setPopup(null);
  }, [reportUp]);

  // Tell the scene when a React-only popup is open (or the shift report is up), so the player stands still.
  useEffect(() => {
    gameRef.current?.registry.set(MODAL_OPEN_KEY, popup !== null || reportUp);
  }, [popup, reportUp]);

  function restart(event: MouseEvent<HTMLButtonElement>) {
    // Drop focus, or the space bar (used to interact) would click it again.
    event.currentTarget.blur();
    if (confirm("Ricominciare da capo? Si perdono soldi, livello, stelle, elettrodomestici e decorazioni.")) {
      room.send(Message.Restart);
    }
  }

  const closePopup = useCallback(() => setPopup(null), []);

  // Buying on the computer hands over to the scene, where the item is placed in the kitchen or the hall.
  const startPlacement = useCallback((item: PlacementItem) => {
    setPopup(null);
    gameRef.current?.events.emit(START_PLACEMENT_EVENT, item);
  }, []);

  useEffect(() => {
    room.onLeave(onLeave);
    return () => room.onLeave.remove(onLeave);
  }, [room, onLeave]);

  // Open the order dialog while this player is taking someone's order.
  useEffect(() => {
    const sync = () => {
      const customer = attendedCustomer(room.state, room.sessionId, "ordering");
      setOrdering((current) => {
        if (current?.customerId === customer?.id) return current;
        return customer ? { customerId: customer.id, wants: customer.wants } : null;
      });
    };
    room.onStateChange(sync);
    return () => room.onStateChange.remove(sync);
  }, [room]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copyInvite() {
    try {
      await copyToClipboard(inviteLink(room.roomId));
      setCopied("ok");
    } catch {
      setCopied("error");
    }
  }

  return (
    <div className="game-layout">
      <div className="game-container" ref={containerRef} />

      <div className="hud">
        <div className="money" title="Cassa del ristorante">💰 {formatMoney(money)}</div>
        <div className="money" title={level === MAX_LEVEL ? "Livello massimo" : "Ogni turno superato è un livello in più"}>
          🏅 Livello {level}
        </div>
        {ratedShifts > 0 && (
          <div className="money" title={`Media dei voti di ${ratedShifts} ${ratedShifts === 1 ? "turno" : "turni"}`}>
            ⭐ {formatStars(stars)}
          </div>
        )}
        {phase === "open" && (
          <div className={secondsLeft <= 30 ? "shift-clock ending" : "shift-clock"} title="Tempo alla chiusura">
            Turno {day} · ⏱ {formatClock(secondsLeft)}
          </div>
        )}
        {phase === "closing" && (
          <div className="shift-clock ending">Turno {day} · 🚪 Chiuso: servi gli ultimi clienti e pulisci i tavoli</div>
        )}
      </div>

      <div className="top-right">
        <button
          type="button"
          className="hud-button"
          title={muted ? "Attiva l'audio" : "Disattiva l'audio"}
          aria-pressed={!muted}
          onClick={(event) => {
            event.currentTarget.blur();
            sounds.setMuted(!muted);
          }}
        >
          {muted ? "🔇" : "🔊"}
        </button>
        <button type="button" className="hud-button" title="Ricomincia la partita da capo" onClick={restart}>
          ↺ Ricomincia
        </button>
        <button
          className="room-code"
          title="Copia il link d'invito"
          onClick={(event) => {
            // Drop focus, or the space bar (used to interact) would click it again.
            event.currentTarget.blur();
            copyInvite();
          }}
        >
          {copied === "ok" ? "Link copiato!" : copied === "error" ? "Copia non riuscita" : room.roomId}
        </button>
      </div>

      {popup?.kind === "ticket" && <TicketDialog room={room} ticketId={popup.ticketId} onClose={closePopup} />}
      {popup?.kind === "storage" && <StorageDialog room={room} storage={popup.storage} onClose={closePopup} />}
      {popup?.kind === "appliance" && <ApplianceDialog room={room} applianceId={popup.applianceId} onClose={closePopup} />}
      {popup?.kind === "phone" && <PhoneDialog room={room} onClose={closePopup} />}
      {popup?.kind === "computer" && <ComputerDialog room={room} onBuy={startPlacement} onClose={closePopup} />}
      {popup?.kind === "recipeBook" && <RecipeBookDialog room={room} onClose={closePopup} />}
      {ordering && <OrderDialog key={ordering.customerId} room={room} {...ordering} />}
      {reportUp && !askName && <ShiftDialog room={room} />}
      {askName && <NameDialog room={room} onDone={onNameChosen} />}
    </div>
  );
}

const subscribeMuted = (listener: () => void) => sounds.subscribe(listener);
const getMuted = () => sounds.muted;
