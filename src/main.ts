import "./style.css";
import "./components/room-window";
import "./components/chat-panel";
import { GatewayClient, GatewayRequestError } from "./gateway/client";
import type {
  ChatEventPayload,
  ChatHistoryResponse,
  ChatSendResponse,
} from "./gateway/types";
import type { ChatPanel } from "./components/chat-panel";
import type { RoomWindow } from "./components/room-window";

const DEFAULT_GATEWAY_URL = "ws://localhost:18789";
const SESSION_KEY = "main";

const statusShell = document.querySelector<HTMLElement>("#status-shell");
const statusLabel = document.querySelector<HTMLElement>("#status-label");
const chatFab = document.querySelector<HTMLButtonElement>("#chat-fab");
const chatWindow = document.querySelector<RoomWindow>("#chat-window");
const chatPanel = document.querySelector<ChatPanel>("chat-panel");

/** matches chat.send idempotencyKey for streaming events */
let currentRunId: string | null = null;
/** last delta text for final turn when payload.message is empty */
let lastStreamText = "";

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

function extractTextFromMessage(message: unknown): string | undefined {
  if (!message || typeof message !== "object") {
    return undefined;
  }
  const m = message as Record<string, unknown>;
  if (typeof m.text === "string" && m.text.trim()) {
    return m.text;
  }
  if (typeof m.content === "string") {
    return m.content;
  }
  if (Array.isArray(m.content)) {
    const parts: string[] = [];
    for (const block of m.content) {
      if (block && typeof block === "object") {
        const b = block as { type?: unknown; text?: unknown };
        if (b.type === "text" && typeof b.text === "string") {
          parts.push(b.text);
        }
      }
    }
    if (parts.length > 0) {
      return parts.join("\n");
    }
  }
  return undefined;
}

function isSilentReply(text: string): boolean {
  return /^\s*NO_REPLY\s*$/i.test(text);
}

/** strip gateway-injected system context and timestamp wrappers from user messages */
function cleanUserMessage(text: string): string {
  const lines = text.split("\n");
  const cleaned = lines.filter((l) => !l.trimStart().startsWith("System:"));
  let result = cleaned.join("\n").trim();
  result = result.replace(/^\[.*?UTC\]\s*/i, "");
  return result.trim();
}

async function loadChatHistory(): Promise<void> {
  if (!chatPanel) {
    return;
  }
  try {
    const res = await client.request<ChatHistoryResponse>("chat.history", {
      sessionKey: SESSION_KEY,
      limit: 100,
    });
    chatPanel.clearMessages();
    const messages = Array.isArray(res.messages) ? res.messages : [];
    for (const msg of messages) {
      const roleRaw =
        msg && typeof msg === "object" && typeof (msg as { role?: string }).role === "string"
          ? (msg as { role: string }).role.toLowerCase()
          : "";
      const text = extractTextFromMessage(msg);
      if (!text?.trim() || isSilentReply(text)) {
        continue;
      }
      if (roleRaw === "user") {
        const cleaned = cleanUserMessage(text);
        if (!cleaned) {
          continue;
        }
        chatPanel.addMessage("user", cleaned);
      } else if (roleRaw === "assistant") {
        chatPanel.addMessage("agent", text);
      } else {
        continue;
      }
    }
  } catch (e) {
    console.warn("chat.history failed", e);
  }
}

function handleChatEvent(payload: unknown): void {
  if (!chatPanel) {
    return;
  }
  if (!payload || typeof payload !== "object") {
    return;
  }
  const p = payload as ChatEventPayload;
  if (p.sessionKey !== SESSION_KEY && !p.sessionKey?.endsWith(`:${SESSION_KEY}`)) {
    return;
  }

  if (p.state === "delta") {
    if (currentRunId && p.runId !== currentRunId) {
      return;
    }
    chatPanel.hideTyping();
    const text = extractTextFromMessage(p.message);
    if (text && !isSilentReply(text)) {
      lastStreamText = text;
      chatPanel.updateStream(text);
    }
    return;
  }

  if (p.state === "final") {
    chatPanel.hideTyping();
    if (currentRunId && p.runId !== currentRunId) {
      const text = extractTextFromMessage(p.message);
      if (text?.trim() && !isSilentReply(text)) {
        chatPanel.addMessage("agent", text);
      }
      return;
    }
    const fromFinal = extractTextFromMessage(p.message);
    const text =
      fromFinal?.trim() && !isSilentReply(fromFinal) ? fromFinal : lastStreamText.trim();
    chatPanel.clearStream();
    if (text) {
      chatPanel.addMessage("agent", text);
    }
    lastStreamText = "";
    currentRunId = null;
    return;
  }

  if (p.state === "error") {
    chatPanel.hideTyping();
    chatPanel.clearStream();
    lastStreamText = "";
    chatPanel.addMessage("agent", p.errorMessage ?? "Chat error");
    currentRunId = null;
    return;
  }

  if (p.state === "aborted") {
    chatPanel.hideTyping();
    const fromMsg = extractTextFromMessage(p.message);
    const text =
      fromMsg?.trim() && !isSilentReply(fromMsg) ? fromMsg : lastStreamText.trim();
    chatPanel.clearStream();
    if (text) {
      chatPanel.addMessage("agent", text);
    }
    lastStreamText = "";
    currentRunId = null;
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
  onHello: () => {
    void loadChatHistory();
  },
  onEvent: (event, payload) => {
    if (event === "chat") {
      handleChatEvent(payload);
    }
  },
});

if (chatPanel) {
  chatPanel.onSend = async (text: string) => {
    const runId = crypto.randomUUID();
    lastStreamText = "";
    chatPanel.addMessage("user", text);
    chatPanel.showTyping();
    chatPanel.setSending(true);
    currentRunId = runId;
    try {
      await client.request<ChatSendResponse>("chat.send", {
        sessionKey: SESSION_KEY,
        message: text,
        deliver: false,
        idempotencyKey: runId,
      });
    } catch (e) {
      currentRunId = null;
      lastStreamText = "";
      chatPanel.hideTyping();
      chatPanel.clearStream();
      const msg =
        e instanceof GatewayRequestError
          ? `${e.gatewayCode}: ${e.message}`
          : e instanceof Error
            ? e.message
            : String(e);
      chatPanel.addMessage("agent", `Error: ${msg}`);
    } finally {
      chatPanel.setSending(false);
    }
  };
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
