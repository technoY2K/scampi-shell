import { applyThemePreference } from "./apply";
import { getThemePreference, setThemePreference, type ThemePreference } from "./preference";

const TAG = "theme-toggle";

const CYCLE: readonly ThemePreference[] = ["system", "light", "dark"] as const;

const LABELS: Record<ThemePreference, string> = {
  system: "Theme: follows system",
  light: "Theme: light (Wii daylight)",
  dark: "Theme: dark (GameCube twilight)",
};

const ICONS: Record<ThemePreference, string> = {
  // system — half sun / half moon
  system: `
    <circle cx="12" cy="12" r="8"></circle>
    <path d="M12 4 v16 a8 8 0 0 0 0 -16 z" fill="currentColor" stroke="none"></path>
  `,
  // light — sun
  light: `
    <circle cx="12" cy="12" r="4"></circle>
    <path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"></path>
  `,
  // dark — crescent moon
  dark: `
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path>
  `,
};

function nextPreference(current: ThemePreference): ThemePreference {
  const idx = CYCLE.indexOf(current);
  return CYCLE[(idx + 1) % CYCLE.length] ?? "system";
}

export class ThemeToggle extends HTMLElement {
  private readonly shadow: ShadowRoot;
  private readonly button: HTMLButtonElement;
  private current: ThemePreference = "system";

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = `
      :host {
        display: inline-block;
      }
      button {
        display: grid;
        place-items: center;
        width: 2.1rem;
        height: 2.1rem;
        padding: 0;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background: var(--color-surface);
        color: var(--color-text-soft);
        cursor: pointer;
        transition:
          background 0.15s ease,
          color 0.15s ease,
          transform 0.15s ease;
      }
      button:hover {
        color: var(--color-accent-strong);
        transform: translateY(-1px);
      }
      button:focus-visible {
        outline: 2px solid var(--color-focus-ring);
        outline-offset: 2px;
      }
      svg {
        display: block;
        width: 1.05rem;
        height: 1.05rem;
      }
    `;

    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.addEventListener("click", () => {
      void this.cycle();
    });

    this.shadow.append(style, this.button);
  }

  async connectedCallback(): Promise<void> {
    this.current = await getThemePreference();
    this.render();
  }

  private async cycle(): Promise<void> {
    this.current = nextPreference(this.current);
    applyThemePreference(this.current);
    this.render();
    await setThemePreference(this.current);
  }

  private render(): void {
    const label = LABELS[this.current];
    this.button.setAttribute("aria-label", label);
    this.button.title = label;
    this.button.innerHTML = `
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >${ICONS[this.current]}</svg>
    `;
  }
}

if (!customElements.get(TAG)) {
  customElements.define(TAG, ThemeToggle);
}

declare global {
  interface HTMLElementTagNameMap {
    "theme-toggle": ThemeToggle;
  }
}
