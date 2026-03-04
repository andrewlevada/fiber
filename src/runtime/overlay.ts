/**
 * Overlay System
 *
 * Provides a Shadow DOM container for rendering UI in content scripts.
 * Uses Lit for efficient template rendering.
 */

import { render, type TemplateResult } from 'lit-html';

/** Data attribute to identify fiber overlay containers */
const OVERLAY_ATTR = 'data-fiber-overlay';

/** Container element reference */
let container: HTMLElement | null = null;

/** Shadow root reference for rendering */
let shadowRoot: ShadowRoot | null = null;

/**
 * Styles for the overlay container.
 * - Fixed positioning covers the viewport
 * - Maximum z-index ensures overlay is on top
 * - pointer-events: none allows clicks to pass through to the page
 * - Children get pointer-events: auto to be interactive
 */
const CONTAINER_STYLES = `
  :host {
    position: fixed !important;
    z-index: 2147483647 !important;
    inset: 0 !important;
    pointer-events: none !important;
  }
  :host > * {
    pointer-events: auto;
  }
`;

/**
 * Attach the overlay container to the page.
 * Creates a div with Shadow DOM and renders the initial template.
 *
 * Note: Uses a plain div instead of custom element because customElements
 * API is not available in Chrome extension content scripts (isolated world).
 *
 * @param template - Lit template to render initially
 * @throws Error if attach() was already called without detach()
 */
function attach(template: TemplateResult): void {
  if (container !== null) {
    throw new Error(
      'overlay.attach() was already called. Call overlay.detach() first to re-attach.'
    );
  }

  // Create container div with shadow DOM
  // Using a div instead of custom element because customElements is not
  // available in Chrome extension content scripts (isolated world)
  container = document.createElement('div');
  container.setAttribute(OVERLAY_ATTR, '');
  shadowRoot = container.attachShadow({ mode: 'open' });

  // Add styles
  const styleSheet = new CSSStyleSheet();
  styleSheet.replaceSync(CONTAINER_STYLES);
  shadowRoot.adoptedStyleSheets = [styleSheet];

  // Append to document
  document.documentElement.appendChild(container);

  // Render initial template
  render(template, shadowRoot);
}

/**
 * Update the overlay content with a new template.
 *
 * @param template - Lit template to render
 * @throws Error if attach() wasn't called first
 */
function renderOverlay(template: TemplateResult): void {
  if (shadowRoot === null) {
    throw new Error(
      'overlay.render() called before overlay.attach(). Call attach() first.'
    );
  }

  render(template, shadowRoot);
}

/**
 * Remove the overlay container from the page.
 * Resets state so attach() can be called again.
 */
function detach(): void {
  if (container !== null) {
    container.remove();
  }
  container = null;
  shadowRoot = null;
}

/**
 * Internal function for HMR to reset overlay state.
 * Called by the Vite plugin during hot module replacement.
 */
export function __hmrReset(): void {
  detach();
}

/**
 * Overlay API for content scripts.
 */
export const overlay = {
  attach,
  render: renderOverlay,
  detach,
} as const;

export type Overlay = typeof overlay;
