/**
 * Fiber Extension - Main Exports
 *
 * This module provides the main public API for content scripts:
 * - `ext`: Proxy for Chrome APIs that works in content scripts
 * - `overlay`: Shadow DOM container for rendering UI
 */

export { ext } from "./runtime/ext.ts";
export { overlay } from "./runtime/overlay.ts";

// Re-export types for convenience
export type { ExtApi, FetchFn, FetchResponse } from "./types/ext.d.ts";
export type { Overlay } from "./types/overlay.d.ts";
