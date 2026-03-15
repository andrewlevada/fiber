# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Design Goals

1. **Single control flow** — users write one `src/app.ts`, everything works via
   async/await
2. **No message passing** — developers never touch `chrome.runtime.sendMessage`
3. **Overlay-first UI** — no popups, UI lives inside the page via Shadow DOM
4. **Lit as base framework** — templates use lit-html
5. **Zero config** — Vite plugin handles all wiring

## Commands

```bash
pnpm build          # Compile TypeScript to dist/
pnpm typecheck      # Type-check without emitting

# E2E tests (Playwright + Chrome)
pnpm test:e2e                    # Run all tests
node e2e/run-tests.js --list     # List available tests
node e2e/run-tests.js 1 2        # Run specific tests by number
```

## Architecture

Fiber is a Chrome extension framework that hides message passing behind a
single-program abstraction. Users write one `src/app.ts` file, and the Vite
plugin generates everything else.

### Build Pipeline

```
User's src/app.ts
       │
       ▼
┌──────────────────────────────────────────────────┐
│  Vite Plugin (src/vite/plugin.ts)                │
│  - Dev: esbuild watch → dist/{content,background}.js
│  - Prod: Rollup + esbuild post-process           │
│  - Generates manifest.json from plugin options   │
└──────────────────────────────────────────────────┘
       │
       ▼
 dist/content.js    dist/background.js    dist/manifest.json
```

### Runtime Architecture

Content script and background service worker communicate via RPC. The `ext`
proxy builds method paths and forwards calls:

```
Content Script                         Background Service Worker
┌─────────────────────┐               ┌─────────────────────────┐
│ ext.tabs.query(...) │  ───RPC───▶  │ chrome.tabs.query(...)  │
│ ext.fetch(url)      │  ───RPC───▶  │ fetch(url) + cache body │
│ overlay.attach()    │               │                         │
└─────────────────────┘               └─────────────────────────┘
```

- **ext proxy** (`runtime/ext.ts`): Recursive Proxy that converts property
  access into RPC calls. `ext.tabs.query({})` becomes
  `rpc.call("tabs.query", [{}])`.
- **RPC layer** (`runtime/rpc.ts`): `createRpcClient` (content) /
  `createRpcServer` (background). Uses `chrome.runtime.sendMessage` with 30s
  timeout.
- **Fetch proxy** (`runtime/ext-fetch.ts` + `background.ts`): Two-phase
  fetch—background caches Response, content script reads body via separate RPC
  call. 60s TTL, single-consume.
- **Overlay** (`runtime/overlay.ts`): Shadow DOM container for Lit templates.
  Uses `pointer-events: none` on host, `auto` on children.
- **HMR** (`runtime/hmr.ts`): WebSocket to Vite dev server. On update: reset
  overlay, ask background to re-inject content script via
  `chrome.scripting.executeScript`.

### Package Exports

```
fiber-extension           → ext, overlay (main public API)
fiber-extension/vite      → fiberExtension plugin
fiber-extension/runtime/* → Individual runtime modules
```

## Testing

E2E tests use Playwright with a real Chrome instance. The test fixture
(`e2e/fixtures.ts`) builds and loads a test extension, then provides helpers to
interact with it.
