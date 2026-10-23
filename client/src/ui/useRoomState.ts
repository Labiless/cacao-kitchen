import { useEffect, useState } from "react";
import type { KitchenRoom } from "../network.ts";

/**
 * Reads something from the room state and re-renders when it changes.
 * `select` should return a primitive (or a string key) so unchanged values don't re-render.
 */
export function useRoomState<T>(room: KitchenRoom, select: (state: KitchenRoom["state"]) => T): T {
  const [value, setValue] = useState(() => select(room.state));
  useEffect(() => {
    const sync = () => setValue(select(room.state));
    room.onStateChange(sync);
    return () => room.onStateChange.remove(sync);
    // `select` is usually an inline function: re-subscribing on every render isn't needed.
  }, [room]);
  return value;
}
