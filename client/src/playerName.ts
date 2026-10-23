const KEY = "cacao-kitchen:name";

// Storage can throw (private mode, blocked site data): the name is just a convenience.
export function loadPlayerName() {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function savePlayerName(name: string) {
  try {
    localStorage.setItem(KEY, name);
  } catch {
    // ignore
  }
}
