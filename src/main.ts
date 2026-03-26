import "./style.css";
import { GatewayClient } from "./gateway/client";

const DEFAULT_GATEWAY_URL = "ws://localhost:18789";

const statusEl = document.querySelector<HTMLElement>("#status");
const detailEl = document.querySelector<HTMLElement>("#detail");

function setUi(status: string, detail: string, dataState: string): void {
  if (statusEl) {
    statusEl.textContent = status;
    statusEl.dataset.state = dataState;
  }
  if (detailEl) {
    detailEl.textContent = detail;
  }
}

const url = import.meta.env.VITE_GATEWAY_URL?.trim() || DEFAULT_GATEWAY_URL;
const token = import.meta.env.VITE_GATEWAY_TOKEN?.trim() || undefined;

const client = new GatewayClient({
  url,
  token,
  onStatusChange: (s, detail) => {
    switch (s) {
      case "connecting":
        setUi("connecting…", url, "connecting");
        break;
      case "connected":
        setUi("connected", url, "connected");
        break;
      case "disconnected":
        setUi("disconnected", "reconnecting…", "disconnected");
        break;
      case "error":
        setUi("error", detail ?? "unknown error", "error");
        break;
      default:
        break;
    }
  },
});

client.start();
