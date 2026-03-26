# Room Zero

Lightweight browser client for the [OpenClaw](https://docs.openclaw.ai/) gateway. This milestone only establishes a WebSocket connection and shows status on the page. Later: chat UI and canvas iframe for agent-generated HTML visualizations.

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

## Project layout

```
index.html
src/
  main.ts           # boots gateway client, updates #status
  style.css
  vite-env.d.ts     # import.meta.env typing
  gateway/
    types.ts        # protocol frame types
    client.ts       # WebSocket + connect RPC (protocol v3)
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
