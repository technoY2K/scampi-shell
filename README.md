# Scampi Shell

A native desktop app for your [OpenClaw](https://docs.openclaw.ai/) gateway. Connects over WebSocket and gives you a UI for chat, settings, and schedules — without needing the terminal.

Built with Vite + vanilla TypeScript on the frontend and [Tauri v2](https://tauri.app/) for the native shell. Configuration and device identity are stored natively (OS Keychain + app data directory) when running as a desktop app. The browser dev path works unchanged via `.env`.

## Philosophy

This project is intentionally built without a UI framework. Here's why:

**AI knows the platform natively.** LLMs have deep knowledge of browser APIs, the DOM, CSS, and standard JavaScript. When you stay close to the platform, AI assistance is most accurate and most useful — no framework-specific abstractions to work around, no version mismatches, no outdated training data for a library that changed its API last month.

**Fewer dependencies means a smaller attack surface.** Every third-party package is a potential supply chain risk. A framework brings its own dependency tree, its own vulnerabilities, and its own update cadence. Vanilla code has none of that. What you ship is what you wrote.

**The platform is powerful enough.** Modern browsers support CSS custom properties, grid, container queries, animations, WebSockets, Web Crypto, IndexedDB, and more — without a single npm install. The gap between "what a framework gives you" and "what the browser already does" has closed significantly.

**Lightweight by default.** No virtual DOM, no reconciler, no hydration overhead. The app starts fast, runs fast, and stays fast without any optimization work. There is nothing to optimize away.

**Tauri amplifies all of this.** When you wrap a vanilla web app in Tauri, the result is a native binary with no bundled browser engine, no Node runtime, and no Electron overhead. The smaller and more dependency-free the frontend, the smaller and more auditable the final app. Cross-platform support comes from Tauri's Rust layer — not from frontend abstractions — so the web code stays clean and the native behavior stays correct on each platform.

## Requirements

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)
- [Rust](https://rustup.rs/) (stable, 1.77.2+) — required for Tauri builds
- A running [OpenClaw](https://docs.openclaw.ai/) gateway (`openclaw gateway run`)

## Development

### Browser dev (fastest iteration)

```bash
pnpm install
cp .env.example .env   # fill in VITE_GATEWAY_URL and VITE_GATEWAY_TOKEN
pnpm dev               # http://localhost:5173
```

The `.env` file is only used by the browser dev path. The Tauri app persists its own config and does not read `.env` at runtime.

You'll also need to allow `localhost:5173` as an origin on the gateway host:

```bash
openclaw config set gateway.controlUi.allowedOrigins '["http://localhost:5173"]'
```

Then restart the gateway.

### Native app dev

```bash
pnpm tauri dev
```

On first launch, a setup dialog asks for your gateway URL and token. These are saved to the Tauri app data directory (`config.json` via `tauri-plugin-store`) and reused on every subsequent launch.

Device identity (Ed25519 keypair) is generated on first connect and stored in the OS Keychain — macOS Keychain Access, Windows Credential Manager, or the Linux Secret Service.

### Approve the device

On first connect (both browser and native), OpenClaw will show a device approval prompt. Approve it via the OpenClaw UI or:

```bash
openclaw approvals list
openclaw approvals approve <device-id>
```

After approval the app connects automatically on every launch.

## Build

### Web only (Vite)

```bash
pnpm build
```

Output goes to `dist/`.

### Native app (Tauri)

```bash
pnpm tauri build
```

Produces a signed installer for the current platform in `src-tauri/target/release/bundle/`. On macOS this is a `.dmg`; drag the `.app` to `/Applications` to install.

> **Note:** `tauri build` produces an unsigned binary by default in local dev. Code signing requires Apple Developer credentials configured in `tauri.conf.json`.

## Remote gateway

If your gateway is on another machine, forward the port over SSH before running the app:

```bash
ssh -L 18789:localhost:18789 user@your-server
```

For browser dev, set `VITE_GATEWAY_URL=ws://localhost:18789` in `.env`. For the native app, enter `ws://localhost:18789` in the setup dialog on first launch.
