/**
 * Overlay System
 *
 * Provides a Shadow DOM container for rendering UI in content scripts.
 * Uses Lit for efficient template rendering with scoped custom element registry.
 */

import { render, type TemplateResult } from "lit-html";

/** Data attribute to identify fiber overlay containers */
const OVERLAY_ATTR = "data-fiber-overlay";

/** Container element reference */
let container: HTMLElement | null = null;

/** Shadow root reference for rendering */
let shadowRoot: ShadowRoot | null = null;

/** Scoped custom element registry for this overlay (null means use global) */
let registry: CustomElementRegistry | null = null;

/** Whether scoped custom element registries are supported */
const scopedRegistrySupported = (() => {
  try {
    new CustomElementRegistry();
    return true;
  } catch {
    return false;
  }
})();

/** Stored template for showOnAction toggle mode */
let storedTemplate: TemplateResult | null = null;

/** Whether the toggle listener has been attached */
let listenerAttached = false;

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
 * Ensure the overlay container exists.
 * Creates it if it doesn't exist yet.
 */
function ensureContainer(): ShadowRoot {
  if (container === null) {
    container = document.createElement("div");
    container.setAttribute(OVERLAY_ATTR, "");

    if (scopedRegistrySupported) {
      // Create scoped registry for custom elements (Chrome 146+)
      registry = new CustomElementRegistry();
      shadowRoot = container.attachShadow({
        mode: "open",
        customElements: registry,
      });
    } else {
      // Fallback for older browsers: use global registry
      shadowRoot = container.attachShadow({ mode: "open" });
    }

    const styleSheet = new CSSStyleSheet();
    styleSheet.replaceSync(CONTAINER_STYLES);
    shadowRoot.adoptedStyleSheets = [styleSheet];

    document.documentElement.appendChild(container);
  }

  return shadowRoot!;
}

/**
 * Register a custom element in the overlay's scoped registry.
 * Must be called before using the element in templates.
 */
function defineElement(
  name: string,
  constructor: CustomElementConstructor,
): void {
  ensureContainer();
  if (registry) {
    registry.define(name, constructor);
  } else {
    // Fallback: use global registry, skip if already defined
    if (!customElements.get(name)) {
      customElements.define(name, constructor);
    }
  }
}

/**
 * Show the overlay with the given template.
 * Creates the container if it doesn't exist, or updates content if it does.
 *
 * @param template - Lit template to render
 */
function show(template: TemplateResult): void {
  const root = ensureContainer();
  container!.style.display = "";
  render(template, root);
}

/**
 * Set up the overlay to toggle when the extension icon is clicked.
 * The overlay starts hidden and shows/hides on each action click.
 *
 * @param template - Lit template to render when shown
 */
function showOnAction(template: TemplateResult): void {
  ensureContainer();

  container!.style.display = "none";
  storedTemplate = template;

  if (!listenerAttached) {
    listenerAttached = true;
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === "fiber:toggle-overlay") {
        if (container!.style.display === "none") {
          container!.style.display = "";
          if (storedTemplate) render(storedTemplate, shadowRoot!);
        } else {
          container!.style.display = "none";
        }
      }
      return undefined;
    });
  }
}

/**
 * Hide the overlay.
 */
function hide(): void {
  if (container !== null) {
    container.style.display = "none";
  }
}

/**
 * Internal function for HMR to reset overlay state.
 * Called by the Vite plugin during hot module replacement.
 */
export function __hmrReset(): void {
  if (container !== null) {
    container.remove();
  }
  container = null;
  shadowRoot = null;
  registry = null;
  storedTemplate = null;
}

/**
 * Overlay API for content scripts.
 */
export const overlay = {
  show,
  showOnAction,
  hide,
  defineElement,
} as const;

export type Overlay = typeof overlay;
