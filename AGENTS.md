# Scampi Shell

Native desktop app + browser client for the [OpenClaw](https://docs.openclaw.ai/) gateway. Tauri v2 shell wraps a Vite + vanilla TypeScript frontend. WebSocket connection + status pill; floating **Chat**, **Settings**, and **Schedules** windows.

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
- Tauri v2 (native shell)
- `@tauri-apps/api` v2 — `invoke` and core Tauri JS bindings
- `@tauri-apps/plugin-store` v2 — persistent key-value config store (app data dir)
- `keyring` v2 (Rust) — OS Keychain for device identity (macOS Keychain, Windows Credential Manager, Linux Secret Service)
- `tauri-plugin-store` v2 (Rust) — Tauri-side store implementation

## Commands

```bash
pnpm install
pnpm dev            # browser dev at http://localhost:5173 (reads .env)
pnpm build          # vite-only build → dist/
pnpm preview
pnpm tauri dev      # native app dev (no .env; uses setup dialog + tauri-plugin-store)
pnpm tauri build    # native installer → src-tauri/target/release/bundle/
```

## Configuration

### Browser dev

Copy `.env.example` to `.env`:

- `VITE_GATEWAY_URL` — WebSocket URL (default `ws://localhost:18789`)
- `VITE_GATEWAY_TOKEN` — gateway auth token from OpenClaw config

`.env` is only used in the browser path. The Tauri runtime ignores it.

Remote gateway via SSH:

```bash
ssh -L 18789:localhost:18789 user@your-server
```

Then set `VITE_GATEWAY_URL=ws://localhost:18789` in `.env`.

### Native app (Tauri)

On first launch the `<setup-panel>` modal prompts for gateway URL and optional token. Values are saved to `config.json` via `tauri-plugin-store` in the Tauri app data directory. No `.env` is read.

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
- **FAB dock** — fixed bottom-left (`#fab-dock`); horizontal row (macOS-dock style). **Chat**, **Settings**, and **Schedules** FABs each toggle their own `<room-window>`; active window shows green outline (`.fab-item--active`). `aria-pressed` tracks toggle state.
- **`room-window`** — native `<dialog>` (non-modal `.show()`), title bar drag, z-index stacking, close dispatches `room-window-close` (bubbles, composed).
- **`chat-panel`** — message list, textarea + Send; Enter sends, Shift+Enter newline. `addMessage("user" | "agent", text)` for future gateway hooks.
- **`settings-panel`** — read-only settings view: pretty-printed JSON from `config.get`. States: waiting (gateway not ready), loading, error + Retry, loaded. Refresh on window open and after reconnect when the window stays open (`room-window-open` + `onHello` in `main.ts`).
- **`setup-panel`** — first-run modal (Tauri only); validates URL (`ws://` or `wss://`), saves config via `saveGatewayConfig`, cannot be dismissed without valid input.

## Project layout

```
index.html
src/
  main.ts                   # async bootstrap, gateway client, fab/window wiring
  style.css
  vite-env.d.ts
  components/
    room-window.ts           # <room-window> dialog shell
  config/
    gateway-config.ts        # loadGatewayConfig / saveGatewayConfig (env or tauri-plugin-store)
  platform/
    runtime.ts               # isTauri() detection
    storage.ts               # KeyValueStore interface + browser/tauri implementations
  gateway/
    types.ts
    client.ts
    device-identity.ts       # Ed25519 keypair load/create (uses getIdentityStore())
    identity-constants.ts    # DEVICE_IDENTITY_STORAGE_KEY shared constant
    local-storage.ts         # getSafeLocalStorage() browser helper
    device-auth-payload.ts
  features/
    chat/
      panel.ts               # <chat-panel>
      controller.ts
      index.ts
    settings/
      panel.ts               # <settings-panel> read-only config snapshot
      controller.ts
      index.ts
    schedules/
      panel.ts               # <schedules-panel>
      controller.ts
      index.ts
    setup/
      panel.ts               # <setup-panel> first-run gateway config modal
      controller.ts
      index.ts
src-tauri/
  Cargo.toml                 # tauri 2, tauri-plugin-store 2, keyring 2
  src/
    lib.rs                   # plugin registration + invoke_handler
    identity.rs              # identity_get / identity_set / identity_remove (Keychain)
    main.rs
  capabilities/
    default.json             # store:default + allow-identity
  permissions/
    allow-identity.toml      # custom permission for keychain commands
```

## Platform / Tauri

### Runtime detection

`isTauri()` in `src/platform/runtime.ts` checks for `__TAURI_INTERNALS__` on `window`. All platform branches key off this single guard — never check for `window.__TAURI__` or similar older globals.

### Storage seam

`KeyValueStore` (`src/platform/storage.ts`) is the single interface for all persistent key-value access:

```
getConfigStore()    → localStorage (browser) | tauri-plugin-store config.json (Tauri)
getIdentityStore()  → localStorage (browser) | OS Keychain via invoke (Tauri)
```

Add new persistent state here; never reach for `localStorage` directly in feature code.

### Device identity + Keychain

The Ed25519 device identity JSON is stored under `DEVICE_IDENTITY_STORAGE_KEY`. In Tauri, reads and writes go through three commands: `identity_get`, `identity_set`, `identity_remove` (declared in `identity.rs`, granted by `allow-identity.toml`).

**macOS note:** `keyring` v2 uses the legacy `SecKeychain` API, which works with unsigned dev builds from `tauri dev`. `keyring` v3 targets the Data Protection Keychain, which silently drops writes from unsigned binaries — do not upgrade to `keyring` v3 without also configuring code signing.

Verify a Keychain entry exists via:

```bash
security find-generic-password -s "systems.zaibatsu.scampi-shell"
```

### First-run setup

In Tauri, `bootstrap()` in `main.ts` calls `loadGatewayConfig()` before starting the gateway client. If no URL is found, it opens `<setup-panel>` and waits for the `setup-complete` event before proceeding. The browser path always has a URL (from `import.meta.env`) so the setup panel is never shown there.

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
feat(tauri): wire plugin-store for gateway config persistence
fix(tauri): downgrade keyring to v2 for unsigned dev builds
```

### Rules

- use lowercase for the entire commit message
- keep the description under 72 characters
- use the body to explain *why*, not *what*
- breaking changes get a `!` after the type: `feat(gateway)!: drop protocol v2 support`
