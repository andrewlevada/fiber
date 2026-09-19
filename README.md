# Fiber

![Construction tape](/readme-images/wip.png)

In-development chrome extension framework that improves developer experience.
Call Chrome APIs and render UI from the same code. Here is a quick snippet:

```ts
import { ext, overlay } from "fiber-extension";
import { html } from "lit";

const response = await ext.fetch("https://api.example.com/data");
const data = await response.json();

overlay.show(html`
  <div>Result: ${data.message}</div>
`);
```

> **Note:** Currently Fiber is built to work with [Lit](https://lit.dev/). React
> and other frameworks are not guaranteed to work. This might change in the
> future

## Installation

Requires Vite to build

```bash
pnpm install fiber-extension
```

In `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import { fiberExtension } from "fiber-extension/vite";

export default defineConfig({
  plugins: [
    fiberExtension({
      manifest: {
        name: "My Extension",
        version: "1.0.0",
        permissions: ["tabs", "storage"],
        host_permissions: ["https://example.com/*"],
      },
    }),
  ],
});
```

In `src/app.ts`:

```ts
import { overlay } from "fiber-extension";
import { html } from "lit";

overlay.show(html`
  <p>Hello</p>
`);
```

Run:

```bash
# Development (live reload)
vite dev

# Production
vite build
```

Load `dist/` folder in `chrome://extensions`.

## Capabilities

### Supported APIs

- `chrome.tabs.*`
- `chrome.storage.local.*`
- `chrome.storage.sync.*`
- `chrome.storage.session.*`
- `chrome.scripting.executeInMainWorld`
- `fetch`

### Chrome API Proxy

```ts
import { ext } from "fiber-extension";

const tabs = await ext.tabs.query({ currentWindow: true });
const tab = await ext.tabs.get(123);
await ext.tabs.create({ url: "https://example.com" });
await ext.tabs.update(tabId, { pinned: true });
await ext.tabs.remove(tabId);

await ext.storage.local.set({ key: "value" });
const data = await ext.storage.local.get("key");
await ext.storage.sync.clear();
```

### Typed storage schema

By default, `ext.storage.local` (and `.sync`, `.session`) accept and return
`unknown` values. To get full type-safety without casts, augment the per-area
schema interfaces once in your project:

```ts
declare module "fiber-extension" {
  interface FiberStorageLocal {
    "my-api-key": string;
    "my-counter": number;
  }
}
```

After that, `set` and `get` are both constrained to those exact types—no type
assertions needed at call sites:

```ts
const result = await ext.storage.local.get("my-api-key");
const key = result["my-api-key"] ?? null;

await ext.storage.local.set({ "my-api-key": 42 });
```

The same pattern applies to `FiberStorageSync` and `FiberStorageSession`.

### Fetch

```ts
import { ext } from "fiber-extension";

const response = await ext.fetch("https://api.example.com/data", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ foo: "bar" }),
});

const data = await response.json();
```

### Execute in Main World

Content scripts run in an isolated world with strict CSP that blocks `eval()`
and `new Function()`. Use `executeInMainWorld` to run code in the page's
context:

```ts
import { ext } from "fiber-extension";

await ext.scripting.executeInMainWorld(
  (selector, code) => {
    const elements = document.querySelectorAll(selector);
    const fn = new Function("element", code);
    elements.forEach((el) => fn(el));
  },
  [".my-class", "element.style.display = 'none'"],
);
```

Requires `scripting` permission in manifest.

### Shadow DOM Overlay

```ts
import { overlay } from "fiber-extension";
import { html } from "lit";

overlay.show(html`
  <div
    style="position: fixed; top: 20px; right: 20px; background: white; padding: 16px;"
  >
    <h1>My Extension</h1>
    <button @click="${handleClick}">Click me</button>
  </div>
`);

overlay.hide();

overlay.showOnAction(html`
  <div
    style="position: fixed; top: 20px; right: 20px; background: white; padding: 16px;"
  >
    <h1>My Extension</h1>
    <button @click="${() => overlay.hide()}">Close</button>
  </div>
`);
```

### Live reload in development

Run `vite dev`: edits under `src/` rebuild `content.js` and `background.js` to
`dist/`, the dev server updates a timestamp, and the background service worker
polls it and reloads open tabs plus the extension so you pick up changes without
manually clicking “Reload” in `chrome://extensions`.

## License

MIT
