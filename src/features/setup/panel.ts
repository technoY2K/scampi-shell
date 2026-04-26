import { DEFAULT_GATEWAY_URL } from "../../config/gateway-config";

const TAG = "setup-panel";

function isValidGatewayUrl(s: string): boolean {
  try {
    const u = new URL(s.trim());
    return u.protocol === "ws:" || u.protocol === "wss:";
  } catch {
    return false;
  }
}

export class SetupPanel extends HTMLElement {
  private readonly shadow: ShadowRoot;
  private readonly dialogEl: HTMLDialogElement;
  private readonly urlInput: HTMLInputElement;
  private readonly tokenInput: HTMLInputElement;
  private readonly errorEl: HTMLParagraphElement;
  private readonly saveBtn: HTMLButtonElement;
  private onSave?: (url: string, token: string) => Promise<void>;
  private waitResolve: (() => void) | null = null;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = `
      :host { display: contents; }
      dialog {
        box-sizing: border-box;
        margin: auto;
        padding: 0;
        border: 1px solid var(--su-border, #334155);
        border-radius: var(--su-radius, 10px);
        background: var(--su-surface, #111827);
        color: var(--su-text, #f1f5f9);
        box-shadow: var(--su-shadow, 0 24px 64px rgba(0, 0, 0, 0.55));
        width: min(92vw, 400px);
      }
      dialog::backdrop {
        background: rgba(2, 6, 23, 0.78);
      }
      .frame {
        padding: 1.15rem 1.1rem 1.1rem;
      }
      h1 {
        margin: 0 0 0.5rem;
        font-size: 1.05rem;
        font-weight: 600;
      }
      .lede {
        margin: 0 0 1rem;
        font-size: 0.85rem;
        line-height: 1.45;
        color: var(--su-muted, #94a3b8);
      }
      label {
        display: block;
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--su-muted, #94a3b8);
        margin-bottom: 0.35rem;
      }
      .field {
        margin-bottom: 0.85rem;
      }
      input {
        width: 100%;
        box-sizing: border-box;
        padding: 0.5rem 0.55rem;
        border-radius: 8px;
        border: 1px solid var(--su-border, #334155);
        background: var(--su-input-bg, #020617);
        color: var(--su-text, #f1f5f9);
        font-family: var(--su-mono, ui-monospace, monospace);
        font-size: 0.8rem;
      }
      input:focus {
        outline: 2px solid var(--su-accent, #3b82f6);
        outline-offset: 0;
      }
      .actions {
        margin-top: 1rem;
        display: flex;
        justify-content: flex-end;
      }
      button[type="submit"] {
        padding: 0.5rem 1rem;
        border: none;
        border-radius: 8px;
        background: var(--su-accent, #3b82f6);
        color: #fff;
        font-weight: 600;
        font-size: 0.85rem;
        cursor: pointer;
      }
      button[type="submit"]:hover:not(:disabled) {
        filter: brightness(1.08);
      }
      button[type="submit"]:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .err {
        margin: 0 0 0.75rem;
        font-size: 0.8rem;
        color: var(--su-err, #f87171);
        min-height: 1.2em;
      }
    `;

    this.dialogEl = document.createElement("dialog");
    this.dialogEl.addEventListener("cancel", (e) => {
      e.preventDefault();
    });

    const frame = document.createElement("div");
    frame.className = "frame";

    const title = document.createElement("h1");
    title.textContent = "Connect to your gateway";

    const lede = document.createElement("p");
    lede.className = "lede";
    lede.textContent =
      "Enter the WebSocket address OpenClaw shows in your terminal. You can leave the token blank if your gateway does not require one.";

    this.errorEl = document.createElement("p");
    this.errorEl.className = "err";
    this.errorEl.setAttribute("role", "alert");
    this.errorEl.textContent = "";

    const form = document.createElement("form");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      void this.handleSave();
    });

    const urlWrap = document.createElement("div");
    urlWrap.className = "field";
    const urlLabel = document.createElement("label");
    urlLabel.htmlFor = "su-url";
    urlLabel.textContent = "Gateway URL";
    this.urlInput = document.createElement("input");
    this.urlInput.id = "su-url";
    this.urlInput.type = "text";
    this.urlInput.name = "url";
    this.urlInput.autocomplete = "off";
    this.urlInput.spellcheck = false;
    this.urlInput.placeholder = DEFAULT_GATEWAY_URL;
    this.urlInput.required = true;
    urlWrap.append(urlLabel, this.urlInput);

    const tokWrap = document.createElement("div");
    tokWrap.className = "field";
    const tokLabel = document.createElement("label");
    tokLabel.htmlFor = "su-token";
    tokLabel.textContent = "Auth token (optional)";
    this.tokenInput = document.createElement("input");
    this.tokenInput.id = "su-token";
    this.tokenInput.type = "password";
    this.tokenInput.name = "token";
    this.tokenInput.autocomplete = "off";
    this.tokenInput.spellcheck = false;
    tokWrap.append(tokLabel, this.tokenInput);

    this.saveBtn = document.createElement("button");
    this.saveBtn.type = "submit";
    this.saveBtn.textContent = "Save and continue";

    const actions = document.createElement("div");
    actions.className = "actions";
    actions.append(this.saveBtn);

    form.append(urlWrap, tokWrap, actions);
    frame.append(title, lede, this.errorEl, form);
    this.dialogEl.append(frame);

    this.shadow.append(style, this.dialogEl);
  }

  setOnSave(handler: (url: string, token: string) => Promise<void>): void {
    this.onSave = handler;
  }

  /** show modal and resolve when the user has saved valid config and the dialog closes */
  openAndWait(): Promise<void> {
    return new Promise((resolve) => {
      this.waitResolve = resolve;
      this.errorEl.textContent = "";
      this.urlInput.value = "";
      this.tokenInput.value = "";
      this.dialogEl.showModal();
    });
  }

  private finish(): void {
    this.dialogEl.close();
    this.dispatchEvent(
      new CustomEvent("setup-complete", { bubbles: true, composed: true })
    );
    const r = this.waitResolve;
    this.waitResolve = null;
    r?.();
  }

  private async handleSave(): Promise<void> {
    this.errorEl.textContent = "";
    const url = this.urlInput.value.trim();
    const token = this.tokenInput.value;
    if (!isValidGatewayUrl(url)) {
      this.errorEl.textContent =
        "That address should start with ws:// or wss:// (for example, a local address like ws://192.168.1.5:18789).";
      return;
    }
    if (!this.onSave) {
      this.errorEl.textContent = "Could not save. Please restart the app.";
      return;
    }
    this.saveBtn.disabled = true;
    try {
      await this.onSave(url, token);
      this.finish();
    } catch {
      this.errorEl.textContent = "We could not save your settings. Try again.";
    } finally {
      this.saveBtn.disabled = false;
    }
  }
}

if (!customElements.get(TAG)) {
  customElements.define(TAG, SetupPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    [TAG]: SetupPanel;
  }
}
