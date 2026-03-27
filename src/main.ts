import "./style.css";
import "./components/room-window";
import "./components/chat-panel";
import { GatewayClient } from "./gateway/client";
import type { RoomWindow } from "./components/room-window";

const DEFAULT_GATEWAY_URL = "ws://localhost:18789";

const statusShell = document.querySelector<HTMLElement>("#status-shell");
const statusLabel = document.querySelector<HTMLElement>("#status-label");
const chatFab = document.querySelector<HTMLButtonElement>("#chat-fab");
const chatWindow = document.querySelector<RoomWindow>("#chat-window");

function setUi(status: string, detail: string, dataState: string): void {
  if (statusShell) {
    statusShell.dataset.state = dataState;
  }
  if (statusLabel) {
    statusLabel.textContent = status;
  }
  if (detail && statusLabel && detail !== status) {
    statusLabel.title = detail;
  } else if (statusLabel) {
    statusLabel.title = "";
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

function setFabVisible(visible: boolean): void {
  chatFab?.classList.toggle("is-hidden", !visible);
}

if (chatFab && chatWindow) {
  chatFab.addEventListener("click", () => {
    chatWindow.open();
    setFabVisible(false);
  });

  chatWindow.addEventListener("room-window-close", () => {
    setFabVisible(true);
  });
}
