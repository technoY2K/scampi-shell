import "./style.css";
import "./components/room-window";
import "./features/chat/panel";
import "./features/settings/panel";
import { GatewayClient } from "./gateway/client";
import { ChatController } from "./features/chat";
import { SettingsController } from "./features/settings";
import type { ChatPanel } from "./features/chat";
import type { SettingsPanel } from "./features/settings";
import type { RoomWindow } from "./components/room-window";

const DEFAULT_GATEWAY_URL = "ws://localhost:18789";

const statusShell = document.querySelector<HTMLElement>("#status-shell");
const statusLabel = document.querySelector<HTMLElement>("#status-label");
const brandVersion = document.querySelector<HTMLElement>("#brand-version");
const chatFab = document.querySelector<HTMLButtonElement>("#chat-fab");
const chatWindow = document.querySelector<RoomWindow>("#chat-window");
const chatPanel = document.querySelector<ChatPanel>("chat-panel");
const settingsFab = document.querySelector<HTMLButtonElement>("#settings-fab");
const settingsWindow = document.querySelector<RoomWindow>("#settings-window");
const settingsPanel = document.querySelector<SettingsPanel>("settings-panel");

let chatController: ChatController | null = null;
let settingsController: SettingsController | null = null;

// sticky: keep last-known version visible across reconnects so transient
// disconnects don't blank out an identity-level label.
function setOpenClawVersion(version: string | undefined): void {
  if (!brandVersion || !version) {
    return;
  }
  brandVersion.textContent = `OpenClaw version ${version}`;
}

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
    const gatewayReady = s === "connected";
    settingsController?.setConnected(gatewayReady);
  },
  onHello: (hello) => {
    setOpenClawVersion(hello.server?.version);
    void chatController?.loadHistory();
    if (settingsWindow?.isOpen) {
      void settingsController?.refresh();
    }
  },
  onEvent: (event, payload) => {
    if (event === "chat") {
      chatController?.handleEvent(payload);
    }
  },
});

if (chatPanel) {
  chatController = new ChatController(client, chatPanel);
}

if (settingsPanel) {
  settingsController = new SettingsController(client, settingsPanel);
  settingsController.setConnected(false);
}

client.start();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    client.stop();
  });
}

const CHAT_FAB_ACTIVE_CLASS = "fab-item--active";

function syncChatFabActive(): void {
  if (!chatFab || !chatWindow) {
    return;
  }
  const open = chatWindow.isOpen;
  chatFab.classList.toggle(CHAT_FAB_ACTIVE_CLASS, open);
  chatFab.setAttribute("aria-pressed", open ? "true" : "false");
}

if (chatFab && chatWindow) {
  chatFab.setAttribute("aria-pressed", "false");

  chatFab.addEventListener("click", () => {
    if (chatWindow.isOpen) {
      chatWindow.close();
    } else {
      chatWindow.open();
    }
    syncChatFabActive();
  });

  chatWindow.addEventListener("room-window-close", () => {
    syncChatFabActive();
  });

  chatWindow.addEventListener("room-window-open", () => {
    syncChatFabActive();
    chatPanel?.scrollToBottom();
  });

  syncChatFabActive();
}

function syncSettingsFabActive(): void {
  if (!settingsFab || !settingsWindow) {
    return;
  }
  const open = settingsWindow.isOpen;
  settingsFab.classList.toggle(CHAT_FAB_ACTIVE_CLASS, open);
  settingsFab.setAttribute("aria-pressed", open ? "true" : "false");
}

if (settingsFab && settingsWindow) {
  settingsFab.setAttribute("aria-pressed", "false");

  settingsFab.addEventListener("click", () => {
    if (settingsWindow.isOpen) {
      settingsWindow.close();
    } else {
      settingsWindow.open();
    }
    syncSettingsFabActive();
  });

  settingsWindow.addEventListener("room-window-close", () => {
    syncSettingsFabActive();
  });

  settingsWindow.addEventListener("room-window-open", () => {
    syncSettingsFabActive();
    void settingsController?.refresh();
  });

  syncSettingsFabActive();
}
