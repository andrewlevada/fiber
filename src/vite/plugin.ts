/**
 * Vite Plugin for Fiber Extension
 *
 * Orchestrates the build process for Chrome extensions.
 * Dev mode uses `vite build --watch` since Chrome loads extensions from disk.
 */

import type { Plugin, ResolvedConfig } from 'vite';
import path from 'path';

// ============================================================================
// Manifest Types (subset of chrome.runtime.ManifestV3)
// ============================================================================

/** Chrome extension permissions */
type ManifestPermission =
  | 'activeTab'
  | 'alarms'
  | 'bookmarks'
  | 'browsingData'
  | 'clipboardRead'
  | 'clipboardWrite'
  | 'contextMenus'
  | 'cookies'
  | 'declarativeContent'
  | 'downloads'
  | 'geolocation'
  | 'history'
  | 'identity'
  | 'idle'
  | 'management'
  | 'notifications'
  | 'pageCapture'
  | 'power'
  | 'privacy'
  | 'scripting'
  | 'search'
  | 'sessions'
  | 'storage'
  | 'system.cpu'
  | 'system.memory'
  | 'system.storage'
  | 'tabCapture'
  | 'tabs'
  | 'topSites'
  | 'tts'
  | 'ttsEngine'
  | 'unlimitedStorage'
  | 'webNavigation'
  | 'webRequest';

/** Content script configuration */
interface ManifestContentScript {
  matches: string[];
  js?: string[];
  css?: string[];
  run_at?: 'document_start' | 'document_end' | 'document_idle';
}

/** Manifest V3 structure (partial) */
interface ManifestV3 {
  manifest_version: 3;
  name: string;
  version: string;
  description?: string;
  permissions?: ManifestPermission[];
  host_permissions?: string[];
  background?: {
    service_worker: string;
    type?: 'module';
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
}

// ============================================================================
// Plugin Options
// ============================================================================

export interface FiberOptions {
  /** Partial manifest configuration to merge with defaults */
  manifest: Partial<ManifestV3>;
}

// ============================================================================
// Manifest Builder
// ============================================================================

/**
 * Build the manifest.json from user options and defaults.
 * Dev mode auto-adds 'scripting' permission for HMR.
 */
function buildManifest(partial: Partial<ManifestV3>, isDev: boolean): ManifestV3 {
  const hostPermissions = partial.host_permissions ?? [];
  const contentMatches = partial.content_scripts?.[0]?.matches ?? hostPermissions;

  // Dev mode needs scripting permission for HMR reload
  const permissions: ManifestPermission[] = [...(partial.permissions ?? [])];
  if (isDev && !permissions.includes('scripting')) {
    permissions.push('scripting');
  }

  // Build base manifest
  const manifest: ManifestV3 = {
    manifest_version: 3,
    name: partial.name ?? 'Fiber Extension',
    version: partial.version ?? '1.0.0',
    permissions,
    host_permissions: hostPermissions,
    background: {
      service_worker: 'background.js',
      type: 'module',
    },
    content_scripts: [{
      matches: contentMatches.length > 0 ? contentMatches : ['<all_urls>'],
      js: ['content.js'],
      run_at: 'document_idle',
    }],
  };

  // Merge optional fields from partial
  if (partial.description) manifest.description = partial.description;
  if (partial.icons) manifest.icons = partial.icons;
  if (partial.action) manifest.action = partial.action;
  if (partial.web_accessible_resources) {
    manifest.web_accessible_resources = partial.web_accessible_resources;
  }

  return manifest;
}

// ============================================================================
// Vite Plugin
// ============================================================================

/**
 * Vite plugin for building Chrome extensions with Fiber.
 *
 * Usage in vite.config.ts:
 * ```ts
 * import { fiberExtension } from 'fiber-extension/vite';
 *
 * export default defineConfig({
 *   plugins: [
 *     fiberExtension({
 *       manifest: {
 *         name: 'My Extension',
 *         permissions: ['storage'],
 *         host_permissions: ['https://example.com/*'],
 *       }
 *     })
 *   ]
 * });
 * ```
 *
 * Dev mode: Run with `FIBER_DEV=true vite build` for watch mode + HMR.
 */
export function fiberExtension(options: FiberOptions): Plugin {
  let isDev = false;
  let devServerPort = 5173; // Default Vite port
  let _resolvedConfig: ResolvedConfig;

  return {
    name: 'fiber-extension',

    config() {
      // Dev uses `FIBER_DEV=true vite build` (not `vite serve`) since Chrome loads from disk
      isDev = process.env.FIBER_DEV === 'true';

      return {
        build: {
          rollupOptions: {
            input: {
              content: 'virtual:fiber/content',
              background: 'virtual:fiber/background',
            },
            output: {
              entryFileNames: '[name].js',
              // Ensure chunks are named predictably
              chunkFileNames: '[name].js',
            }
          },
          outDir: 'dist',
          // Enable watch mode in dev
          watch: isDev ? {} : null,
          // Don't empty outDir on each rebuild in watch mode
          emptyOutDir: !isDev,
        }
      };
    },

    configResolved(config: ResolvedConfig) {
      _resolvedConfig = config;
      devServerPort = config.server.port ?? 5173;
    },

    resolveId(id: string) {
      if (id.startsWith('virtual:fiber/')) {
        return id;
      }
      // Allow importing 'fiber-extension' to get runtime exports
      if (id === 'fiber-extension') {
        return 'virtual:fiber/runtime';
      }
      return undefined;
    },

    load(id: string) {
      if (id === 'virtual:fiber/content') {
        // HMR initialization only in dev mode
        const hmrInit = isDev
          ? `import { initHmr } from 'fiber-extension/runtime/hmr';\ninitHmr('ws://localhost:${devServerPort}');`
          : '';
        // Use path.resolve to get absolute path to user's app.ts
        const appPath = path.resolve('src/app.ts').replace(/\\/g, '/');
        return `${hmrInit}\nimport '${appPath}';`;
      }

      if (id === 'virtual:fiber/background') {
        // HMR reload handler is only included in dev builds
        const hmrHandler = isDev
          ? `
// HMR: Listen for reload requests from content scripts
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'fiber:hmr-reload' && sender.tab?.id) {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      files: ['content.js'],
    });
  }
});`
          : '';
        return `import 'fiber-extension/runtime/background';${hmrHandler}`;
      }

      if (id === 'virtual:fiber/runtime') {
        // Use package paths, not relative paths (virtual modules can't resolve relative)
        return [
          `export { ext } from 'fiber-extension/runtime/ext';`,
          `export { overlay } from 'fiber-extension/runtime/overlay';`,
        ].join('\n');
      }

      return undefined;
    },

    generateBundle() {
      const manifest = buildManifest(options.manifest, isDev);
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: JSON.stringify(manifest, null, 2),
      });
    },

    buildStart() {
      if (!options.manifest) {
        this.warn('No manifest options provided. Using defaults.');
      }
    },

    buildEnd(error: Error | undefined) {
      if (error) {
        console.error('[fiber] Build failed:', error.message);
      } else if (isDev) {
        console.log('[fiber] Build complete. Load dist/ folder in chrome://extensions');
        console.log('[fiber] Watching for changes...');
      }
    }
  };
}
