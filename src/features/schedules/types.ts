/**
 * minimal shapes for cron.* gateway responses — keep loose for forward compatibility
 */
export type CronStatusPayload = {
  enabled: boolean;
  jobs: number;
  nextWakeAtMs?: number | null;
};

export type CronJobRow = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  schedule?: unknown;
  payload?: unknown;
  state?: {
    nextRunAtMs?: number;
    lastRunAtMs?: number;
    lastRunStatus?: string;
    lastStatus?: string;
    lastError?: string;
  };
};

export type CronListPayload = {
  jobs: CronJobRow[];
  total?: number;
  hasMore?: boolean;
};

export type CronRunResponse = {
  ok?: boolean;
  enqueued?: boolean;
  runId?: string;
  ran?: boolean;
  reason?: string;
};
