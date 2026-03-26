export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export type GatewayErrorInfo = {
  code: string;
  message: string;
  details?: unknown;
};

export type GatewayConnectClientInfo = {
  id: string;
  version: string;
  platform: string;
  mode: string;
  instanceId?: string;
};

/** outbound rpc params for method "connect" */
export type ConnectParams = {
  minProtocol: number;
  maxProtocol: number;
  client: GatewayConnectClientInfo;
  role: string;
  scopes: string[];
  caps: string[];
  auth?: { token?: string; password?: string; deviceToken?: string };
  device?: {
    id: string;
    publicKey: string;
    signature: string;
    signedAt: number;
    nonce: string;
  };
  userAgent: string;
  locale: string;
};

export type GatewayRequestFrame = {
  type: "req";
  id: string;
  method: string;
  params?: unknown;
};

export type GatewayEventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
};

export type GatewayResponseFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: GatewayErrorInfo;
};

/** payload of a successful connect response (hello-ok) */
export type HelloOkPayload = {
  type: "hello-ok";
  protocol?: number;
  server?: { version?: string; connId?: string };
  features?: { methods?: string[]; events?: string[] };
  snapshot?: unknown;
  auth?: {
    deviceToken?: string;
    role?: string;
    scopes?: string[];
    issuedAtMs?: number;
  };
  policy?: { tickIntervalMs?: number };
};

export type GatewayClientOptions = {
  url: string;
  token?: string;
  onStatusChange?: (status: ConnectionStatus, detail?: string) => void;
  onHello?: (hello: HelloOkPayload) => void;
};
