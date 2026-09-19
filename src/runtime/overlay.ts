import { render, type TemplateResult } from "lit-html";
import { isEditableTarget } from "./util/editable-check.ts";

export function __hmrReset(): void {
  if (container !== null) {
    container.remove();
  }
  container = null;
  shadowRoot = null;
  storedContent = null;
}

export const overlay = {
  show,
  showOnAction,
  hide,
} as const;

export type Overlay = typeof overlay;

type OverlayContent =
  | TemplateResult
  | ((root: ShadowRoot) => TemplateResult);

const OVERLAY_ATTR = "data-fiber-overlay";

const OVERLAY_OPEN_ATTR = "data-fiber-overlay-open";

let container: HTMLElement | null = null;

let shadowRoot: ShadowRoot | null = null;

let storedContent: OverlayContent | null = null;

let listenerAttached = false;

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

function ensureContainer(): ShadowRoot {
  if (container === null) {
    container = document.createElement("div");
    container.setAttribute(OVERLAY_ATTR, "");
    shadowRoot = container.attachShadow({ mode: "open" });

    const styleSheet = new CSSStyleSheet();
    styleSheet.replaceSync(CONTAINER_STYLES);
    shadowRoot.adoptedStyleSheets = [styleSheet];

    // Block bubble-phase page listeners when an editable shadow-tree element has focus.
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

function renderContent(content: OverlayContent): void {
  const root = ensureContainer();
  const template = typeof content === "function" ? content(root) : content;
  render(template, root);
}

function show(content: OverlayContent): void {
  ensureContainer();
  container!.style.display = "";
  container!.setAttribute(OVERLAY_OPEN_ATTR, "");
  renderContent(content);
}

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

function hide(): void {
  if (container !== null) {
    container.style.display = "none";
    container.removeAttribute(OVERLAY_OPEN_ATTR);
  }
}
