import { loadPref, savePref } from './prefs';

type Mode = 'light' | 'dark';

/** Theme = a directory public/themes/<name>/ with theme.css, logo.svg and
 *  logo-dark.svg. Light/dark follows the OS until the user picks one. */
class ThemeState {
  mode = $state<Mode>('light');
  name = $state('default');
  #explicit: Mode | null = loadPref<Mode | null>('theme', null);
  #media = window.matchMedia('(prefers-color-scheme: dark)');

  constructor() {
    this.#media.addEventListener('change', () => this.#apply());
    this.#apply();
  }

  get logo(): string {
    return `themes/${this.name}/${this.mode === 'dark' ? 'logo-dark.svg' : 'logo.svg'}`;
  }

  /** Swap the stylesheet index.html starts with; resolves once it applies,
   *  so the first real render already has the right colours. */
  use(name: string): Promise<void> {
    this.name = name;
    document.querySelector<HTMLLinkElement>('link#favicon')?.setAttribute('href', `themes/${name}/logo.svg`);
    const link = document.querySelector<HTMLLinkElement>('link#theme-css');
    const href = `themes/${name}/theme.css`;
    if (!link || link.getAttribute('href') === href) return Promise.resolve();
    return new Promise((resolve) => {
      link.onload = link.onerror = () => resolve();
      link.setAttribute('href', href);
    });
  }

  toggle(): void {
    this.#explicit = this.mode === 'dark' ? 'light' : 'dark';
    savePref('theme', this.#explicit);
    this.#apply();
  }

  #apply(): void {
    this.mode = this.#explicit ?? (this.#media.matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = this.mode;
  }
}

export const theme = new ThemeState();
