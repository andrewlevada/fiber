// Content scripts do not yet provide native Web Components support
import "@webcomponents/webcomponentsjs";

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
