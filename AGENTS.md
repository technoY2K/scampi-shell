# Scampi Shell

Lightweight browser client for the [OpenClaw](https://docs.openclaw.ai/) gateway. WebSocket connection + status pill; floating **Chat** and **Settings** windows. **Settings** shows a read-only snapshot of the OpenClaw config via `config.get` (gateway-redacted). Later: more task-oriented panels + canvas iframe for agent-generated HTML.

## Product principles

Scampi Shell is a **translation layer** over the OpenClaw gateway, not a
faithful UI for it. The target user is non-technical and will never open
a terminal. When the API and the user disagree, the user wins.

- **task-oriented, not method-oriented** — organize around user goals, not gateway methods
- **safe by default** — destructive actions confirm and explain; read-first, write-second
- **progressive disclosure** — advanced behavior lives behind "Advanced"; the default path shows the 3 things most users need
- **plain-language errors** — no error codes, scopes, or protocol details in the happy path
- **empty states teach** — first use is the tutorial; each panel explains what it is before it has data
- **translate, don't expose** — `cron` becomes "schedules", `config` becomes "settings", `models.authStatus` becomes "Sign in to Anthropic"

### What Scampi Shell is **not**

- not a debugging tool (that's the CLI / logs)
- not a power-user console (that's the CLI)
- not a faithful mirror of the gateway API (that's the CLI)
- not a replacement for the CLI — a **companion** to it, for a different audience

## Stack

- Vite 8
- TypeScript (strict)
- Vanilla DOM (no framework)

## Commands

```bash
pnpm install
pnpm dev      # http://localhost:5173
pnpm build
pnpm preview
```

## Configuration

Copy `.env.example` to `.env`:

- `VITE_GATEWAY_URL` — WebSocket URL (default `ws://localhost:18789`)
- `VITE_GATEWAY_TOKEN` — gateway auth token from OpenClaw config

Remote gateway via SSH:

```bash
ssh -L 18789:localhost:18789 user@your-server
```

Then set `VITE_GATEWAY_URL=ws://localhost:18789` in `.env`.

### OpenClaw: `origin-mismatch` / `origin not allowed`

Browsers send `Origin: http://localhost:5173` for the WebSocket. OpenClaw checks that against `gateway.controlUi.allowedOrigins` for `webchat` clients.

On the **gateway host**, add the dev origin to `~/.openclaw/openclaw.json` (merge with any existing list), then restart the gateway:

```json
{
  "gateway": {
    "controlUi": {
      "allowedOrigins": ["http://localhost:5173"]
    }
  }
}
```

Or use `openclaw config set` if your CLI exposes these keys. See [Configuration](https://docs.openclaw.ai/configuration).

## UI

- **Status** — fixed top-right pill (`#status-shell`), driven by `GatewayClient` in `main.ts`.
- **FAB dock** — fixed bottom-left (`#fab-dock`); horizontal row (macOS-dock style). **Chat** and **Settings** FABs each toggle their own `<room-window>` (click open / click again or × to close); active window shows green outline (`.fab-item--active`). `aria-pressed` tracks toggle state.
- **`room-window`** — native `<dialog>` (non-modal `.show()`), title bar drag, z-index stacking, close dispatches `room-window-close` (bubbles, composed).
- **`chat-panel`** — message list, textarea + Send; Enter sends, Shift+Enter newline. `addMessage("user" | "agent", text)` for future gateway hooks.
- **`settings-panel`** — read-only settings view: pretty-printed JSON from `config.get`. States: waiting (gateway not ready), loading, error + Retry, loaded. Refresh on window open and after reconnect when the window stays open (`room-window-open` + `onHello` in `main.ts`).

## Project layout

```
index.html
src/
  main.ts                 # gateway client + fab / window wiring
  style.css
  vite-env.d.ts
  components/
    room-window.ts        # <room-window> dialog shell
  features/
    chat/
      panel.ts            # <chat-panel>
      controller.ts
      index.ts
    settings/
      panel.ts            # <settings-panel> read-only config snapshot
      controller.ts
      index.ts
  gateway/
    types.ts
    client.ts
```

## Gateway protocol

OpenClaw uses JSON over WebSocket (not REST or MCP for this path):

1. Server sends an `event` with `event: "connect.challenge"` and a `nonce` when the socket opens.
2. Client sends `{ type: "req", id, method: "connect", params }` with `minProtocol`/`maxProtocol` 3, `client` (`webchat` / `webchat` mode), operator scopes, `caps`, optional `auth.token`.
3. Server responds with `{ type: "res", ok: true, payload }` where `payload.type === "hello-ok"` on success.

Reference implementations:

- `openclaw/ui/src/ui/gateway.ts` — `GatewayBrowserClient`
- `openclaw/src/gateway/protocol/client-info.ts` — client ids and modes

## Conventions

- lowercase comments in new code
- use pnpm for this repo

## Git Workflow

Commits follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification:

```
<type>[optional scope]: <description>

[optional body]
```

### Types used in this project

| type | when to use |
|------|-------------|
| `feat` | new user-facing feature or capability |
| `fix` | bug fix |
| `refactor` | code change that neither fixes a bug nor adds a feature |
| `chore` | tooling, deps, config — no production code change |
| `docs` | changes to AGENTS.md or other documentation only |
| `style` | formatting, whitespace — no logic change |

### Examples

```bash
feat(gateway): add reconnect backoff with jitter
fix(gateway): handle missing nonce in challenge frame
refactor: extract status banner into own module
chore: upgrade vite to v8.1
docs: document origin-mismatch workaround
```

### Rules

- use lowercase for the entire commit message
- keep the description under 72 characters
- use the body to explain *why*, not *what*
- breaking changes get a `!` after the type: `feat(gateway)!: drop protocol v2 support`
