import { isTargetEditable } from "./util/editable-check.ts";

const OVERLAY_ATTR = "data-fiber-overlay";
const OVERLAY_OPEN_ATTR = "data-fiber-overlay-open";

globalThis.addEventListener("keydown", trapKey, true);
globalThis.addEventListener("keyup", trapKey, true);

function trapKey(e: KeyboardEvent): void {
  const path = e.composedPath();

  if (!isTargetEditable(path[0])) return;

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
