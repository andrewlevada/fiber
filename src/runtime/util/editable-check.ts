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
