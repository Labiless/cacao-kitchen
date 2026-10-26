import { useEffect } from "react";

/** Arrow keys and the direction each one moves the focus in. */
const DIRECTIONS: Record<string, { x: number; y: number }> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

/**
 * Keyboard control for popups, so the game can be played without the mouse: the arrows move the focus
 * between the enabled buttons of the popup on top, E presses the focused one. Nothing is focused when
 * a popup opens, so a stray E can't press anything; the first arrow picks the first button.
 * Text fields keep their arrows and E.
 *
 * Keys handled here never reach the game: Phaser handles keys on its next frame, by which time the
 * popup may be closed, and the same E would act in the game too (reopening the fridge just closed).
 * Listening in the capture phase on window runs before Phaser's own window listener.
 */
export function useDialogKeyboard() {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;

      const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
      const dialog = dialogs[dialogs.length - 1];
      if (!dialog) return;
      const buttons = [...dialog.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
      const focused = buttons.find((button) => button === active) ?? null;

      if (event.key === "e" || event.key === "E") {
        if (!focused) return;
        event.preventDefault();
        event.stopPropagation();
        // Holding E down doesn't press the button again and again.
        if (!event.repeat) focused.click();
        return;
      }

      const direction = DIRECTIONS[event.key];
      if (!direction || !buttons.length) return;
      event.preventDefault();
      event.stopPropagation();
      const next = focused ? nextButton(focused, buttons, direction) : buttons[0];
      next.focus();
      next.scrollIntoView({ block: "nearest" });
    }
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, []);
}

/**
 * The button the focus moves to from `from`: the nearest one in that direction on screen, favouring
 * buttons in line with it, so arrows work in grids as well as lists. With none that way, it goes to
 * the next (or previous) button in the popup, wrapping around.
 */
function nextButton(from: HTMLButtonElement, buttons: HTMLButtonElement[], direction: { x: number; y: number }) {
  const origin = center(from);
  let best: HTMLButtonElement | null = null;
  let bestScore = Infinity;
  for (const button of buttons) {
    if (button === from) continue;
    const { x, y } = center(button);
    const along = (x - origin.x) * direction.x + (y - origin.y) * direction.y;
    if (along <= 1) continue;
    const across = Math.abs((x - origin.x) * direction.y) + Math.abs((y - origin.y) * direction.x);
    const score = along + across * 2;
    if (score < bestScore) {
      best = button;
      bestScore = score;
    }
  }
  if (best) return best;

  const forward = direction.x + direction.y > 0;
  const index = buttons.indexOf(from);
  return buttons[(index + (forward ? 1 : -1) + buttons.length) % buttons.length];
}

function center(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}
