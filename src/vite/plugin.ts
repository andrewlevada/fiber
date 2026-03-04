/**
 * Vite Plugin for Fiber Extension
 *
 * Orchestrates the build process for Chrome extensions.
 * Dev mode: `vite dev` - builds to disk with esbuild, uses WebSocket for HMR.
 * Prod mode: `vite build` - standard Rollup build with esbuild post-processing.
 */

import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import path from 'path';
import { build as esbuild } from 'esbuild';

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
// Entry Point Generators
// ============================================================================

/**
 * Generate content script entry code.
 * @param isDev - Whether in dev mode (includes HMR init)
 * @param devServerPort - Port for HMR WebSocket
 */
function generateContentEntry(isDev: boolean, devServerPort: number): string {
  const appPath = path.resolve('src/app.ts').replace(/\\/g, '/');
  const hmrInit = isDev
    ? `import { initHmr } from 'fiber-extension/runtime/hmr';\ninitHmr('ws://localhost:${devServerPort}');`
    : '';
  return `${hmrInit}\nimport '${appPath}';`;
}

/**
 * Generate background script entry code.
 * @param isDev - Whether in dev mode (includes HMR handler)
 */
function generateBackgroundEntry(isDev: boolean): string {
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

// ============================================================================
// Dev Mode Build
// ============================================================================

/**
 * Bundle extension files to disk using esbuild.
 * Used in dev mode for fast incremental rebuilds.
 */
async function bundleWithEsbuild(
  outDir: string,
  devServerPort: number,
  manifestPartial: Partial<ManifestV3>
): Promise<void> {
  const fs = await import('fs/promises');
  await fs.mkdir(outDir, { recursive: true });

  // Bundle content.js
  await esbuild({
    stdin: {
      contents: generateContentEntry(true, devServerPort),
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true,
    format: 'iife',
    outfile: path.join(outDir, 'content.js'),
  });

  // Bundle background.js
  await esbuild({
    stdin: {
      contents: generateBackgroundEntry(true),
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true,
    format: 'iife',
    outfile: path.join(outDir, 'background.js'),
  });

  // Write manifest.json
  const manifest = buildManifest(manifestPartial, true);
  await fs.writeFile(
    path.join(outDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
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
 * Dev mode: Run `vite dev` for watch mode + HMR.
 */
export function fiberExtension(options: FiberOptions): Plugin {
  let isDev = false;
  let devServerPort = 5173; // Default Vite port
  let _resolvedConfig: ResolvedConfig;

  return {
    name: 'fiber-extension',

    config(_, { command }) {
      // Dev mode when running `vite dev` (command === 'serve')
      isDev = command === 'serve';

      // In dev mode, we build with esbuild via configureServer
      if (isDev) {
        return {
          build: {
            outDir: 'dist',
          },
        };
      }

      // Production build uses Rollup with virtual modules
      return {
        build: {
          rollupOptions: {
            input: {
              content: 'virtual:fiber/content',
              background: 'virtual:fiber/background',
            },
            output: {
              entryFileNames: '[name].js',
              chunkFileNames: '[name].js',
            },
            // Disable code splitting - each entry bundles all its dependencies.
            // This is required because content scripts can't import external files.
            preserveEntrySignatures: 'strict',
          },
          outDir: 'dist',
          emptyOutDir: true,
        }
      };
    },

    configResolved(config: ResolvedConfig) {
      _resolvedConfig = config;
      devServerPort = config.server.port ?? 5173;
    },

    configureServer(server: ViteDevServer) {
      const outDir = server.config.build.outDir;
      const port = server.config.server.port ?? 5173;

      // Initial build on server start
      server.httpServer?.once('listening', async () => {
        console.log('[fiber] Building extension...');
        try {
          await bundleWithEsbuild(outDir, port, options.manifest);
          console.log('[fiber] Extension built. Load dist/ folder in chrome://extensions');
        } catch (err) {
          console.error('[fiber] Initial build failed:', err);
        }
      });

      // Watch src/ and rebuild on changes
      const srcDir = path.resolve('src');
      server.watcher.on('change', async (file: string) => {
        if (!file.startsWith(srcDir)) return;

        console.log(`[fiber] ${path.relative(process.cwd(), file)} changed, rebuilding...`);
        try {
          await bundleWithEsbuild(outDir, port, options.manifest);
          console.log('[fiber] Rebuild complete');
        } catch (err) {
          console.error('[fiber] Rebuild failed:', err);
        }
      });
    },

    handleHotUpdate({ file, server }) {
      const srcDir = path.resolve('src');
      if (!file.startsWith(srcDir)) return;

      // Tell all connected clients to update
      // The content script's HMR client listens for 'update' messages
      server.ws.send({ type: 'update', updates: [] });

      // Return empty array to prevent Vite's default HMR
      return [];
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
      // Virtual modules are used for production builds (vite build)
      // Dev mode uses bundleWithEsbuild() directly via configureServer
      if (id === 'virtual:fiber/content') {
        return generateContentEntry(isDev, devServerPort);
      }

      if (id === 'virtual:fiber/background') {
        return generateBackgroundEntry(isDev);
      }

      if (id === 'virtual:fiber/runtime') {
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
      }
    },

    async closeBundle() {
      // Content scripts can't use ES module imports - they need everything bundled.
      // Re-bundle content.js with esbuild to inline all dependencies as IIFE.
      const outDir = _resolvedConfig.build.outDir;
      const contentPath = path.join(outDir, 'content.js');
      const backgroundPath = path.join(outDir, 'background.js');

      await esbuild({
        entryPoints: [contentPath],
        bundle: true,
        format: 'iife',
        outfile: contentPath,
        allowOverwrite: true,
        minify: !isDev,
      });

      // Also bundle background.js for consistency (service workers work with IIFE too)
      await esbuild({
        entryPoints: [backgroundPath],
        bundle: true,
        format: 'iife',
        outfile: backgroundPath,
        allowOverwrite: true,
        minify: !isDev,
      });

      // Clean up any chunk files that are no longer needed
      const fs = await import('fs/promises');
      const files = await fs.readdir(outDir);
      for (const file of files) {
        if (file.endsWith('.js') && file !== 'content.js' && file !== 'background.js') {
          await fs.unlink(path.join(outDir, file));
        }
      }
    }
  };
}
