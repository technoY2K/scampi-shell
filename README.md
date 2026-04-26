# Room Zero

A desktop client for your [OpenClaw](https://docs.openclaw.ai/) gateway. Connects over WebSocket and gives you a UI for chat, settings, and schedules — without needing the terminal.

> **Note:** the app name is a placeholder and will be updated soon.

## Requirements

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)
- A running [OpenClaw](https://docs.openclaw.ai/) gateway (`openclaw gateway run`)

## Setup

**1. Clone and install**

```bash
git clone <repo-url>
cd zaibatsu-systems
pnpm install
```

**2. Configure**

```bash
cp .env.example .env
```

Open `.env` and fill in your values:

- `VITE_GATEWAY_URL` — WebSocket URL of your gateway (default `ws://localhost:18789`)
- `VITE_GATEWAY_TOKEN` — your gateway token, get it with:
  ```bash
  openclaw config get gateway.token
  ```

**3. Allow the app origin in OpenClaw**

On the machine running the gateway, add `http://localhost:5173` to the allowed origins:

```bash
openclaw config set gateway.controlUi.allowedOrigins '["http://localhost:5173"]'
```

Then restart the gateway.

**4. Run**

```bash
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

**5. Approve the device**

On first connect, OpenClaw will show a device approval prompt. Approve it via the OpenClaw UI or:

```bash
openclaw approvals list
openclaw approvals approve <device-id>
```

After that the app connects automatically on every launch.

## Remote gateway

If your gateway is on another machine, forward the port over SSH before running the app:

```bash
ssh -L 18789:localhost:18789 user@your-server
```

Then set `VITE_GATEWAY_URL=ws://localhost:18789` in `.env` as normal.

## Build

```bash
pnpm build
```

Output goes to `dist/`.
