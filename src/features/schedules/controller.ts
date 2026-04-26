import { GatewayRequestError, GatewayClient } from "../../gateway/client";
import type { SchedulesPanel } from "./panel";
import type { CronListPayload, CronRunResponse, CronStatusPayload } from "./types";

const LIST_PARAMS = {
  includeDisabled: true,
  limit: 200,
  offset: 0,
  enabled: "all" as const,
  sortBy: "name" as const,
  sortDir: "asc" as const,
};

export class SchedulesController {
  private readonly client: GatewayClient;
  private readonly panel: SchedulesPanel;
  private connected = false;

  constructor(client: GatewayClient, panel: SchedulesPanel) {
    this.client = client;
    this.panel = panel;
    this.panel.onRefresh = () => this.refresh();
    this.panel.onRun = (jobId) => this.runJob(jobId);
  }

  setConnected(connected: boolean): void {
    this.connected = connected;
    if (!connected) {
      this.panel.setWaiting();
    }
  }

  async refresh(): Promise<void> {
    if (!this.connected) {
      this.panel.setWaiting();
      return;
    }
    this.panel.setLoading();
    try {
      const [status, list] = await Promise.all([
        this.client.request<CronStatusPayload>("cron.status", {}),
        this.client.request<CronListPayload>("cron.list", LIST_PARAMS),
      ]);
      this.panel.setLoaded(
        {
          enabled: Boolean(status?.enabled),
          jobs: typeof status?.jobs === "number" ? status.jobs : 0,
          nextWakeAtMs: status?.nextWakeAtMs,
        },
        {
          jobs: Array.isArray(list?.jobs) ? list.jobs : [],
          hasMore: list?.hasMore,
          total: list?.total,
        },
      );
    } catch (err) {
      if (err instanceof GatewayRequestError) {
        if (
          err.gatewayCode === "FORBIDDEN" ||
          /scope|operator\.read|permission/i.test(String(err.message))
        ) {
          this.panel.setLoaded(
            { enabled: true, jobs: 0 },
            { jobs: [] },
            {
              blockedMessage:
                "This connection can’t read schedules. Check your gateway access and that this browser session has operator read permission, then try again.",
            },
          );
          return;
        }
      }
      this.panel.setError();
    }
  }

  /** live gateway `cron` events (started / finished) */
  handleCronEvent(payload: unknown): void {
    this.panel.applyCronEvent(payload);
  }

  private async runJob(jobId: string): Promise<void> {
    if (!this.connected) {
      return;
    }
    this.panel.setRunRowState(jobId, "running");
    try {
      const res = await this.client.request<CronRunResponse>("cron.run", {
        id: jobId,
        mode: "force",
      });
      if (res && typeof res === "object") {
        if (res.ran === false && res.ok) {
          this.panel.setRunRowState(
            jobId,
            "error",
            res.reason === "invalid-spec"
              ? "This schedule can’t run — check session target and config."
              : "Run did not start.",
          );
          return;
        }
        if (res.ok === false) {
          this.panel.setRunRowState(jobId, "error", "Couldn’t queue this run.");
          return;
        }
      }
    } catch (err) {
      const msg =
        err instanceof GatewayRequestError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      this.panel.setRunRowState(jobId, "error", msg);
    }
  }
}
