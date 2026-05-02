/**
 * Overlay System
 *
 * Provides a Shadow DOM container for rendering UI in content scripts.
 * Supports lit-html templates and template factory functions.
 */

import { render, type TemplateResult } from "lit-html";

/** Content types supported by the overlay */
type OverlayContent =
  | TemplateResult
  | ((root: ShadowRoot) => TemplateResult);

/** Data attribute to identify fiber overlay containers */
const OVERLAY_ATTR = "data-fiber-overlay";

/** Container element reference */
let container: HTMLElement | null = null;

/** Shadow root reference for rendering */
let shadowRoot: ShadowRoot | null = null;

/** Stored content for showOnAction toggle mode */
let storedContent: OverlayContent | null = null;

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
    shadowRoot = container.attachShadow({ mode: "open" });

    const styleSheet = new CSSStyleSheet();
    styleSheet.replaceSync(CONTAINER_STYLES);
    shadowRoot.adoptedStyleSheets = [styleSheet];

    document.documentElement.appendChild(container);
  }

  return shadowRoot!;
}

/**
 * Render content to the shadow root.
 */
function renderContent(content: OverlayContent): void {
  const root = ensureContainer();
  const template = typeof content === "function" ? content(root) : content;
  render(template, root);
}

/**
 * Show the overlay with the given content.
 * Creates the container if it doesn't exist, or updates content if it does.
 *
 * @param content - Lit template or factory function that receives ShadowRoot
 */
function show(content: OverlayContent): void {
  ensureContainer();
  container!.style.display = "";
  renderContent(content);
}

/**
 * Set up the overlay to toggle when the extension icon is clicked.
 * The overlay starts hidden and shows/hides on each action click.
 *
 * @param content - Lit template or factory function to render when shown
 */
function showOnAction(content: OverlayContent): void {
  ensureContainer();

  container!.style.display = "none";
  storedContent = content;

  if (!listenerAttached) {
    listenerAttached = true;
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === "fiber:toggle-overlay") {
        if (container!.style.display === "none") {
          container!.style.display = "";
          if (storedContent) renderContent(storedContent);
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
 * Optional helper to tear down overlay DOM and in-memory state (e.g. tests or
 * manual cleanup). Full dev live reload already replaces the page.
 */
export function __hmrReset(): void {
  if (container !== null) {
    container.remove();
  }
  container = null;
  shadowRoot = null;
  storedContent = null;
}

/**
 * Overlay API for content scripts.
 */
export const overlay = {
  show,
  showOnAction,
  hide,
} as const;

export type Overlay = typeof overlay;
