import type { TemplateResult } from "lit-html";

export const overlay: Overlay;

export function __hmrReset(): void;

type OverlayContent =
  | TemplateResult
  | ((root: ShadowRoot) => TemplateResult);

export interface Overlay {
  show(content: OverlayContent): void;

  showOnAction(content: OverlayContent): void;

  hide(): void;
}
