/** Loads guacamole-common-js from the Guacamole server itself instead of
 *  bundling it: the client library then always matches the server version,
 *  and an upgrade of Guacamole needs no rebuild of this app. */
export function loadGuacamoleLibrary(base: URL): Promise<void> {
  if (typeof window !== 'undefined' && 'Guacamole' in window) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('guacamole-common-js/all.min.js', base).toString();
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${script.src}`));
    document.head.append(script);
  });
}
