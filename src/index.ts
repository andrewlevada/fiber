// Keep this for consumers that import Fiber without the Vite plugin. The plugin
// also loads it before the application entry so HTMLElement is patched before
// component libraries capture it.
import "./runtime/polyfill.ts";

export { ext } from "./runtime/ext.ts";
export { overlay } from "./runtime/overlay.ts";

export type {
  ExtApi,
  FiberStorageLocal,
  FiberStorageSession,
  FiberStorageSync,
  StorageAreaFor,
} from "./types/ext.d.ts";
export type { Overlay } from "./types/overlay.d.ts";
