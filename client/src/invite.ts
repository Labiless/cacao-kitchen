const ROOM_PARAM = "room";

export function inviteLink(roomId: string) {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set(ROOM_PARAM, roomId);
  return url.toString();
}

export function getRoomIdFromUrl() {
  return new URLSearchParams(location.search).get(ROOM_PARAM)?.trim() || null;
}

/** Keeps the address bar in sync, so the current URL is always a valid invite. */
export function setRoomIdInUrl(roomId: string | null) {
  const url = roomId ? inviteLink(roomId) : location.pathname;
  history.replaceState(null, "", url);
}

export async function copyToClipboard(text: string) {
  // navigator.clipboard only exists in secure contexts (https or localhost), not on LAN IPs.
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand("copy");
  textarea.remove();
  if (!ok) throw new Error("Copia non riuscita");
}
