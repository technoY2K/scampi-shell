import { GatewayClient, GatewayRequestError } from "../../gateway/client";
import type { ChatEventPayload, ChatHistoryResponse, ChatSendResponse } from "../../gateway/types";
import type { ChatPanel } from "./panel";

const SESSION_KEY = "main";

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

function cleanUserMessage(text: string): string {
  const lines = text.split("\n");
  const cleaned = lines.filter((l) => !l.trimStart().startsWith("System:"));
  let result = cleaned.join("\n").trim();
  result = result.replace(/^\[.*?UTC\]\s*/i, "");
  return result.trim();
}

export class ChatController {
  private readonly client: GatewayClient;
  private readonly panel: ChatPanel;

  private currentRunId: string | null = null;
  private lastStreamText = "";
  private pendingSessionReset = false;

  constructor(client: GatewayClient, panel: ChatPanel) {
    this.client = client;
    this.panel = panel;

    this.panel.onSend = (text: string) => this.send(text);
  }

  async loadHistory(): Promise<void> {
    try {
      const res = await this.client.request<ChatHistoryResponse>("chat.history", {
        sessionKey: SESSION_KEY,
        limit: 100,
      });
      this.panel.clearMessages();
      const messages = Array.isArray(res.messages) ? res.messages : [];

      const firstTs = messages.find(
        (m) =>
          m &&
          typeof m === "object" &&
          typeof (m as { timestamp?: number }).timestamp === "number",
      ) as { timestamp?: number } | undefined;
      const date = firstTs?.timestamp ? new Date(firstTs.timestamp) : new Date();
      const formatted = date.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
      this.panel.addSessionHeader(`New Session Started ${formatted}`);

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
          const senderLabel =
            msg && typeof msg === "object"
              ? (msg as { senderLabel?: string }).senderLabel
              : undefined;
          if (!senderLabel) {
            continue;
          }
          const cleaned = cleanUserMessage(text);
          if (!cleaned) {
            continue;
          }
          this.panel.addMessage("user", cleaned);
        } else if (roleRaw === "assistant") {
          this.panel.addMessage("agent", text);
        }
      }
    } catch (e) {
      console.warn("chat.history failed", e);
    }
  }

  handleEvent(payload: unknown): void {
    if (!payload || typeof payload !== "object") {
      return;
    }
    const p = payload as ChatEventPayload;
    if (p.sessionKey !== SESSION_KEY && !p.sessionKey?.endsWith(`:${SESSION_KEY}`)) {
      return;
    }

    if (p.state === "delta") {
      if (this.currentRunId && p.runId !== this.currentRunId) {
        return;
      }
      this.panel.hideTyping();
      const text = extractTextFromMessage(p.message);
      if (text && !isSilentReply(text)) {
        this.lastStreamText = text;
        this.panel.updateStream(text);
      }
      return;
    }

    if (p.state === "final") {
      this.panel.hideTyping();
      if (this.currentRunId && p.runId !== this.currentRunId) {
        const text = extractTextFromMessage(p.message);
        if (text?.trim() && !isSilentReply(text)) {
          this.panel.addMessage("agent", text);
        }
        return;
      }
      const fromFinal = extractTextFromMessage(p.message);
      const text =
        fromFinal?.trim() && !isSilentReply(fromFinal) ? fromFinal : this.lastStreamText.trim();
      this.panel.clearStream();
      if (this.pendingSessionReset) {
        this.pendingSessionReset = false;
        this.lastStreamText = "";
        this.currentRunId = null;
        void this.loadHistory();
        return;
      }
      if (text) {
        this.panel.addMessage("agent", text);
      }
      this.lastStreamText = "";
      this.currentRunId = null;
      return;
    }

    if (p.state === "error") {
      this.panel.hideTyping();
      this.panel.clearStream();
      this.lastStreamText = "";
      if (this.pendingSessionReset) {
        this.pendingSessionReset = false;
        void this.loadHistory();
      } else {
        this.panel.addMessage("agent", p.errorMessage ?? "Chat error");
      }
      this.currentRunId = null;
      return;
    }

    if (p.state === "aborted") {
      this.panel.hideTyping();
      if (this.pendingSessionReset) {
        this.pendingSessionReset = false;
        this.lastStreamText = "";
        this.currentRunId = null;
        void this.loadHistory();
        return;
      }
      const fromMsg = extractTextFromMessage(p.message);
      const text =
        fromMsg?.trim() && !isSilentReply(fromMsg) ? fromMsg : this.lastStreamText.trim();
      this.panel.clearStream();
      if (text) {
        this.panel.addMessage("agent", text);
      }
      this.lastStreamText = "";
      this.currentRunId = null;
    }
  }

  private async send(text: string): Promise<void> {
    const isNewSession = /^\/(new|reset)\b/i.test(text.trim());
    const runId = crypto.randomUUID();
    this.lastStreamText = "";
    if (isNewSession) {
      this.pendingSessionReset = true;
    } else {
      this.panel.addMessage("user", text);
    }
    this.panel.showTyping();
    this.panel.setSending(true);
    this.currentRunId = runId;
    try {
      await this.client.request<ChatSendResponse>("chat.send", {
        sessionKey: SESSION_KEY,
        message: text,
        deliver: false,
        idempotencyKey: runId,
      });
    } catch (e) {
      this.currentRunId = null;
      this.lastStreamText = "";
      this.pendingSessionReset = false;
      this.panel.hideTyping();
      this.panel.clearStream();
      const msg =
        e instanceof GatewayRequestError
          ? `${e.gatewayCode}: ${e.message}`
          : e instanceof Error
            ? e.message
            : String(e);
      this.panel.addMessage("agent", `Error: ${msg}`);
    } finally {
      this.panel.setSending(false);
    }
  }
}
