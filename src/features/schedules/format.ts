const MS_MIN = 60_000;
const MS_HOUR = 60 * MS_MIN;
const MS_DAY = 24 * MS_HOUR;

/**
 * turn a repeat interval in ms into a short english phrase
 */
export function formatEveryMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "repeating";
  }
  if (ms % MS_DAY === 0) {
    const d = ms / MS_DAY;
    return d === 1 ? "every day" : `every ${d} days`;
  }
  if (ms % MS_HOUR === 0) {
    const h = ms / MS_HOUR;
    return h === 1 ? "every hour" : `every ${h} hours`;
  }
  if (ms % MS_MIN === 0) {
    const m = ms / MS_MIN;
    return m === 1 ? "every minute" : `every ${m} minutes`;
  }
  return `every ${Math.round(ms / 1000)} seconds`;
}

function scheduleRecord(s: unknown): Record<string, unknown> | null {
  return s && typeof s === "object" ? (s as Record<string, unknown>) : null;
}

/**
 * one-line schedule summary for a cron job
 */
export function formatScheduleLine(schedule: unknown): string {
  const o = scheduleRecord(schedule);
  if (!o) {
    return "unknown schedule";
  }
  const kind = o.kind;
  if (kind === "at" && typeof o.at === "string") {
    const at = o.at;
    const t = Date.parse(at);
    if (Number.isFinite(t)) {
      return `once · ${new Date(t).toLocaleString()}`;
    }
    return `once · ${at}`;
  }
  if (kind === "every" && typeof o.everyMs === "number") {
    return formatEveryMs(o.everyMs);
  }
  if (kind === "cron" && typeof o.expr === "string") {
    const expr = o.expr;
    const tz = typeof o.tz === "string" && o.tz.trim() ? ` (${o.tz})` : "";
    return `expression · ${expr}${tz}`;
  }
  return "custom schedule";
}

const TASK_PREVIEW_MAX = 100;

/**
 * full task text from job payload (system event or agent turn)
 */
export function getPayloadTaskText(payload: unknown): string {
  const o = scheduleRecord(payload);
  if (!o) {
    return "";
  }
  if (o.kind === "systemEvent" && typeof o.text === "string") {
    return o.text.trim();
  }
  if (o.kind === "agentTurn" && typeof o.message === "string") {
    return o.message.trim();
  }
  return "";
}

export function getTaskPreviewInfo(payload: unknown): {
  full: string;
  preview: string;
  isTruncated: boolean;
} | null {
  const full = getPayloadTaskText(payload);
  if (!full) {
    return null;
  }
  if (full.length <= TASK_PREVIEW_MAX) {
    return { full, preview: full, isTruncated: false };
  }
  return { full, preview: `${full.slice(0, TASK_PREVIEW_MAX - 3)}…`, isTruncated: true };
}

/**
 * one-line description of what the job does (payload)
 */
export function formatPayloadLine(payload: unknown): string {
  const info = getTaskPreviewInfo(payload);
  return info ? info.preview : "";
}

export function formatOptionalWhen(ms: number | undefined | null, locale: string): string {
  if (ms === undefined || ms === null || !Number.isFinite(ms)) {
    return "—";
  }
  return new Date(ms).toLocaleString(locale);
}
