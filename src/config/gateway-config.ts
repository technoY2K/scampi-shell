import { getConfigStore } from "../platform/storage";
import { isTauri } from "../platform/runtime";

export type GatewayConfig = { url: string; token: string };

export const DEFAULT_GATEWAY_URL = "ws://localhost:18789";

const GATEWAY_KEY = "gateway";

function isGatewayConfig(value: unknown): value is GatewayConfig {
  if (!value || typeof value !== "object") {
    return false;
  }
  const o = value as Record<string, unknown>;
  return typeof o.url === "string" && typeof o.token === "string";
}

export async function loadGatewayConfig(): Promise<GatewayConfig | null> {
  if (isTauri()) {
    const store = await getConfigStore();
    const raw = await store.get(GATEWAY_KEY);
    if (raw == null) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isGatewayConfig(parsed)) {
        return parsed;
      }
    } catch {
      return null;
    }
    return null;
  }
  const url = import.meta.env.VITE_GATEWAY_URL?.trim() || DEFAULT_GATEWAY_URL;
  const token = import.meta.env.VITE_GATEWAY_TOKEN?.trim() || "";
  return { url, token };
}

export async function saveGatewayConfig(cfg: GatewayConfig): Promise<void> {
  if (isTauri()) {
    const store = await getConfigStore();
    await store.set(GATEWAY_KEY, JSON.stringify(cfg));
    return;
  }
  console.warn("[scampi] saveGatewayConfig: ignored in browser; use tauri for persisted settings");
}
