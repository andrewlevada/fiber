// Keep this for consumers that import Fiber without the Vite plugin. The plugin
// also loads it before the application entry so HTMLElement is patched before
// component libraries capture it.
import "./runtime/polyfill.ts";

export { ext } from "./runtime/main.ts";
export { overlay } from "./runtime/overlay.ts";

export type { Overlay } from "./overlay.d.ts";

export interface ExtApi {
  tabs: typeof chrome.tabs;
  scripting: ScriptingApi;

  fetch: typeof fetch;
}

export interface ScriptingApi {
  executeInMainWorld<T, A extends unknown[]>(
    func: (...args: A) => T,
    args: A,
  ): Promise<T>;
}
