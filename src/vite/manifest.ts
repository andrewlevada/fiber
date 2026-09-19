// From: https://developer.chrome.com/docs/extensions/reference/manifest#register-a-content-script

export interface ManifestV3 {
  manifest_version: 3;
  name: string;
  version: string;
  description?: string;
  permissions?: ManifestPermission[];
  host_permissions?: string[];
  background?: {
    service_worker: string;
    type?: "module";
  };
  content_scripts?: ManifestContentScript[];
  icons?: Record<string, string>;
  action?: {
    default_popup?: string;
    default_icon?: string | Record<string, string>;
    default_title?: string;
  };
  web_accessible_resources?: Array<{
    resources: string[];
    matches: string[];
  }>;
  minimum_chrome_version?: string;
}

export function buildManifest(
  partial: Partial<ManifestV3>,
  isDev: boolean,
): ManifestV3 {
  const hostPermissions = partial.host_permissions ?? [];
  const contentMatches = partial.content_scripts?.[0]?.matches ??
    hostPermissions;

  const permissions: ManifestPermission[] = [...(partial.permissions ?? [])];
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
  if (partial.icons) manifest.icons = partial.icons;
  manifest.action = partial.action ?? {};
  if (partial.web_accessible_resources) {
    manifest.web_accessible_resources = partial.web_accessible_resources;
  }
  if (partial.minimum_chrome_version) {
    manifest.minimum_chrome_version = partial.minimum_chrome_version;
  }

  return manifest;
}

export type ManifestPermission =
  | "activeTab"
  | "alarms"
  | "bookmarks"
  | "browsingData"
  | "clipboardRead"
  | "clipboardWrite"
  | "contextMenus"
  | "cookies"
  | "declarativeContent"
  | "declarativeNetRequest"
  | "declarativeNetRequestWithHostAccess"
  | "downloads"
  | "geolocation"
  | "history"
  | "identity"
  | "idle"
  | "management"
  | "notifications"
  | "pageCapture"
  | "power"
  | "privacy"
  | "scripting"
  | "search"
  | "sessions"
  | "storage"
  | "system.cpu"
  | "system.memory"
  | "system.storage"
  | "tabCapture"
  | "tabs"
  | "topSites"
  | "tts"
  | "ttsEngine"
  | "unlimitedStorage"
  | "webNavigation"
  | "webRequest";

export interface ManifestContentScript {
  matches: string[];
  js?: string[];
  css?: string[];
  run_at?: "document_start" | "document_end" | "document_idle";
  world?: "ISOLATED" | "MAIN";
}
