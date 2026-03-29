const TAG = "chat-panel";

export type ChatSender = "user" | "agent";

export class ChatPanel extends HTMLElement {
  private readonly shadow: ShadowRoot;
  private readonly listEl: HTMLDivElement;
  private readonly inputEl: HTMLTextAreaElement;
  private readonly sendBtn: HTMLButtonElement;
  /** temporary agent bubble while streaming */
  private streamWrap: HTMLDivElement | null = null;
  /** typing indicator element */
  private typingWrap: HTMLDivElement | null = null;

  /** called when user submits; orchestrator adds messages and sends to gateway */
  onSend?: (text: string) => void | Promise<void>;

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
        font-family: var(--cp-font, system-ui, sans-serif);
        font-size: 0.875rem;
        color: var(--cp-text, #f1f5f9);
      }
      .list {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 0.75rem;
        display: flex;
        flex-direction: column;
      }
      .msg {
        padding: 0.5rem 0.65rem;
        border-radius: 10px;
        line-height: 1.45;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .msg-user {
        background: var(--cp-user-bg, #1d4ed8);
        color: #fff;
      }
      .msg-agent {
        background: var(--cp-agent-bg, #1e293b);
        border: 1px solid var(--cp-border, #334155);
      }
      .msg + .msg {
        margin-top: 0.5rem;
      }
      .msg-agent + .msg-user {
        margin-top: 2.75rem;
      }
      .msg-streaming {
        opacity: 0.92;
        border-style: dashed;
      }
      .msg-label {
        font-size: 0.65rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        opacity: 0.75;
        margin-bottom: 0.2rem;
      }
      .composer {
        flex-shrink: 0;
        display: flex;
        gap: 0.5rem;
        padding: 0.65rem;
        border-top: 1px solid var(--cp-border, #334155);
        background: var(--cp-composer-bg, #0f172a);
        align-items: flex-end;
      }
      textarea {
        flex: 1;
        min-height: 2.5rem;
        max-height: 8rem;
        resize: vertical;
        border: 1px solid var(--cp-border, #334155);
        border-radius: 8px;
        padding: 0.5rem 0.6rem;
        background: var(--cp-input-bg, #020617);
        color: inherit;
        font: inherit;
        line-height: 1.4;
      }
      textarea:focus {
        outline: 2px solid var(--cp-focus, #3b82f6);
        outline-offset: 1px;
      }
      button {
        flex-shrink: 0;
        padding: 0.5rem 0.85rem;
        border: none;
        border-radius: 8px;
        background: var(--cp-accent, #3b82f6);
        color: #fff;
        font-weight: 600;
        font-size: 0.8125rem;
        cursor: pointer;
      }
      button:hover {
        filter: brightness(1.08);
      }
      button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .typing {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        padding: 0.75rem 0;
      }
      .typing-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--cp-text, #f1f5f9);
        opacity: 0.4;
        animation: typing-bounce 1.2s ease-in-out infinite;
      }
      .typing-dot:nth-child(2) { animation-delay: 0.15s; }
      .typing-dot:nth-child(3) { animation-delay: 0.3s; }
      @keyframes typing-bounce {
        0%, 60%, 100% { opacity: 0.4; transform: translateY(0); }
        30% { opacity: 1; transform: translateY(-4px); }
      }
    `;

    this.listEl = document.createElement("div");
    this.listEl.className = "list";
    this.listEl.setAttribute("role", "log");
    this.listEl.setAttribute("aria-live", "polite");
    this.listEl.setAttribute("aria-relevant", "additions");

    const composer = document.createElement("div");
    composer.className = "composer";

    this.inputEl = document.createElement("textarea");
    this.inputEl.rows = 2;
    this.inputEl.placeholder = "Message…";
    this.inputEl.setAttribute("aria-label", "Message input");

    this.sendBtn = document.createElement("button");
    this.sendBtn.type = "button";
    this.sendBtn.textContent = "Send";

    composer.append(this.inputEl, this.sendBtn);

    this.shadow.append(style, this.listEl, composer);

    this.sendBtn.addEventListener("click", () => {
      void this.commitInput();
    });

    this.inputEl.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") {
        return;
      }
      if (ev.shiftKey) {
        return;
      }
      ev.preventDefault();
      void this.commitInput();
    });
  }

  connectedCallback(): void {
    // no placeholder copy; history or gateway fills the list
  }

  /** remove all message rows and any streaming bubble */
  clearMessages(): void {
    this.streamWrap = null;
    this.listEl.replaceChildren();
  }

  setSending(busy: boolean): void {
    this.sendBtn.disabled = busy;
    this.inputEl.disabled = busy;
  }

  /** append a message row */
  addMessage(sender: ChatSender, text: string): void {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = `msg msg-${sender}`;

    const label = document.createElement("div");
    label.className = "msg-label";
    label.textContent = sender === "user" ? "You" : "Agent";

    const body = document.createElement("div");
    body.textContent = trimmed;

    wrap.append(label, body);
    this.listEl.append(wrap);
    this.scrollToBottom();
  }

  /** create or update the in-progress agent bubble */
  updateStream(text: string): void {
    if (!this.streamWrap) {
      const wrap = document.createElement("div");
      wrap.className = "msg msg-agent msg-streaming";

      const label = document.createElement("div");
      label.className = "msg-label";
      label.textContent = "Agent";

      const body = document.createElement("div");
      body.textContent = text;

      wrap.append(label, body);
      this.listEl.append(wrap);
      this.streamWrap = wrap;
    } else {
      const body = this.streamWrap.querySelector("div:last-child");
      if (body) {
        body.textContent = text;
      }
    }
    this.scrollToBottom();
  }

  showTyping(): void {
    if (this.typingWrap) {
      return;
    }
    const wrap = document.createElement("div");
    wrap.className = "typing";
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement("span");
      dot.className = "typing-dot";
      wrap.append(dot);
    }
    this.listEl.append(wrap);
    this.typingWrap = wrap;
    this.scrollToBottom();
  }

  hideTyping(): void {
    if (this.typingWrap?.parentNode) {
      this.typingWrap.remove();
    }
    this.typingWrap = null;
  }

  /** remove streaming bubble without committing to history */
  clearStream(): void {
    if (this.streamWrap?.parentNode) {
      this.streamWrap.remove();
    }
    this.streamWrap = null;
  }

  private async commitInput(): Promise<void> {
    const raw = this.inputEl.value;
    const trimmed = raw.trim();
    if (!trimmed) {
      return;
    }
    this.inputEl.value = "";
    this.inputEl.style.height = "";
    await this.onSend?.(trimmed);
  }

  scrollToBottom(): void {
    requestAnimationFrame(() => {
      this.listEl.scrollTop = this.listEl.scrollHeight;
    });
  }
}

if (!customElements.get(TAG)) {
  customElements.define(TAG, ChatPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "chat-panel": ChatPanel;
  }
}
