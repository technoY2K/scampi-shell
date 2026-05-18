const TAG = "settings-panel";

export class SettingsPanel extends HTMLElement {
  private readonly shadow: ShadowRoot;
  private readonly refreshBtn: HTMLButtonElement;
  private readonly retryBtn: HTMLButtonElement;
  private readonly statusEl: HTMLParagraphElement;
  private readonly errorWrap: HTMLDivElement;
  private readonly preEl: HTMLPreElement;

  /** called when user clicks refresh or retry */
  onRefresh?: () => void | Promise<void>;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = `
      :host {
        display: flex;
        flex-direction: column;
        min-height: 0;
        min-width: 0;
        height: 100%;
        font-family: var(--font-sans);
        font-size: 0.875rem;
        color: var(--color-text);
      }
      .toolbar {
        flex-shrink: 0;
        padding: 0.75rem;
        border-bottom: 1px solid var(--color-border);
        background: var(--color-surface-sunken);
      }
      h1 {
        margin: 0 0 0.35rem;
        font-size: 1rem;
        font-weight: 600;
      }
      .explainer {
        margin: 0 0 0.65rem;
        font-size: 0.8125rem;
        line-height: 1.45;
        color: var(--color-text-muted);
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: center;
      }
      button {
        padding: 0.45rem 0.75rem;
        border: none;
        border-radius: var(--radius-md);
        background-color: var(--color-accent);
        background-image: var(--surface-gloss);
        color: var(--color-on-accent);
        font-weight: 600;
        font-size: 0.8125rem;
        cursor: pointer;
        box-shadow: var(--shadow-tile);
        transition: box-shadow 0.15s ease, transform 0.15s ease;
      }
      button:hover:not(:disabled) {
        filter: brightness(1.08);
        box-shadow: var(--shadow-tile-hover);
        transform: translateY(-1px);
      }
      button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .body {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .status {
        margin: 0;
        padding: 0.75rem;
        color: var(--color-text-muted);
      }
      .error-wrap {
        padding: 0 0.75rem 0.75rem;
        display: none;
      }
      .error-wrap.visible {
        display: block;
      }
      .error-msg {
        margin: 0 0 0.5rem;
        color: var(--color-err);
      }
      .pre-wrap {
        flex: 1;
        min-height: 0;
        margin: 0;
        padding: 0 0.75rem 0.75rem;
        overflow: auto;
        display: none;
      }
      .pre-wrap.visible {
        display: block;
      }
      pre {
        margin: 0;
        padding: 0.65rem;
        border-radius: var(--radius-sm);
        border: 1px solid var(--color-border);
        background: var(--color-surface-deep);
        font-family: var(--font-mono);
        font-size: 0.75rem;
        line-height: 1.45;
        white-space: pre-wrap;
        word-break: break-word;
      }
    `;

    const toolbar = document.createElement("div");
    toolbar.className = "toolbar";

    const h1 = document.createElement("h1");
    h1.textContent = "Settings";

    const explainer = document.createElement("p");
    explainer.className = "explainer";
    explainer.textContent = "What OpenClaw is running with right now. Read-only for now.";

    const actions = document.createElement("div");
    actions.className = "actions";

    this.refreshBtn = document.createElement("button");
    this.refreshBtn.type = "button";
    this.refreshBtn.textContent = "Refresh";

    actions.append(this.refreshBtn);

    toolbar.append(h1, explainer, actions);

    const body = document.createElement("div");
    body.className = "body";

    this.statusEl = document.createElement("p");
    this.statusEl.className = "status";
    this.statusEl.textContent = "Waiting for OpenClaw…";

    this.errorWrap = document.createElement("div");
    this.errorWrap.className = "error-wrap";
    const errP = document.createElement("p");
    errP.className = "error-msg";
    errP.textContent = "Couldn't load settings.";
    this.retryBtn = document.createElement("button");
    this.retryBtn.type = "button";
    this.retryBtn.textContent = "Retry";
    this.errorWrap.append(errP, this.retryBtn);

    const preWrap = document.createElement("div");
    preWrap.className = "pre-wrap";
    this.preEl = document.createElement("pre");
    preWrap.append(this.preEl);

    body.append(this.statusEl, this.errorWrap, preWrap);

    this.shadow.append(style, toolbar, body);

    this.refreshBtn.addEventListener("click", () => {
      void this.onRefresh?.();
    });
    this.retryBtn.addEventListener("click", () => {
      void this.onRefresh?.();
    });
  }

  setWaiting(): void {
    this.refreshBtn.disabled = false;
    this.statusEl.hidden = false;
    this.statusEl.textContent = "Waiting for OpenClaw…";
    this.errorWrap.classList.remove("visible");
    this.preEl.parentElement?.classList.remove("visible");
    this.preEl.textContent = "";
  }

  setLoading(): void {
    this.refreshBtn.disabled = true;
    this.statusEl.hidden = false;
    this.statusEl.textContent = "Loading settings…";
    this.errorWrap.classList.remove("visible");
    this.preEl.parentElement?.classList.remove("visible");
    this.preEl.textContent = "";
  }

  setError(): void {
    this.refreshBtn.disabled = false;
    this.statusEl.hidden = true;
    this.errorWrap.classList.add("visible");
    this.preEl.parentElement?.classList.remove("visible");
    this.preEl.textContent = "";
  }

  setLoaded(snapshot: unknown): void {
    this.refreshBtn.disabled = false;
    this.statusEl.hidden = true;
    this.errorWrap.classList.remove("visible");
    this.preEl.parentElement?.classList.add("visible");
    try {
      this.preEl.textContent = JSON.stringify(snapshot, null, 2);
    } catch {
      this.preEl.textContent = String(snapshot);
    }
  }
}

if (!customElements.get(TAG)) {
  customElements.define(TAG, SettingsPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "settings-panel": SettingsPanel;
  }
}
