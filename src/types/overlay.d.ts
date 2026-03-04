/**
 * TypeScript Definitions for Overlay System
 */

import type { TemplateResult } from 'lit';

/**
 * Overlay API for content scripts.
 *
 * The overlay provides a Shadow DOM container for rendering UI that floats
 * above the page content. It uses Lit for efficient template rendering.
 *
 * Lifecycle:
 * 1. Call `attach(template)` to create the overlay and render initial content
 * 2. Call `render(template)` to update the content
 * 3. Call `detach()` to remove the overlay
 *
 * The overlay container:
 * - Uses Shadow DOM for style isolation
 * - Has `position: fixed` covering the viewport
 * - Has maximum z-index (2147483647)
 * - Has `pointer-events: none` so clicks pass through
 * - Children have `pointer-events: auto` for interactivity
 */
export interface Overlay {
  /**
   * Attach the overlay container to the page and render initial content.
   *
   * Creates a `<fiber-overlay>` custom element with Shadow DOM and appends
   * it to the document. The template is rendered into the shadow root.
   *
   * @param template - Lit template to render initially
   * @throws Error if attach() was already called without detach()
   *
   * @example
   * ```ts
   * import { overlay } from 'fiber-extension/runtime/overlay';
   * import { html } from 'lit';
   *
   * overlay.attach(html`<div class="my-ui">Hello!</div>`);
   * ```
   */
  attach(template: TemplateResult): void;

  /**
   * Update the overlay content with a new template.
   *
   * Uses Lit's efficient diffing to update only changed parts.
   *
   * @param template - Lit template to render
   * @throws Error if attach() wasn't called first
   *
   * @example
   * ```ts
   * overlay.render(html`<div class="my-ui">Updated content</div>`);
   * ```
   */
  render(template: TemplateResult): void;

  /**
   * Remove the overlay container from the page.
   *
   * After calling detach(), you can call attach() again to recreate
   * the overlay.
   *
   * @example
   * ```ts
   * overlay.detach();
   * ```
   */
  detach(): void;
}

/**
 * Internal function for HMR to reset overlay state.
 * Not part of the public API.
 */
export function __hmrReset(): void;

export const overlay: Overlay;
