/**
 * TypeScript Definitions for Overlay System
 */

import type { TemplateResult } from "lit-html";

/** Content types supported by the overlay */
type OverlayContent =
  | TemplateResult
  | ((root: ShadowRoot) => TemplateResult);

/**
 * Overlay API for content scripts.
 *
 * The overlay provides a Shadow DOM container for rendering UI that floats
 * above the page content. It uses lit-html for efficient template rendering.
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
   * Show the overlay with the given content.
   * Creates the container if it doesn't exist, or updates content if it does.
   *
   * @param content - Lit template or factory function that receives ShadowRoot
   *
   * @example
   * ```ts
   * // With lit-html template
   * overlay.show(html`<div class="my-ui">Hello!</div>`);
   *
   * // With factory function (for re-rendering)
   * overlay.show((root) => html`<div @click=${() => render(newTemplate, root)}>Click me</div>`);
   * ```
   */
  show(content: OverlayContent): void;

  /**
   * Set up the overlay to toggle when the extension icon is clicked.
   * The overlay starts hidden and shows/hides on each action click.
   *
   * @param content - Lit template or factory function to render when shown
   */
  showOnAction(content: OverlayContent): void;

  /**
   * Hide the overlay.
   */
  hide(): void;
}

/**
 * Optional helper to tear down overlay DOM and in-memory state (e.g. tests).
 * Not part of the supported public API surface.
 */
export function __hmrReset(): void;

export const overlay: Overlay;
