// From: https://developer.chrome.com/docs/extensions/reference/manifest#register-a-content-script

import { iconManifest } from "./icons.ts";

export interface ManifestV3 {
  manifest_version: 3;
  name: string;
  version: string;
  description?: string;

  permissions?: string[];
  host_permissions?: string[];

  background?: {
    service_worker: string;
    type?: "module";
  };
  content_scripts?: chrome.contentScripts.ContentScript[];

  icons?: Record<string, string>;
  action?: {
    default_popup?: string;
    default_icon?: string | Record<string, string>;
    default_title?: string;
  };
  web_accessible_resources?:
    chrome.webAccessibleResources.WebAccessibleResource[];

  minimum_chrome_version?: string;
}

export type FiberManifest = Partial<ManifestV3> & {
  /** Path to a source icon from which Fiber generates extension icons. */
  icon?: string;
};

export function buildManifest(
  partial: FiberManifest,
  isDev: boolean,
): ManifestV3 {
  const hostPermissions = partial.host_permissions ?? [];
  const contentMatches = partial.content_scripts?.[0]?.matches ??
    hostPermissions;

  const permissions = [...(partial.permissions ?? [])];
  if (isDev && !permissions.includes("scripting")) {
    permissions.push("scripting");
  }

  const matches = contentMatches.length > 0 ? contentMatches : ["<all_urls>"];

  const manifest: ManifestV3 = {
    manifest_version: 3,
    name: partial.name ?? "Fiber Extension",
    version: partial.version ?? "1.0.0",
    permissions,
    host_permissions: hostPermissions,
    background: {
      service_worker: "background.js",
    },
    content_scripts: [
      { matches, js: ["content-early.js"], run_at: "document_start" },
      { matches, js: ["content.js"], run_at: "document_idle" },
    ],
  };

  if (partial.description) manifest.description = partial.description;

  const icons = partial.icon ? iconManifest() : partial.icons;
  if (icons) manifest.icons = icons;

  manifest.action = {
    ...(partial.action ?? {}),
    ...(partial.icon && partial.action?.default_icon === undefined
      ? { default_icon: icons }
      : {}),
  };

  if (partial.web_accessible_resources) {
    manifest.web_accessible_resources = partial.web_accessible_resources;
  }

  if (partial.minimum_chrome_version) {
    manifest.minimum_chrome_version = partial.minimum_chrome_version;
  }

  return manifest;
}
