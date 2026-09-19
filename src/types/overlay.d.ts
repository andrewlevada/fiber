import type { TemplateResult } from "lit-html";

type OverlayContent =
  | TemplateResult
  | ((root: ShadowRoot) => TemplateResult);

export interface Overlay {
  show(content: OverlayContent): void;

  showOnAction(content: OverlayContent): void;

  hide(): void;
}

export function __hmrReset(): void;

export const overlay: Overlay;
