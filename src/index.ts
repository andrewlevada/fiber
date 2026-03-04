/**
 * Fiber Extension - Main Exports
 *
 * This module provides the main public API for content scripts:
 * - `ext`: Proxy for Chrome APIs that works in content scripts
 * - `overlay`: Shadow DOM container for rendering UI
 */

export { ext } from './runtime/ext';
export { overlay } from './runtime/overlay';

// Re-export types for convenience
export type { ExtApi, FetchResponse, FetchFn } from './types/ext';
export type { Overlay } from './types/overlay';
