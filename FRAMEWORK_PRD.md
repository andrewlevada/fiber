# Browser Extension Framework

A framework that makes browser extension development feel like writing a single
async program. Distributed as an npm package.

## Package Name

`fiber-extension`

## Goals

1. **Single control flow** — write one file, everything works via async/await
2. **No message passing** — developers never touch `chrome.runtime.sendMessage`
3. **Overlay-first UI** — no popups, UI lives inside the page
4. **Lit as a base Framework**
5. **Zero config** — Vite plugin handles all the wiring (Vite can be a requirment for users of the framwork)

## Developer Experience

### Installation

```bash
npm install fiber-extension
```

### Project Structure (user's project)

```
my-extension/
├── src/
│   └── app.ts           # the only file developers write
├── vite.config.ts       # uses fiber-extension plugin
└── package.json
```

### `app.ts` — The Single Entry Point

```typescript
import { ext, overlay } from 'fiber-extension';
import { html, css } from 'lit';

// fetch works everywhere
const res = await ext.fetch('https://api.example.com/data');
const data = await res.json();

// Chrome APIs as async functions
const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
console.log('Current tab:', tab.title);

// Storage
await ext.storage.local.set({ lastVisit: Date.now() });

// Overlay UI with Lit
class MyPanel extends LitElement {
  static styles = css`
    :host { display: block; padding: 16px; background: white; }
  `;

  render() {
    return html`<p>Hello from ${tab.title}</p>`;
  }
}
customElements.define('my-panel', MyPanel);

overlay.attach(html`<my-panel></my-panel>`);
```

### `vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import fiber-extension from 'fiber-extension/vite';

export default defineConfig({
  plugins: [
    fiber-extension({
      manifest: {
        name: 'My Extension',
        version: '1.0.0',
        permissions: ['storage', 'tabs'],
        host_permissions: ['https://api.example.com/*'],
      },
    }),
  ],
});
```

That's it. No background script, no content script setup, no message handling.
