/** localStorage (or sessionStorage), or an in-memory stand-in where the
 *  browser blocks it (private mode, disabled site data). */
export function safeStorage(kind: 'localStorage' | 'sessionStorage' = 'localStorage'): Storage {
  try {
    const storage = window[kind];
    const probe = '__rdm_probe__';
    storage.setItem(probe, probe);
    storage.removeItem(probe);
    return storage;
  } catch {
    const data = new Map<string, string>();
    return {
      get length() {
        return data.size;
      },
      clear: () => data.clear(),
      getItem: (key) => data.get(key) ?? null,
      key: (index) => [...data.keys()][index] ?? null,
      removeItem: (key) => void data.delete(key),
      setItem: (key, value) => void data.set(key, String(value)),
    };
  }
}
