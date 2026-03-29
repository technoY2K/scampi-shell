import type {
  ConnectionStatus,
  ConnectParams,
  GatewayClientOptions,
  GatewayEventFrame,
  GatewayResponseFrame,
  HelloOkPayload,
} from "./types";
import { buildDeviceAuthPayload } from "./device-auth-payload";
import { loadOrCreateDeviceIdentity, signDevicePayload } from "./device-identity";

const PROTOCOL_VERSION = 3;
const CONNECT_QUEUE_DELAY_MS = 750;

const OPERATOR_SCOPES = [
  "operator.admin",
  "operator.read",
  "operator.write",
  "operator.approvals",
  "operator.pairing",
] as const;

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
};

export class GatewayRequestError extends Error {
  readonly gatewayCode: string;
  readonly details?: unknown;

  constructor(error: { code: string; message: string; details?: unknown }) {
    super(error.message);
    this.name = "GatewayRequestError";
    this.gatewayCode = error.code;
    this.details = error.details;
  }
}

export class GatewayClient {
  private ws: WebSocket | null = null;
  private readonly pending = new Map<string, Pending>();
  private closed = false;
  private connectSent = false;
  private connectNonce: string | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = 800;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly opts: GatewayClientOptions) {}

  start(): void {
    this.closed = false;
    this.setStatus("connecting");
    this.connect();
  }

  stop(): void {
    this.closed = true;
    this.clearTimers();
    this.ws?.close();
    this.ws = null;
    this.flushPending(new Error("gateway client stopped"));
    this.connectSent = false;
    this.connectNonce = null;
  }

  private clearTimers(): void {
    if (this.connectTimer !== null) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setStatus(status: ConnectionStatus, detail?: string): void {
    this.opts.onStatusChange?.(status, detail);
  }

  private connect(): void {
    if (this.closed) {
      return;
    }
    this.setStatus("connecting");
    // new socket: server will send a fresh connect.challenge; drop any stale nonce
    this.connectNonce = null;
    this.connectSent = false;
    try {
      this.ws = new WebSocket(this.opts.url);
    } catch (e) {
      this.setStatus("error", e instanceof Error ? e.message : String(e));
      this.scheduleReconnect();
      return;
    }

    this.ws.addEventListener("open", () => this.queueConnect());

    this.ws.addEventListener("message", (ev) => {
      this.handleMessage(String(ev.data ?? ""));
    });

    this.ws.addEventListener("close", () => {
      this.ws = null;
      this.clearTimers();
      this.flushPending(new Error("gateway closed"));
      this.connectSent = false;
      this.connectNonce = null;
      if (!this.closed) {
        this.setStatus("disconnected");
        this.scheduleReconnect();
      }
    });

    this.ws.addEventListener("error", () => {
      // close handler runs after error
    });
  }

  private queueConnect(): void {
    this.connectSent = false;
    if (this.connectTimer !== null) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    // challenge can arrive before `open` in some runtimes; never wipe nonce here
    if (this.connectNonce) {
      void this.sendConnect();
      return;
    }
    this.connectTimer = setTimeout(() => {
      this.connectTimer = null;
      void this.sendConnect();
    }, CONNECT_QUEUE_DELAY_MS);
  }

  /**
   * operator + gateway token without a valid `device` block gets scopes cleared server-side.
   * binding uses @noble/ed25519 + @noble/hashes (no WebCrypto.subtle), so it works on http://LAN:5173.
   */
  private wantsDeviceBinding(): boolean {
    return true;
  }

  private async buildConnectParamsAsync(): Promise<ConnectParams> {
    const token = this.opts.token?.trim();
    const client = {
      id: "webchat",
      version: "0.1.0",
      platform: typeof navigator !== "undefined" ? navigator.platform || "web" : "web",
      mode: "webchat",
    };
    const params: ConnectParams = {
      minProtocol: PROTOCOL_VERSION,
      maxProtocol: PROTOCOL_VERSION,
      client,
      role: "operator",
      scopes: [...OPERATOR_SCOPES],
      caps: ["tool-events"],
      auth: token ? { token } : undefined,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "room-zero",
      locale: typeof navigator !== "undefined" ? navigator.language : "en-US",
    };

    if (!this.connectNonce) {
      return params;
    }

    try {
      const identity = await loadOrCreateDeviceIdentity();
      const signedAtMs = Date.now();
      const nonce = this.connectNonce;
      const payload = buildDeviceAuthPayload({
        deviceId: identity.deviceId,
        clientId: client.id,
        clientMode: client.mode,
        role: "operator",
        scopes: [...OPERATOR_SCOPES],
        signedAtMs,
        token: token ?? null,
        nonce,
      });
      const signature = await signDevicePayload(identity.privateKey, payload);
      params.device = {
        id: identity.deviceId,
        publicKey: identity.publicKey,
        signature,
        signedAt: signedAtMs,
        nonce,
      };
    } catch (err) {
      console.warn("[room-zero] device identity unavailable; gateway will strip operator scopes", err);
    }

    return params;
  }

  private async sendConnect(): Promise<void> {
    if (this.connectSent || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    if (this.wantsDeviceBinding() && !this.connectNonce) {
      return;
    }
    this.connectSent = true;
    if (this.connectTimer !== null) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }

    const params = await this.buildConnectParamsAsync();
    if (this.opts.token?.trim() && !params.device) {
      console.warn(
        "[room-zero] connect without device attestation; gateway may clear operator scopes (see prior identity warnings)",
      );
    }
    try {
      const payload = (await this.request<unknown>("connect", params)) as HelloOkPayload;
      if (payload && typeof payload === "object" && payload.type === "hello-ok") {
        this.backoffMs = 800;
        this.setStatus("connected");
        this.opts.onHello?.(payload);
      } else {
        this.setStatus("error", "unexpected connect response");
      }
    } catch (err) {
      const msg =
        err instanceof GatewayRequestError
          ? `${err.gatewayCode}: ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err);
      this.setStatus("error", msg);
      try {
        this.ws?.close(4008, "connect failed");
      } catch {
        /* ignore */
      }
    }
  }

  private handleMessage(raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    const frame = parsed as { type?: unknown };
    if (frame.type === "event") {
      const evt = parsed as GatewayEventFrame;
      if (evt.event === "connect.challenge") {
        const payload = evt.payload as { nonce?: unknown } | undefined;
        const nonce = payload && typeof payload.nonce === "string" ? payload.nonce : null;
        if (nonce) {
          this.connectNonce = nonce;
          this.connectSent = false;
          if (this.connectTimer !== null) {
            clearTimeout(this.connectTimer);
            this.connectTimer = null;
          }
          void this.sendConnect();
        }
        return;
      }
      this.opts.onEvent?.(evt.event, evt.payload);
      return;
    }

    if (frame.type === "res") {
      const res = parsed as GatewayResponseFrame;
      const pending = this.pending.get(res.id);
      if (!pending) {
        return;
      }
      this.pending.delete(res.id);
      if (res.ok) {
        pending.resolve(res.payload);
      } else {
        pending.reject(
          new GatewayRequestError({
            code: res.error?.code ?? "UNAVAILABLE",
            message: res.error?.message ?? "request failed",
            details: res.error?.details,
          }),
        );
      }
    }
  }

  request<T>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("gateway not connected"));
    }
    const id = crypto.randomUUID();
    const frame = { type: "req" as const, id, method, params };
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
      });
      this.ws!.send(JSON.stringify(frame));
    });
  }

  private flushPending(err: Error): void {
    for (const [, p] of this.pending) {
      p.reject(err);
    }
    this.pending.clear();
  }

  private scheduleReconnect(): void {
    if (this.closed) {
      return;
    }
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 1.7, 15_000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
