# Fiber Extension — Implementation Plan

## Architecture Overview

The framework creates the illusion of a single program by hiding the extension's multi-context reality (background/content scripts). Under the hood:

```
┌─────────────────────────────────────────────────────────┐
│                    User's app.ts                        │
│         (runs in content script context)                │
└─────────────────────┬───────────────────────────────────┘
                      │ uses
          ┌───────────┼───────────┐
          │           │           │
          ▼           ▼           ▼
┌──────────────┐ ┌──────────┐ ┌──────────┐
│  ext proxy   │ │ overlay  │ │   HMR    │
│ (RPC client) │ │(Shadow)  │ │ (dev)    │
└──────┬───────┘ └──────────┘ └────┬─────┘
       │ chrome messages           │ WebSocket
       ▼                           ▼
┌──────────────────────┐  ┌───────────────────┐
│  Background Worker   │  │  Vite Dev Server  │
│ (Chrome APIs, fetch) │  │  (serves updates) │
└──────────────────────┘  └───────────────────┘
```

---

## Module Breakdown

### 1. `src/runtime/rpc.ts` — Message Transport

Hidden RPC layer that the user never sees.

```typescript
// Types
interface RpcRequest {
  id: string;
  method: string;      // e.g., "tabs.query"
  args: unknown[];
}

interface RpcResponse {
  id: string;
  result?: unknown;
  error?: { message: string; stack?: string };
}

const RPC_TIMEOUT_MS = 30_000;

// Content script side
export function createRpcClient(): RpcClient {
  return {
    call(method: string, args: unknown[]): Promise<unknown> {
      const id = crypto.randomUUID();

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`RPC timeout: ${method} did not respond within ${RPC_TIMEOUT_MS}ms`));
        }, RPC_TIMEOUT_MS);

        chrome.runtime.sendMessage({ id, method, args }, (response: RpcResponse) => {
          clearTimeout(timeout);

          if (chrome.runtime.lastError) {
            reject(new Error(`RPC failed: ${chrome.runtime.lastError.message}`));
            return;
          }

          if (response.error) {
            const err = new Error(response.error.message);
            err.stack = response.error.stack;
            reject(err);
          } else {
            resolve(response.result);
          }
        });
      });
    }
  };
}

// Background side
export function createRpcServer(handlers: Record<string, Function>) {
  chrome.runtime.onMessage.addListener((msg: RpcRequest, sender, sendResponse) => {
    // Validate sender is from this extension — fail fast with clear error
    if (sender.id !== chrome.runtime.id) {
      sendResponse({ id: msg.id, error: { message: 'RPC rejected: invalid sender' } });
      return true;
    }

    const handler = resolveHandler(handlers, msg.method);
    if (!handler) {
      sendResponse({ id: msg.id, error: { message: `Unknown method: ${msg.method}` } });
      return true;
    }

    Promise.resolve(handler(...msg.args))
      .then(result => sendResponse({ id: msg.id, result }))
      .catch(err => sendResponse({ id: msg.id, error: { message: err.message, stack: err.stack } }));
    return true; // async response
  });
}
```

---

### 2. `src/runtime/ext.ts` — Chrome API Proxy

Exposes `ext` object that proxies all Chrome APIs through RPC.

```typescript
import { createRpcClient } from './rpc';
import { createFetchProxy } from './ext-fetch';

const rpc = createRpcClient();

// Recursive proxy that builds method paths
function createApiProxy(path: string[] = []): unknown {
  return new Proxy(() => {}, {
    get(_, prop: string) {
      // Special case: ext.fetch returns a fetch-like function
      if (path.length === 0 && prop === 'fetch') {
        return createFetchProxy(rpc);
      }
      return createApiProxy([...path, prop]);
    },
    apply(_, __, args) {
      const method = path.join('.');
      return rpc.call(method, args);
    }
  });
}

export const ext = createApiProxy() as ExtApi;
```

**Type definitions** (`src/types/ext.d.ts`):
- Mirror Chrome API types but ensure all methods return `Promise`
- Add `ext.fetch` signature matching standard `fetch` (returns `Promise<Response>`-like object)

---

### 3. `src/runtime/background.ts` — Background Handler

Generated/bundled background script that handles RPC calls.

```typescript
import { createRpcServer } from './rpc';

// Cache for pending fetch responses
// NOTE: Service workers can terminate at any time (MV3). If this happens,
// the cache is lost and pending responses will error with "Response expired".
// This is acceptable for the use case — requests are typically short-lived.
const fetchCache = new Map<string, Response>();
const consumedIds = new Set<string>(); // Track consumed response IDs

// Auto-expire responses after 60s to prevent memory leaks
const FETCH_CACHE_TTL_MS = 60_000;

// Resolve nested handler paths like "tabs.query" -> handlers.tabs.query
function resolveHandler(handlers: Record<string, unknown>, method: string): Function | undefined {
  const parts = method.split('.');
  let current: unknown = handlers;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'function' ? current : undefined;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function blobToBase64(blob: Blob): Promise<string> {
  return arrayBufferToBase64(await blob.arrayBuffer());
}

const handlers = {
  // Chrome API passthrough
  tabs: chrome.tabs,
  storage: chrome.storage,
  // ... other namespaces

  // Full fetch proxy — returns serialized response handle
  async fetch(url: string, init?: RequestInit) {
    const res = await fetch(url, init);
    const id = crypto.randomUUID();
    fetchCache.set(id, res);

    // Auto-cleanup after TTL
    setTimeout(() => fetchCache.delete(id), FETCH_CACHE_TTL_MS);

    return {
      id,
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers),
    };
  },

  // Body reads — can only be called ONCE per response (body is consumed)
  async fetchBody(id: string, mode: 'text' | 'json' | 'arrayBuffer' | 'blob') {
    if (consumedIds.has(id)) {
      throw new Error('Response body already consumed. Body can only be read once.');
    }
    const res = fetchCache.get(id);
    if (!res) {
      throw new Error('Response expired (60s TTL) or service worker restarted.');
    }

    fetchCache.delete(id);
    consumedIds.add(id);
    setTimeout(() => consumedIds.delete(id), FETCH_CACHE_TTL_MS); // Cleanup
    const data = await res[mode]();

    // ArrayBuffer/Blob need base64 encoding for message passing
    if (mode === 'arrayBuffer') return { base64: arrayBufferToBase64(data) };
    if (mode === 'blob') return { base64: await blobToBase64(data), type: data.type };
    return data;
  }
};

createRpcServer(handlers);
```

On content script side, `ext.fetch` returns a proxy `Response` that calls `fetchBody` RPC on `.text()`, `.json()`, etc.

**Limitations:**
- Response body can only be read once (standard `fetch` behavior)
- If service worker terminates mid-request, response will error

---

### 4. `src/runtime/overlay.ts` — Overlay UI System

Manages shadow DOM container for UI. Throws if `attach()` is called twice.

```typescript
import { render, TemplateResult } from 'lit';

let container: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let attached = false;

function createContainer(): ShadowRoot {
  container = document.createElement('fiber-overlay');
  shadowRoot = container.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    :host {
      position: fixed;
      z-index: 2147483647;
      top: 0; right: 0; bottom: 0; left: 0;
      pointer-events: none;
    }
    :host > * { pointer-events: auto; }
  `;
  shadowRoot.appendChild(style);
  document.body.appendChild(container);
  return shadowRoot;
}

export const overlay = {
  attach(template: TemplateResult) {
    if (attached) {
      throw new Error('overlay.attach() can only be called once. Use overlay.render() to update content.');
    }
    attached = true;
    const root = createContainer();
    render(template, root);
  },

  render(template: TemplateResult) {
    if (!shadowRoot) {
      throw new Error('Call overlay.attach() before overlay.render()');
    }
    render(template, shadowRoot);
  },

  detach() {
    container?.remove();
    container = null;
    shadowRoot = null;
    attached = false;
  }
};

// Internal: called by HMR to reset state
export function __hmrReset() {
  overlay.detach();
}
```

---

### 5. `src/runtime/hmr.ts` — Hot Module Replacement (Dev Only)

Enables live reload during development.

**Important:** Content scripts cannot dynamically import from external URLs due to browser security restrictions. Instead, HMR works by:
1. Watching for file changes via WebSocket
2. Triggering a full content script reload via `chrome.scripting.executeScript`

```typescript
// === Content script side (hmr-client.ts) ===
import { __hmrReset as resetOverlay } from './overlay';

export function initHmr(serverUrl: string) {
  const ws = new WebSocket(serverUrl);

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type !== 'update') return;

    console.log('[fiber] Update detected, reloading...');

    // 1. Reset overlay (triggers Lit disconnectedCallback for cleanup)
    resetOverlay();

    // 2. Request background to re-inject content script
    chrome.runtime.sendMessage({ type: 'fiber:hmr-reload' });
  };

  ws.onerror = () => console.warn('[fiber] HMR WebSocket error — live reload unavailable');
}

// === Background side (in background.ts, after createRpcServer) ===
// Only included in dev builds via virtual module conditional import
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'fiber:hmr-reload' && sender.tab?.id) {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      files: ['content.js'],
    });
  }
});
```

**How it works:**
1. Dev build runs with `--watch`, outputting to `dist/`
2. Content script connects to Vite dev server via WebSocket (for change notifications only)
3. On file change, content script detaches overlay (Lit components run `disconnectedCallback`)
4. Background re-injects fresh `content.js`

Cleanup is automatic via Lit's component lifecycle — no developer API needed.

---

### 6. `src/vite/plugin.ts` — Vite Plugin

The build orchestrator.

**Dev mode architecture:**
- Chrome loads extensions from disk, not from a dev server
- We use `vite build --watch` (not `vite serve`) to continuously rebuild to `dist/`
- A separate Vite dev server runs only for WebSocket HMR notifications
- Content script connects to this WebSocket to detect changes, then reloads

```typescript
import type { Plugin, ResolvedConfig } from 'vite';
import path from 'path';

interface FiberOptions {
  manifest: Partial<chrome.runtime.ManifestV3>;
}

export default function fiberExtension(options: FiberOptions): Plugin {
  let isDev = false;
  let devServerPort = 5173; // Default Vite port
  let resolvedConfig: ResolvedConfig;

  return {
    name: 'fiber-extension',

    config(config, { command }) {
      // Dev uses `FIBER_DEV=true vite build` (not `vite serve`) since Chrome loads from disk
      isDev = process.env.FIBER_DEV === 'true';
      return {
        build: {
          rollupOptions: {
            input: {
              content: 'virtual:fiber/content',
              background: 'virtual:fiber/background',
            },
            output: { entryFileNames: '[name].js' }
          },
          outDir: 'dist',
          // Enable watch mode in dev
          watch: isDev ? {} : null,
        }
      };
    },

    configResolved(config) {
      resolvedConfig = config;
      devServerPort = config.server.port ?? 5173;
    },

    resolveId(id) {
      if (id.startsWith('virtual:fiber/')) return id;
      if (id === 'fiber-extension') return 'virtual:fiber/runtime';
    },

    load(id) {
      if (id === 'virtual:fiber/content') {
        const hmrInit = isDev
          ? `import { initHmr } from 'fiber-extension/runtime/hmr';\ninitHmr('ws://localhost:${devServerPort}');`
          : '';
        // Use path.resolve to get absolute path to user's app.ts
        return `${hmrInit}\nimport '${path.resolve('src/app.ts').replace(/\\/g, '/')}';`;
      }
      if (id === 'virtual:fiber/background') {
        // HMR reload handler is only included in dev builds
        const hmrHandler = isDev
          ? `\nchrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'fiber:hmr-reload' && sender.tab?.id) {
    chrome.scripting.executeScript({ target: { tabId: sender.tab.id }, files: ['content.js'] });
  }
});`
          : '';
        return `import 'fiber-extension/runtime/background';${hmrHandler}`;
      }
      if (id === 'virtual:fiber/runtime') {
        // Use package paths, not relative paths (virtual modules can't resolve relative)
        return [
          `export { ext } from 'fiber-extension/runtime/ext';`,
          `export { overlay } from 'fiber-extension/runtime/overlay';`,
        ].join('\n');
      }
    },

    generateBundle() {
      const manifest = buildManifest(options.manifest, isDev);
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: JSON.stringify(manifest, null, 2),
      });
    },

    // Provide helpful error messages
    buildStart() {
      if (!options.manifest) {
        this.warn('No manifest options provided. Using defaults.');
      }
    },

    buildEnd(error) {
      if (error) {
        console.error('[fiber] Build failed:', error.message);
      } else if (isDev) {
        console.log('[fiber] Build complete. Load dist/ folder in chrome://extensions');
        console.log('[fiber] Watching for changes...');
      }
    }
  };
}

function buildManifest(partial: Partial<chrome.runtime.ManifestV3>, isDev: boolean) {
  const hostPermissions = partial.host_permissions ?? [];
  const contentMatches = partial.content_scripts?.[0]?.matches ?? hostPermissions;

  // Dev mode needs scripting permission for HMR reload
  const permissions = [...(partial.permissions ?? [])];
  if (isDev && !permissions.includes('scripting')) {
    permissions.push('scripting');
  }

  return {
    manifest_version: 3,
    name: partial.name ?? 'Fiber Extension',
    version: partial.version ?? '1.0.0',
    permissions,
    host_permissions: hostPermissions,
    background: {
      service_worker: 'background.js',
      type: 'module',
    },
    content_scripts: [{
      matches: contentMatches.length > 0 ? contentMatches : ['<all_urls>'],
      js: ['content.js'],
      run_at: 'document_idle',
    }],
    // NOTE: No CSP override needed. Content scripts make WebSocket connections,
    // which are subject to the host page's CSP, not extension_pages CSP.
    ...partial,
  };
}
```

---

## Package Structure

```
fiber-extension/
├── src/
│   ├── runtime/
│   │   ├── rpc.ts           # RPC transport layer
│   │   ├── ext.ts           # Chrome API proxy (ext object)
│   │   ├── ext-fetch.ts     # Full fetch proxy with streaming
│   │   ├── overlay.ts       # Shadow DOM overlay system
│   │   ├── hmr.ts           # HMR client (dev only, tree-shaken in prod)
│   │   └── background.ts    # Background script + HMR reload handler
│   ├── vite/
│   │   └── plugin.ts        # Vite plugin
│   └── index.ts             # Main exports: { ext, overlay }
├── types/
│   └── ext.d.ts             # TypeScript definitions
├── package.json
└── tsconfig.json
```

**package.json exports:**
```json
{
  "name": "fiber-extension",
  "exports": {
    ".": "./dist/index.js",
    "./vite": "./dist/vite/plugin.js",
    "./runtime/ext": "./dist/runtime/ext.js",
    "./runtime/overlay": "./dist/runtime/overlay.js",
    "./runtime/hmr": "./dist/runtime/hmr.js",
    "./runtime/background": "./dist/runtime/background.js"
  }
}
```

---

## Implementation Phases

### Phase 1: Core RPC & Minimal ext
1. Implement `rpc.ts` — message transport using `sendMessage` callback pattern
2. Implement `ext.ts` — recursive proxy for `tabs`, `storage`
3. Implement `background.ts` — RPC server with sender validation
4. Add `types/ext.d.ts` — typed wrappers for `chrome.tabs`, `chrome.storage`
5. Error handling: 30s timeout, connection failures, sender validation, error serialization with stack traces

### Phase 2: Full Fetch Proxy
1. Implement `ext-fetch.ts` — Response proxy with lazy body reads via `createFetchProxy(rpc)`
2. Background: cache Response objects with 60s TTL auto-cleanup
3. Support `.text()`, `.json()`, `.arrayBuffer()`, `.blob()` with base64 encoding for binary
4. Type definitions for fetch proxy (compatible with standard `fetch` signature)
5. Error handling: response expired, network errors, body already consumed

### Phase 3: Overlay System
1. Implement `overlay.ts` — shadow DOM container
2. `attach()` throws on second call, `render()` for updates
3. `detach()` cleans up, `__hmrReset()` for HMR integration
4. Type definitions for overlay API (`TemplateResult` from Lit)
5. Clear developer error messages for misuse (double attach, render before attach)

### Phase 4: Vite Plugin + HMR
1. Basic plugin that emits manifest + bundles via `vite build`
2. Virtual module resolution with absolute package paths (not relative)
3. Dev mode: `--watch` for rebuild + WebSocket for change notifications
4. Implement `hmr.ts` — WebSocket client, overlay reset, re-inject via `chrome.scripting`
5. Auto-add `scripting` permission in dev manifest
6. CSP adjustments for localhost WebSocket connections
7. Type definitions for plugin options (`FiberOptions`)
8. Error handling: build failures, HMR connection issues, helpful console messages

---

## Design Decisions

1. **Content script injection scope** — Defaults to URLs matching `host_permissions`. User can override via `content_scripts` in manifest config.

2. **ext.fetch** — Returns a proxy Response. Body methods (`.text()`, `.json()`, etc.) trigger RPC to background which holds the actual Response. Binary data (ArrayBuffer, Blob) uses base64 encoding for message passing.
   - **Limitation:** Body can only be read once (standard fetch behavior). Calling `.json()` then `.text()` will error.
   - **Limitation:** Service worker termination loses cached responses.

3. **overlay.attach()** — Throws on second call. Use `overlay.render()` for subsequent updates.

4. **HMR** — Full content script reload (not true HMR) due to content script restrictions:
   - Uses `vite build --watch` to rebuild to `dist/`
   - WebSocket notifies content script of changes
   - On change: detaches overlay (triggers Lit cleanup), re-injects content script
   - Cleanup is automatic via Lit's `disconnectedCallback` — no developer API needed
   - Requires `scripting` permission in dev mode

5. **RPC** — Uses `sendMessage` callback pattern (not `onMessage` listener) with:
   - 30-second timeout to prevent hanging promises
   - Sender validation to reject messages from other extensions (fails fast with error response)
   - Proper error serialization including stack traces

6. **Content script WebSocket limitations** — HMR WebSocket connections from content scripts are subject to the host page's CSP, not the extension's. On pages with restrictive CSPs that block `ws://localhost:*`, HMR will silently fail and fall back to manual reload. This is a browser limitation with no workaround.

---
