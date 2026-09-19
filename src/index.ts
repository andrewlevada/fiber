// Web Components Polyfill
// because Content Script's environment does not provide support built-in yet
import "@webcomponents/webcomponentsjs";

export { ext } from "./runtime/ext.ts";
export { overlay } from "./runtime/overlay.ts";

export type {
  ExtApi,
  FetchFn,
  FetchResponse,
  FiberStorageLocal,
  FiberStorageSession,
  FiberStorageSync,
  StorageAreaFor,
} from "./types/ext.d.ts";
export type { Overlay } from "./types/overlay.d.ts";
