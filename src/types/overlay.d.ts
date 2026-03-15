/**
 * TypeScript Definitions for Overlay System
 */

import type { TemplateResult } from "lit-html";

/**
 * Overlay API for content scripts.
 *
 * The overlay provides a Shadow DOM container for rendering UI that floats
 * above the page content. It uses Lit for efficient template rendering.
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
   * Show the overlay with the given template.
   * Creates the container if it doesn't exist, or updates content if it does.
   *
   * @param template - Lit template to render
   *
   * @example
   * ```ts
   * import { overlay } from 'fiber-extension';
   * import { html } from 'lit-html';
   *
   * overlay.show(html`<div class="my-ui">Hello!</div>`);
   * ```
   */
  show(template: TemplateResult): void;

  /**
   * Set up the overlay to toggle when the extension icon is clicked.
   * The overlay starts hidden and shows/hides on each action click.
   *
   * @param template - Lit template to render when shown
   *
   * @example
   * ```ts
   * overlay.showOnAction(html`
   *   <div class="my-ui">
   *     <button @click=${() => overlay.hide()}>Close</button>
   *   </div>
   * `);
   * ```
   */
  showOnAction(template: TemplateResult): void;

  /**
   * Hide the overlay.
   *
   * @example
   * ```ts
   * overlay.hide();
   * ```
   */
  hide(): void;

  /**
   * Register a custom element in the overlay's scoped registry.
   * Must be called before using the element in templates.
   * Uses Chrome 146+ scoped custom element registry feature.
   *
   * @param name - The custom element tag name
   * @param constructor - The custom element class
   *
   * @example
   * ```ts
   * overlay.defineElement('my-widget', MyWidget);
   * overlay.showOnAction(html`<my-widget></my-widget>`);
   * ```
   */
  defineElement(name: string, constructor: CustomElementConstructor): void;
}

/**
 * Internal function for HMR to reset overlay state.
 * Not part of the public API.
 */
export function __hmrReset(): void;

export const overlay: Overlay;
