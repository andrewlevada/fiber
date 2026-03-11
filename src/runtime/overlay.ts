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

/** Whether the overlay is currently visible */
let isVisible = false;

/** Stored template for toggle mode */
let storedTemplate: TemplateResult | null = null;

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
 * Show the overlay (used with attachOnAction mode).
 */
function show(): void {
  if (container === null || storedTemplate === null) return;
  if (isVisible) return;

  isVisible = true;
  container.style.display = '';
  render(storedTemplate, shadowRoot!);
}

/**
 * Hide the overlay (used with attachOnAction mode).
 */
function hide(): void {
  if (container === null) return;
  if (!isVisible) return;

  isVisible = false;
  container.style.display = 'none';
}

/**
 * Toggle overlay visibility.
 */
function toggle(): void {
  if (isVisible) {
    hide();
  } else {
    show();
  }
}

/**
 * Attach the overlay in "onAction" mode.
 * The overlay starts hidden and toggles when the extension icon is clicked.
 *
 * @param template - Lit template to render (should include a close button that calls overlay.hide())
 */
function attachOnAction(template: TemplateResult): void {
  if (container !== null) {
    throw new Error(
      'overlay.attachOnAction() was already called. Call overlay.detach() first to re-attach.'
    );
  }

  storedTemplate = template;

  // Create container div with shadow DOM
  container = document.createElement('div');
  container.setAttribute(OVERLAY_ATTR, '');
  container.style.display = 'none'; // Start hidden
  shadowRoot = container.attachShadow({ mode: 'open' });

  // Add styles
  const styleSheet = new CSSStyleSheet();
  styleSheet.replaceSync(CONTAINER_STYLES);
  shadowRoot.adoptedStyleSheets = [styleSheet];

  // Append to document
  document.documentElement.appendChild(container);

  // Listen for toggle messages from background script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'fiber:toggle-overlay') {
      toggle();
    }
    return undefined;
  });
}

/**
 * Internal function for HMR to reset overlay state.
 * Called by the Vite plugin during hot module replacement.
 */
export function __hmrReset(): void {
  detach();
  storedTemplate = null;
  isVisible = false;
}

/**
 * Overlay API for content scripts.
 */
export const overlay = {
  attach,
  attachOnAction,
  render: renderOverlay,
  detach,
  show,
  hide,
  toggle,
} as const;

export type Overlay = typeof overlay;
