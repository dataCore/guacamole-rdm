/** Runtime configuration, served as config.json next to index.html. The
 *  container renders it from RDM_* environment variables on start, so one
 *  image serves every installation. */
export interface RdmConfig {
  /** Shown in the header and the browser tab. */
  title: string;
  /** Where Guacamole's web app lives, relative to this origin or absolute on
   *  the same origin. Must end with a slash. */
  guacamoleUrl: string;
  /** Redirect to the identity provider immediately when Guacamole offers SSO,
   *  instead of showing the login screen first. */
  autoSso: boolean;
  /** Directory name under themes/. */
  theme: string;
  /** UI language: "de", "en", or "auto" (browser preference). */
  language: string;
}

export const DEFAULT_CONFIG: RdmConfig = {
  title: 'Remote',
  guacamoleUrl: '/guacamole/',
  autoSso: true,
  theme: 'default',
  language: 'auto',
};

const THEME_NAME = /^[a-z0-9][a-z0-9-]*$/;

export function parseConfig(raw: unknown): RdmConfig {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const str = (key: keyof RdmConfig) => {
    const value = source[key];
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : (DEFAULT_CONFIG[key] as string);
  };
  let guacamoleUrl = str('guacamoleUrl');
  if (!guacamoleUrl.endsWith('/')) guacamoleUrl += '/';
  return {
    title: str('title'),
    guacamoleUrl,
    autoSso: typeof source.autoSso === 'boolean' ? source.autoSso : DEFAULT_CONFIG.autoSso,
    // A path segment, nothing else: it ends up in a stylesheet URL.
    theme: THEME_NAME.test(str('theme')) ? str('theme') : DEFAULT_CONFIG.theme,
    language: ['de', 'en', 'auto'].includes(str('language')) ? str('language') : DEFAULT_CONFIG.language,
  };
}

/** Absolute base URL of Guacamole. Cross-origin is rejected: the API token
 *  is shared with Guacamole's own UI through localStorage, and the CSP only
 *  allows 'self'. */
export function resolveGuacamoleBase(config: RdmConfig, origin: string): URL {
  const base = new URL(config.guacamoleUrl, origin + '/');
  if (base.origin !== origin) {
    throw new Error(`guacamoleUrl must be on this origin (${origin}), got ${base.origin}`);
  }
  return base;
}

export async function loadConfig(): Promise<RdmConfig> {
  try {
    const response = await fetch('config.json', { cache: 'no-store' });
    if (!response.ok) return DEFAULT_CONFIG;
    return parseConfig(await response.json());
  } catch {
    return DEFAULT_CONFIG;
  }
}
