import { useEffect, useMemo, useState } from "react";
import type { KitchenRoom } from "../network.ts";

type RoomState = KitchenRoom["state"];

/**
 * Reads something from the room state and re-renders when it changes.
 * `select` should return a primitive (or a string key) so unchanged values don't re-render.
 */
export function useRoomState<T>(room: KitchenRoom, select: (state: RoomState) => T): T {
  const [value, setValue] = useState(() => select(room.state));
  useEffect(() => {
    const sync = () => setValue(select(room.state));
    room.onStateChange(sync);
    return () => room.onStateChange.remove(sync);
    // `select` is usually an inline function: re-subscribing on every render isn't needed.
  }, [room]);
  return value;
}

/**
 * Like useRoomState, for a plain object or array: compared by content (its JSON), so it only
 * re-renders, and is only rebuilt, when the content actually changes. Keep `select` small: it runs on
 * every state patch.
 */
export function useRoomValue<T>(room: KitchenRoom, select: (state: RoomState) => T): T {
  const json = useRoomState(room, (state) => JSON.stringify(select(state)));
  return useMemo(() => JSON.parse(json) as T, [json]);
}
