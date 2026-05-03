/**
 * Overlay System
 *
 * Provides a Shadow DOM container for rendering UI in content scripts.
 * Supports lit-html templates and template factory functions.
 */

import { render, type TemplateResult } from "lit-html";
import { isEditableTarget } from "./util/editable-check.ts";

/** Content types supported by the overlay */
type OverlayContent =
  | TemplateResult
  | ((root: ShadowRoot) => TemplateResult);

/** Data attribute to identify fiber overlay containers */
const OVERLAY_ATTR = "data-fiber-overlay";

/** Data attribute set when the overlay is visible; read by the key trap */
const OVERLAY_OPEN_ATTR = "data-fiber-overlay-open";

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

    // Bubble-phase guard: stop key events from propagating to page document/
    // window listeners when the actual focused element is an editable field
    // inside the shadow tree. This complements the window-capture trap in
    // overlay-key-trap.ts, which blocks capture-phase page listeners.
    // composedPath()[0] on an open shadow root returns the real inner target.
    const stopIfEditable = (e: Event): void => {
      if (isEditableTarget((e as KeyboardEvent).composedPath()[0])) {
        e.stopPropagation();
      }
    };
    container.addEventListener("keydown", stopIfEditable);
    container.addEventListener("keyup", stopIfEditable);

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
  container!.setAttribute(OVERLAY_OPEN_ATTR, "");
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
          container!.setAttribute(OVERLAY_OPEN_ATTR, "");
          if (storedContent) renderContent(storedContent);
        } else {
          container!.style.display = "none";
          container!.removeAttribute(OVERLAY_OPEN_ATTR);
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
    container.removeAttribute(OVERLAY_OPEN_ATTR);
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
