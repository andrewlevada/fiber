/**
 * Overlay Key Trap
 *
 * Intended to run at document_start via a dedicated early content script,
 * so this window capture listener is registered before any page scripts.
 *
 * On every keydown/keyup event, the handler first confirms that the actual
 * focused element (composedPath()[0]) is an editable text field. If it is,
 * it then checks whether that element lives inside the fiber overlay host
 * (data-fiber-overlay + data-fiber-overlay-open). When both conditions hold,
 * stopImmediatePropagation() is called to prevent later window capture
 * listeners (such as site-wide keyboard shortcuts) from handling the key.
 *
 * Note: stopImmediatePropagation() does prevent further propagation down to
 * the actual input, but the browser's default action (character insertion)
 * is driven by keyboard focus, not by event propagation reaching the element.
 * Since we do not call preventDefault(), the character still appears in the
 * focused field.
 *
 * When the overlay is closed, or focus is on a non-text element (e.g. a
 * button inside the overlay), neither condition holds and the handler does
 * nothing, leaving all page shortcuts and page inputs intact.
 */

import { isEditableTarget } from "./util/editable-check.ts";

const OVERLAY_ATTR = "data-fiber-overlay";
const OVERLAY_OPEN_ATTR = "data-fiber-overlay-open";

function trapKey(e: KeyboardEvent): void {
  const path = e.composedPath();

  // Only intercept when the actual focused element is a text input.
  if (!isEditableTarget(path[0])) return;

  // Check that the input is inside an open fiber overlay.
  for (const node of path) {
    if (
      node instanceof Element &&
      node.hasAttribute(OVERLAY_ATTR) &&
      node.hasAttribute(OVERLAY_OPEN_ATTR)
    ) {
      e.stopImmediatePropagation();
      return;
    }
  }
}

globalThis.addEventListener("keydown", trapKey, true);
globalThis.addEventListener("keyup", trapKey, true);
