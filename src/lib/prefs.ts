/** Per-browser UI preferences. Conveniences only: every read tolerates a
 *  missing or blocked localStorage. */
const PREFIX = 'rdm.';

export function loadPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function savePref(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Not remembered; harmless.
  }
}
