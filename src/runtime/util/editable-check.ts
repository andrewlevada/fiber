/**
 * Helper to check whether an event target is an editable text field.
 *
 * Returns true for:
 * - <textarea>
 * - <input> with a text-entry type (text, search, email, password, etc.)
 * - Any element with contenteditable
 *
 * Returns false for non-text inputs (checkbox, radio, button, file, etc.),
 * plain divs, buttons, and anything outside the Element hierarchy.
 */

const NON_TEXT_INPUT_TYPES = new Set([
  "checkbox",
  "radio",
  "button",
  "submit",
  "reset",
  "file",
  "image",
  "range",
  "color",
]);

export function isEditableTarget(el: EventTarget | null | undefined): boolean {
  if (!(el instanceof Element)) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    return !NON_TEXT_INPUT_TYPES.has(el.type.toLowerCase());
  }
  return el instanceof HTMLElement && el.isContentEditable;
}
