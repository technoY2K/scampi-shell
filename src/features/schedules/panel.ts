import type { CronJobRow, CronListPayload, CronStatusPayload } from "./types";
import { formatOptionalWhen, formatScheduleLine, getTaskPreviewInfo } from "./format";

const TAG = "schedules-panel";

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

type CardParts = {
  meta: HTMLDivElement;
  runBtn: HTMLButtonElement;
  runStatus: HTMLSpanElement;
};

export class SchedulesPanel extends HTMLElement {
  private readonly shadow: ShadowRoot;
  private readonly refreshBtn: HTMLButtonElement;
  private readonly retryBtn: HTMLButtonElement;
  private readonly statusEl: HTMLParagraphElement;
  private readonly bannerEl: HTMLDivElement;
  private readonly listEl: HTMLDivElement;
  private readonly footnoteEl: HTMLParagraphElement;
  private readonly errorWrap: HTMLDivElement;

  private viewLocale = "en-US";
  private cronRunnerEnabled = true;
  private interactive = true;
  private readonly jobsById = new Map<string, CronJobRow>();
  private readonly cardParts = new Map<string, CardParts>();

  onRefresh?: () => void | Promise<void>;
  onRun?: (jobId: string) => void | Promise<void>;

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
      button.btn-run {
        background-color: transparent;
        background-image: none;
        border: 1px solid var(--color-border);
        color: var(--color-text);
        font-weight: 500;
        padding: 0.3rem 0.55rem;
        font-size: 0.75rem;
        opacity: 1;
        border-radius: var(--radius-sm);
        box-shadow: none;
      }
      button.btn-run:hover:not(:disabled) {
        filter: none;
        border-color: var(--color-accent);
        color: var(--color-accent-strong);
        transform: none;
        box-shadow: none;
      }
      button.btn-run:disabled {
        opacity: 0.45;
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
      .banner {
        display: none;
        margin: 0 0.75rem 0.5rem;
        padding: 0.5rem 0.65rem;
        border-radius: var(--radius-md);
        border: 1px solid var(--color-border);
        background: var(--color-warn-bg);
        color: var(--color-warn);
        font-size: 0.8125rem;
        line-height: 1.4;
      }
      .banner.visible {
        display: block;
      }
      .list {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 0.75rem 0.75rem 0.75rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .card {
        padding: 0.65rem 0.75rem;
        border-radius: var(--radius-md);
        border: 1px solid var(--color-border);
        background-color: var(--color-surface-deep);
        background-image: var(--surface-gloss);
        box-shadow: var(--shadow-tile);
      }
      .card-title {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.5rem;
        margin-bottom: 0.35rem;
      }
      .name {
        font-weight: 600;
        font-size: 0.9rem;
        line-height: 1.3;
        word-break: break-word;
      }
      .pill {
        flex-shrink: 0;
        font-size: 0.7rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        padding: 0.2rem 0.45rem;
        border-radius: var(--radius-pill);
      }
      .pill-on {
        background: var(--color-ok-bg);
        color: var(--color-ok);
      }
      .pill-off {
        background: var(--color-neutral-bg);
        color: var(--color-text-muted);
      }
      .run-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
        margin-bottom: 0.4rem;
      }
      .run-status {
        font-size: 0.75rem;
        color: var(--color-text-muted);
        min-height: 1.2em;
        flex: 1;
        min-width: 0;
      }
      .run-status.error {
        color: var(--color-err);
      }
      .run-status.ok {
        color: var(--color-ok-soft);
      }
      .meta {
        font-size: 0.75rem;
        line-height: 1.5;
        color: var(--color-text-muted);
      }
      .meta strong {
        color: var(--color-text-soft);
        font-weight: 500;
      }
      .empty {
        text-align: center;
        padding: 1.25rem 0.5rem;
        color: var(--color-text-muted);
        font-size: 0.8125rem;
        line-height: 1.5;
      }
      .footnote {
        margin: 0;
        padding: 0 0.75rem 0.75rem;
        font-size: 0.75rem;
        color: var(--color-text-muted);
        display: none;
      }
      .footnote.visible {
        display: block;
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
      .task-block {
        margin-top: 0.45rem;
        padding-top: 0.45rem;
        border-top: 1px solid var(--color-border);
      }
      .task-head {
        display: flex;
        align-items: flex-start;
        gap: 0.35rem;
        flex-wrap: wrap;
        font-size: 0.75rem;
        line-height: 1.5;
        color: var(--color-text-muted);
      }
      .task-head strong {
        color: var(--color-text-soft);
        font-weight: 500;
      }
      .task-preview {
        flex: 1;
        min-width: 0;
        word-break: break-word;
      }
      .task-toggle {
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.6rem;
        height: 1.6rem;
        margin: 0;
        margin-left: auto;
        padding: 0;
        border: none;
        border-radius: var(--radius-sm);
        background: transparent !important;
        color: var(--color-text-muted) !important;
        font-weight: 500;
        cursor: pointer;
        opacity: 1;
        box-shadow: none;
      }
      .task-toggle:hover:not(:disabled) {
        filter: none;
        color: var(--color-text-strong);
        background: var(--color-surface-hover) !important;
        box-shadow: none;
        transform: none;
      }
      .task-chev {
        display: block;
        transition: transform 0.15s ease;
      }
      .task-toggle[aria-expanded="true"] .task-chev {
        transform: rotate(90deg);
      }
      .task-full {
        margin-top: 0.4rem;
        padding: 0.5rem 0.55rem;
        border-radius: var(--radius-sm);
        background: var(--color-overlay);
        border: 1px solid var(--color-border);
        color: var(--color-text-strong);
        font-size: 0.75rem;
        line-height: 1.45;
        white-space: pre-wrap;
        word-break: break-word;
      }
    `;

    const toolbar = document.createElement("div");
    toolbar.className = "toolbar";

    const h1 = document.createElement("h1");
    h1.textContent = "Schedules";

    const explainer = document.createElement("p");
    explainer.className = "explainer";
    explainer.textContent =
      "Recurring and one-off tasks the assistant is asked to run. Use “Run now” to trigger one immediately — progress updates live from the gateway.";

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

    this.bannerEl = document.createElement("div");
    this.bannerEl.className = "banner";
    this.bannerEl.setAttribute("role", "status");

    this.listEl = document.createElement("div");
    this.listEl.className = "list";

    this.footnoteEl = document.createElement("p");
    this.footnoteEl.className = "footnote";
    this.footnoteEl.textContent = "";

    this.errorWrap = document.createElement("div");
    this.errorWrap.className = "error-wrap";
    const errP = document.createElement("p");
    errP.className = "error-msg";
    errP.textContent = "Couldn’t load schedules.";
    this.retryBtn = document.createElement("button");
    this.retryBtn.type = "button";
    this.retryBtn.textContent = "Retry";
    this.errorWrap.append(errP, this.retryBtn);

    body.append(this.statusEl, this.bannerEl, this.listEl, this.footnoteEl);

    this.shadow.append(style, toolbar, body, this.errorWrap);

    this.refreshBtn.addEventListener("click", () => {
      void this.onRefresh?.();
    });
    this.retryBtn.addEventListener("click", () => {
      void this.onRefresh?.();
    });
  }

  private clearJobMaps(): void {
    this.jobsById.clear();
    this.cardParts.clear();
  }

  private formatMetaHtml(job: CronJobRow, locale: string): string {
    const scheduleLine = formatScheduleLine(job.schedule);
    const nextAt = job.state?.nextRunAtMs;
    const lastAt = job.state?.lastRunAtMs;
    const lastSt = job.state?.lastRunStatus ?? job.state?.lastStatus;
    const parts: string[] = [];
    parts.push(`<strong>when:</strong> ${escapeHtml(scheduleLine)}`);
    parts.push(`<strong>next run:</strong> ${escapeHtml(formatOptionalWhen(nextAt, locale))}`);
    if (lastAt !== undefined) {
      parts.push(
        `<strong>last run:</strong> ${escapeHtml(formatOptionalWhen(lastAt, locale))}` +
          (lastSt ? ` · ${escapeHtml(lastSt)}` : ""),
      );
    }
    if (job.state?.lastError) {
      parts.push(`<strong>last issue:</strong> ${escapeHtml(job.state.lastError)}`);
    }
    if (job.description?.trim()) {
      parts.push(`<strong>note:</strong> ${escapeHtml(job.description.trim())}`);
    }
    return parts.join("<br>");
  }

  private buildTaskBlock(job: CronJobRow): HTMLDivElement | null {
    const info = getTaskPreviewInfo(job.payload);
    if (!info) {
      return null;
    }
    const block = document.createElement("div");
    block.className = "task-block";
    const head = document.createElement("div");
    head.className = "task-head";
    const label = document.createElement("strong");
    label.textContent = "task:";
    const previewSpan = document.createElement("span");
    previewSpan.className = "task-preview";
    previewSpan.textContent = info.isTruncated ? info.preview : info.full;
    head.append(label, previewSpan);
    if (info.isTruncated) {
      const safeId = `task-body-${job.id}`.replace(/[^a-zA-Z0-9_-]/g, "-");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "task-toggle";
      btn.setAttribute("aria-expanded", "false");
      btn.setAttribute("aria-label", "Show full task text");
      btn.setAttribute("aria-controls", safeId);
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "task-chev");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("width", "16");
      svg.setAttribute("height", "16");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "2");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
      svg.setAttribute("aria-hidden", "true");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M9 18l6-6-6-6");
      svg.append(path);
      btn.append(svg);
      const full = document.createElement("div");
      full.className = "task-full";
      full.id = safeId;
      full.hidden = true;
      full.textContent = info.full;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        full.hidden = !full.hidden;
        const expanded = !full.hidden;
        btn.setAttribute("aria-expanded", expanded ? "true" : "false");
        btn.setAttribute("aria-label", expanded ? "Hide full task text" : "Show full task text");
      });
      head.append(btn);
      block.append(head, full);
    } else {
      block.append(head);
    }
    return block;
  }

  setWaiting(): void {
    this.clearJobMaps();
    this.refreshBtn.disabled = false;
    this.statusEl.hidden = false;
    this.statusEl.textContent = "Waiting for OpenClaw…";
    this.bannerEl.classList.remove("visible");
    this.bannerEl.textContent = "";
    this.listEl.replaceChildren();
    this.footnoteEl.classList.remove("visible");
    this.footnoteEl.textContent = "";
    this.errorWrap.classList.remove("visible");
  }

  setLoading(): void {
    this.clearJobMaps();
    this.refreshBtn.disabled = true;
    this.statusEl.hidden = false;
    this.statusEl.textContent = "Loading schedules…";
    this.bannerEl.classList.remove("visible");
    this.errorWrap.classList.remove("visible");
    this.listEl.replaceChildren();
    this.footnoteEl.classList.remove("visible");
  }

  setError(): void {
    this.clearJobMaps();
    this.refreshBtn.disabled = false;
    this.statusEl.hidden = true;
    this.bannerEl.classList.remove("visible");
    this.listEl.replaceChildren();
    this.footnoteEl.classList.remove("visible");
    this.errorWrap.classList.add("visible");
  }

  setLoaded(
    status: CronStatusPayload,
    list: CronListPayload,
    opts?: { locale?: string; note?: string; blockedMessage?: string },
  ): void {
    this.clearJobMaps();
    const locale = opts?.locale ?? (typeof navigator !== "undefined" ? navigator.language : "en-US");
    this.viewLocale = locale;
    this.cronRunnerEnabled = Boolean(status.enabled);
    this.interactive = !opts?.blockedMessage;
    this.refreshBtn.disabled = false;
    this.statusEl.hidden = true;
    this.errorWrap.classList.remove("visible");

    this.bannerEl.classList.toggle("visible", !status.enabled);
    if (!status.enabled) {
      this.bannerEl.textContent =
        "The schedule runner is turned off in OpenClaw, so nothing will fire until you enable it. Saved schedules are still shown below.";
    } else {
      this.bannerEl.textContent = "";
    }

    this.listEl.replaceChildren();

    if (opts?.blockedMessage) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = opts.blockedMessage;
      this.listEl.append(empty);
    } else {
      const jobs = Array.isArray(list.jobs) ? list.jobs : [];
      for (const j of jobs) {
        this.jobsById.set(j.id, structuredClone(j));
      }
      if (jobs.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = "No schedules yet. When you add one, it will appear here.";
        this.listEl.append(empty);
      } else {
        for (const job of jobs) {
          this.listEl.append(this.buildCard(job, locale));
        }
      }
    }

    this.footnoteEl.classList.remove("visible");
    this.footnoteEl.textContent = "";
    if (list.hasMore) {
      this.footnoteEl.classList.add("visible");
      this.footnoteEl.textContent = "Only the first 200 schedules are shown. Use the full Control UI to browse or search the rest.";
    }
    if (opts?.note) {
      this.footnoteEl.classList.add("visible");
      this.footnoteEl.textContent = this.footnoteEl.textContent
        ? `${this.footnoteEl.textContent} ${opts.note}`
        : opts.note;
    }
  }

  private buildCard(job: CronJobRow, locale: string): HTMLDivElement {
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.jobId = job.id;

    const titleRow = document.createElement("div");
    titleRow.className = "card-title";

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = job.name || "(unnamed)";

    const pill = document.createElement("span");
    pill.className = `pill ${job.enabled ? "pill-on" : "pill-off"}`;
    pill.textContent = job.enabled ? "on" : "off";

    titleRow.append(name, pill);

    const runRow = document.createElement("div");
    runRow.className = "run-row";

    const runBtn = document.createElement("button");
    runBtn.type = "button";
    runBtn.className = "btn-run";
    runBtn.textContent = "Run now";
    const canRun = this.interactive && this.cronRunnerEnabled;
    runBtn.disabled = !canRun;
    if (!this.interactive) {
      runBtn.title = "Not available for this connection.";
    } else if (!this.cronRunnerEnabled) {
      runBtn.title = "Turn on the schedule runner in OpenClaw to run jobs.";
    }
    runBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!runBtn.disabled) {
        void this.onRun?.(job.id);
      }
    });

    const runStatus = document.createElement("span");
    runStatus.className = "run-status";
    runStatus.setAttribute("aria-live", "polite");

    runRow.append(runBtn, runStatus);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = this.formatMetaHtml(job, locale);

    this.cardParts.set(job.id, { meta, runBtn, runStatus });
    card.append(titleRow, runRow, meta);
    const taskBlock = this.buildTaskBlock(job);
    if (taskBlock) {
      card.append(taskBlock);
    }
    return card;
  }

  /**
   * updates run row from rpc result or local state
   */
  setRunRowState(
    jobId: string,
    kind: "running" | "error" | "done",
    detail?: string,
  ): void {
    const parts = this.cardParts.get(jobId);
    if (!parts) {
      return;
    }
    parts.runStatus.classList.remove("error", "ok");
    if (kind === "running") {
      parts.runBtn.disabled = true;
      parts.runStatus.textContent = "Running…";
      parts.runStatus.classList.remove("error", "ok");
      return;
    }
    if (kind === "error") {
      parts.runBtn.disabled = !this.cronRunnerEnabled;
      parts.runStatus.textContent = detail ?? "Couldn’t start.";
      parts.runStatus.classList.add("error");
      return;
    }
    parts.runBtn.disabled = !this.cronRunnerEnabled;
    parts.runStatus.textContent = detail ?? "Finished";
    parts.runStatus.classList.add("ok");
  }

  /**
   * gateway pushes cron events: started / finished (and more) for live run progress
   */
  applyCronEvent(payload: unknown): void {
    if (!payload || typeof payload !== "object") {
      return;
    }
    const p = payload as Record<string, unknown>;
    const jobId = typeof p.jobId === "string" ? p.jobId : "";
    if (!jobId || !this.cardParts.has(jobId)) {
      return;
    }
    const action = p.action;
    if (action === "started") {
      this.setRunRowState(jobId, "running");
      return;
    }
    if (action === "finished") {
      const job = this.jobsById.get(jobId);
      if (job) {
        const st = { ...job.state };
        if (typeof p.runAtMs === "number" && Number.isFinite(p.runAtMs)) {
          st.lastRunAtMs = p.runAtMs;
        }
        if (typeof p.status === "string") {
          st.lastRunStatus = p.status;
          st.lastStatus = p.status;
        }
        if (typeof p.error === "string" && p.error.trim()) {
          st.lastError = p.error;
        } else {
          st.lastError = undefined;
        }
        if (typeof p.nextRunAtMs === "number" && Number.isFinite(p.nextRunAtMs)) {
          st.nextRunAtMs = p.nextRunAtMs;
        }
        job.state = st;
        const parts = this.cardParts.get(jobId);
        if (parts) {
          parts.meta.innerHTML = this.formatMetaHtml(job, this.viewLocale);
        }
      }

      const status = typeof p.status === "string" ? p.status : "";
      const err = typeof p.error === "string" && p.error.trim() ? p.error.trim() : undefined;
      const failed = Boolean(err) || status === "error";
      const ms = typeof p.durationMs === "number" ? p.durationMs : undefined;
      const dur =
        ms != null && Number.isFinite(ms) && ms >= 0
          ? ms < 1000
            ? ` · ${Math.round(ms)}ms`
            : ` · ${(ms / 1000).toFixed(1)}s`
          : "";

      if (failed) {
        const msg = err ? `${err}${dur}` : `run ended${dur}`;
        this.setRunRowState(jobId, "error", `Finished · ${status || "error"} — ${msg}`);
      } else {
        this.setRunRowState(jobId, "done", `Finished · ${status || "ok"}${dur}`);
      }
    }
  }
}

if (!customElements.get(TAG)) {
  customElements.define(TAG, SchedulesPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "schedules-panel": SchedulesPanel;
  }
}
