const TAG = "room-window";

const RESIZE_MIN_W = 260;
const RESIZE_MIN_H = 220;

export class RoomWindow extends HTMLElement {
  private static zCounter = 1000;

  private readonly shadow: ShadowRoot;
  private readonly dialogEl: HTMLDialogElement;
  private readonly titleBar: HTMLElement;
  private readonly resizeHandle: HTMLDivElement;

  private dragPointerId: number | null = null;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  private resizePointerId: number | null = null;
  private resizeStartW = 0;
  private resizeStartH = 0;
  private resizeStartClientX = 0;
  private resizeStartClientY = 0;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = `
      :host {
        display: contents;
      }
      dialog:not([open]) {
        display: none;
      }
      /* only flex when [open]; plain dialog { display:flex } breaks hiding after close() */
      dialog[open] {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        border: 1px solid var(--rw-border, #334155);
        border-radius: var(--rw-radius, 10px);
        background: var(--rw-surface, #111827);
        color: var(--rw-text, #f1f5f9);
        box-shadow: var(--rw-shadow, 0 16px 48px rgba(0, 0, 0, 0.45));
        overflow: hidden;
        width: min(96vw, 420px);
        min-width: ${RESIZE_MIN_W}px;
        min-height: 280px;
        max-width: 96vw;
        max-height: 85vh;
        height: auto;
        display: flex;
        flex-direction: column;
        position: fixed;
        top: 12vh;
        left: 50%;
        transform: translateX(-50%);
      }
      .resize-handle {
        position: absolute;
        right: 0;
        bottom: 0;
        width: 18px;
        height: 18px;
        z-index: 3;
        cursor: nwse-resize;
        touch-action: none;
        user-select: none;
        border-bottom-right-radius: var(--rw-radius, 10px);
        background: linear-gradient(
          135deg,
          transparent 0%,
          transparent 50%,
          rgba(148, 163, 184, 0.35) 50%,
          rgba(148, 163, 184, 0.35) 100%
        );
      }
      .resize-handle:hover {
        background: linear-gradient(
          135deg,
          transparent 0%,
          transparent 45%,
          rgba(148, 163, 184, 0.55) 45%,
          rgba(148, 163, 184, 0.55) 100%
        );
      }
      dialog[open]::backdrop {
        display: none;
      }
      .title-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        padding: 0.5rem 0.65rem;
        background: var(--rw-title-bg, #1e293b);
        border-bottom: 1px solid var(--rw-border, #334155);
        cursor: grab;
        user-select: none;
        flex-shrink: 0;
      }
      .title-bar:active {
        cursor: grabbing;
      }
      .title-text {
        font-size: 0.8125rem;
        font-weight: 600;
        letter-spacing: 0.02em;
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .close-btn {
        flex-shrink: 0;
        width: 1.75rem;
        height: 1.75rem;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--rw-muted, #94a3b8);
        cursor: pointer;
        display: grid;
        place-items: center;
        font-size: 1.25rem;
        line-height: 1;
      }
      .close-btn:hover {
        background: rgba(248, 113, 113, 0.15);
        color: #f87171;
      }
      .body {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      slot {
        display: contents;
      }
      ::slotted(*) {
        flex: 1;
        min-height: 0;
        min-width: 0;
      }
    `;

    this.dialogEl = document.createElement("dialog");
    this.dialogEl.setAttribute("part", "dialog");

    this.titleBar = document.createElement("div");
    this.titleBar.className = "title-bar";
    this.titleBar.setAttribute("part", "title-bar");

    const titleText = document.createElement("span");
    titleText.className = "title-text";
    titleText.id = `${TAG}-title`;
    titleText.textContent = this.getAttribute("title") ?? "Window";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "close-btn";
    closeBtn.setAttribute("aria-label", "Close window");
    closeBtn.textContent = "\u00d7";

    this.titleBar.append(titleText, closeBtn);

    const body = document.createElement("div");
    body.className = "body";
    const slot = document.createElement("slot");
    body.append(slot);

    this.resizeHandle = document.createElement("div");
    this.resizeHandle.className = "resize-handle";
    this.resizeHandle.setAttribute("part", "resize-handle");
    this.resizeHandle.setAttribute("aria-hidden", "true");
    this.resizeHandle.title = "Resize";

    this.dialogEl.append(this.titleBar, body, this.resizeHandle);

    this.shadow.append(style, this.dialogEl);

    this.dialogEl.addEventListener("close", () => {
      this.dispatchEvent(
        new CustomEvent("room-window-close", {
          bubbles: true,
          composed: true,
        }),
      );
    });

    closeBtn.addEventListener("click", () => {
      this.close();
    });

    this.titleBar.addEventListener("pointerdown", (ev) => {
      if ((ev.target as HTMLElement).closest("button")) {
        return;
      }
      this.bringToFront();
      this.dragPointerId = ev.pointerId;
      const rect = this.dialogEl.getBoundingClientRect();
      this.dragOffsetX = ev.clientX - rect.left;
      this.dragOffsetY = ev.clientY - rect.top;
      this.dialogEl.style.transform = "none";
      this.titleBar.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    });

    this.titleBar.addEventListener("pointermove", (ev) => {
      if (this.dragPointerId !== ev.pointerId) {
        return;
      }
      const x = ev.clientX - this.dragOffsetX;
      const y = ev.clientY - this.dragOffsetY;
      const maxX = window.innerWidth - this.dialogEl.offsetWidth;
      const maxY = window.innerHeight - this.dialogEl.offsetHeight;
      this.dialogEl.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
      this.dialogEl.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
    });

    this.titleBar.addEventListener("pointerup", (ev) => {
      if (this.dragPointerId === ev.pointerId) {
        this.dragPointerId = null;
        this.titleBar.releasePointerCapture(ev.pointerId);
      }
    });

    this.titleBar.addEventListener("pointercancel", (ev) => {
      if (this.dragPointerId === ev.pointerId) {
        this.dragPointerId = null;
        try {
          this.titleBar.releasePointerCapture(ev.pointerId);
        } catch {
          /* ignore */
        }
      }
    });

    this.dialogEl.addEventListener("pointerdown", () => {
      this.bringToFront();
    });

    this.resizeHandle.addEventListener("pointerdown", (ev) => {
      ev.stopPropagation();
      this.bringToFront();
      this.resizePointerId = ev.pointerId;
      const rect = this.dialogEl.getBoundingClientRect();
      this.resizeStartW = rect.width;
      this.resizeStartH = rect.height;
      this.resizeStartClientX = ev.clientX;
      this.resizeStartClientY = ev.clientY;
      this.resizeHandle.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    });

    this.resizeHandle.addEventListener("pointermove", (ev) => {
      if (this.resizePointerId !== ev.pointerId) {
        return;
      }
      const dw = ev.clientX - this.resizeStartClientX;
      const dh = ev.clientY - this.resizeStartClientY;
      const geo = this.dialogEl.getBoundingClientRect();
      const maxW = window.innerWidth - geo.left;
      const maxH = window.innerHeight - geo.top;
      const w = Math.min(maxW, Math.max(RESIZE_MIN_W, this.resizeStartW + dw));
      const h = Math.min(maxH, Math.max(RESIZE_MIN_H, this.resizeStartH + dh));
      this.dialogEl.style.width = `${Math.round(w)}px`;
      this.dialogEl.style.height = `${Math.round(h)}px`;
    });

    const endResize = (ev: PointerEvent): void => {
      if (this.resizePointerId !== ev.pointerId) {
        return;
      }
      this.resizePointerId = null;
      try {
        this.resizeHandle.releasePointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
    };

    this.resizeHandle.addEventListener("pointerup", endResize);
    this.resizeHandle.addEventListener("pointercancel", endResize);
  }

  static get observedAttributes(): string[] {
    return ["title"];
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "title") {
      const el = this.shadow.querySelector(".title-text");
      if (el) {
        el.textContent = value?.trim() || "Window";
      }
    }
  }

  open(): void {
    if (!this.dialogEl.open) {
      this.dialogEl.show();
    }
    this.bringToFront();
    this.dispatchEvent(
      new CustomEvent("room-window-open", {
        bubbles: true,
        composed: true,
      }),
    );
  }

  close(): void {
    if (this.dialogEl.open) {
      this.dialogEl.close();
    }
  }

  /** true when the native dialog is open */
  get isOpen(): boolean {
    return this.dialogEl.open;
  }

  private bringToFront(): void {
    RoomWindow.zCounter += 1;
    this.dialogEl.style.zIndex = String(RoomWindow.zCounter);
  }
}

if (!customElements.get(TAG)) {
  customElements.define(TAG, RoomWindow);
}

declare global {
  interface HTMLElementTagNameMap {
    "room-window": RoomWindow;
  }
}
