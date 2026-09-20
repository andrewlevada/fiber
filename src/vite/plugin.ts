import path from "node:path";
import fs from "node:fs";
import process from "node:process";
import {
  build as viteBuild,
  type InlineConfig,
  type Plugin,
  type ResolvedConfig,
  type ViteDevServer,
} from "vite";
import { generateIcons, ICONS_DIR } from "./icons.ts";
import { buildManifest, type FiberManifest } from "./manifest.ts";

type FiberEntry = "content" | "content-early" | "background";

interface FiberBuildRequest {
  target: FiberEntry;
  isDev: boolean;
  devServerPort?: number;
}

type FiberInlineConfig = InlineConfig & {
  __fiberBuild?: FiberBuildRequest;
};

export interface FiberOptions {
  manifest: FiberManifest;
}

export function fiberExtension(options: FiberOptions): Plugin {
  let isDev = false;
  let devServerPort = 5173;
  let buildTarget: FiberEntry = "content";
  let projectRoot = process.cwd();
  let resolvedConfig: ResolvedConfig | undefined;
  let devServerState: DevServerState | undefined;

  return {
    name: "fiber-extension",

    config(config, { command }) {
      const request = getFiberBuildRequest(config);
      buildTarget = request?.target ?? "content";
      isDev = request?.isDev ?? command === "serve";

      return {
        resolve: {
          conditions: [
            "module",
            "browser",
            "development|production",
            "style",
          ],
        },
        build: {
          outDir: "dist",
          emptyOutDir: buildTarget === "content",
          rollupOptions: {
            input: { [buildTarget]: entryId(buildTarget) },
            output: {
              format: "iife",
              entryFileNames: `${buildTarget}.js`,
              chunkFileNames: "[name].js",
              inlineDynamicImports: true,
            },
            preserveEntrySignatures: "strict",
          },
          minify: !isDev,
        },
      };
    },

    configResolved(config: ResolvedConfig) {
      resolvedConfig = config;
      projectRoot = config.root;

      const request = getFiberBuildRequest(config.inlineConfig);
      buildTarget = request?.target ?? "content";
      isDev = request?.isDev ?? config.command === "serve";
      devServerPort = request?.devServerPort ?? config.server.port ?? 5173;
    },

    configureServer(server: ViteDevServer) {
      const port = server.config.server.port ?? 5173;
      const srcDir = path.resolve(server.config.root, "src");
      const iconPath = options.manifest.icon
        ? path.resolve(server.config.root, options.manifest.icon)
        : undefined;

      const state: DevServerState = {
        config: resolvedConfig ?? server.config,
        port,
        srcDir,
        iconPath,
        lastBuildTimestamp: Date.now(),
        buildQueue: Promise.resolve(),
      };
      devServerState = state;

      if (iconPath) server.watcher.add(iconPath);

      server.middlewares.use("/__fiber_timestamp", (_req, res) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Content-Type", "text/plain");
        res.end(String(state.lastBuildTimestamp));
      });

      server.httpServer?.once("listening", async () => {
        console.log("[fiber] Building extension...");

        try {
          await queueDevBuild(state, options);
          state.lastBuildTimestamp = Date.now();
          console.log(
            "[fiber] Extension built. Load dist/ folder in chrome://extensions",
          );
        } catch (err) {
          console.error("[fiber] Initial build failed:", err);
        }
      });
    },

    async handleHotUpdate({ file }) {
      const isIconUpdate = devServerState?.iconPath === path.resolve(file);
      if (
        !devServerState ||
        (!file.startsWith(devServerState.srcDir) && !isIconUpdate)
      ) {
        return;
      }

      console.log(
        `[fiber] ${path.relative(projectRoot, file)} changed, rebuilding...`,
      );

      try {
        await queueDevBuild(devServerState, options);
        devServerState.lastBuildTimestamp = Date.now();
        console.log("[fiber] Rebuild complete");
      } catch (err) {
        console.error("[fiber] Rebuild failed:", err);
      }

      return [];
    },

    resolveId(id: string) {
      if (id.startsWith("virtual:fiber/")) {
        return id;
      }

      if (id === "fiber-extension") {
        return "virtual:fiber/runtime";
      }

      return undefined;
    },

    load(id: string) {
      if (id === "virtual:fiber/content") {
        return contentEntryPath(projectRoot);
      }

      if (id === "virtual:fiber/content-early") {
        return earlyTrapEntryPath();
      }

      if (id === "virtual:fiber/background") {
        return backgroundEntryPath(isDev, devServerPort);
      }

      if (id === "virtual:fiber/runtime") {
        return [
          `export { ext } from 'fiber-extension/runtime/ext';`,
          `export { overlay } from 'fiber-extension/runtime/overlay';`,
        ].join("\n");
      }

      return undefined;
    },

    generateBundle() {
      if (buildTarget !== "content") return;

      const manifest = buildManifest(options.manifest, isDev);

      this.emitFile({
        type: "asset",
        fileName: "manifest.json",
        source: JSON.stringify(manifest, null, 2),
      });
    },

    async buildStart() {
      if (!options.manifest) {
        this.warn("No manifest options provided. Using defaults.");
      }

      if (resolvedConfig?.command === "serve" || !options.manifest.icon) {
        return;
      }

      const sourcePath = path.resolve(projectRoot, options.manifest.icon);
      const icons = await generateIcons(sourcePath);

      for (const [size, buffer] of icons) {
        this.emitFile({
          type: "asset",
          fileName: `${ICONS_DIR}/icon-${size}.png`,
          source: buffer,
        });
      }
    },

    buildEnd(error: Error | undefined) {
      if (error) {
        console.error("[fiber] Build failed:", error.message);
      }
    },

    async closeBundle() {
      if (isDev || buildTarget !== "content" || !resolvedConfig) {
        return;
      }

      await buildExtensionEntries(resolvedConfig, options, false, [
        "content-early",
        "background",
      ]);
    },
  };
}

interface DevServerState {
  config: ResolvedConfig;
  port: number;
  srcDir: string;
  iconPath?: string;
  lastBuildTimestamp: number;
  buildQueue: Promise<void>;
}

function getFiberBuildRequest(
  config: object,
): FiberBuildRequest | undefined {
  const request = (config as { __fiberBuild?: unknown }).__fiberBuild;
  if (!request || typeof request !== "object") return undefined;

  const { target, isDev, devServerPort } = request as Partial<
    FiberBuildRequest
  >;
  if (
    (target !== "content" && target !== "content-early" &&
      target !== "background") ||
    typeof isDev !== "boolean" ||
    (devServerPort !== undefined && typeof devServerPort !== "number")
  ) {
    return undefined;
  }

  return { target: target as FiberEntry, isDev, devServerPort };
}

function entryId(entry: FiberEntry): string {
  return `virtual:fiber/${entry}`;
}

async function queueDevBuild(
  state: DevServerState,
  options: FiberOptions,
): Promise<void> {
  const build = state.buildQueue.then(
    () =>
      buildExtensionEntries(
        state.config,
        options,
        true,
        ["content", "content-early", "background"],
        state.port,
      ),
  );

  state.buildQueue = build.catch(() => undefined);
  await build;
}

async function buildExtensionEntries(
  resolvedConfig: ResolvedConfig | undefined,
  options: FiberOptions,
  isDev: boolean,
  entries: FiberEntry[],
  devServerPort?: number,
): Promise<void> {
  for (const target of entries) {
    const inlineConfig: FiberInlineConfig = {
      configFile: resolvedConfig?.configFile ?? false,
      root: resolvedConfig?.root,
      mode: resolvedConfig?.mode,
      __fiberBuild: {
        target,
        isDev,
        devServerPort,
      },
      ...(resolvedConfig?.configFile
        ? {}
        : { plugins: [fiberExtension(options)] }),
    };

    await viteBuild(inlineConfig);
  }
}

function contentEntryPath(root: string): string {
  const paths = [
    "index.ts",
    "app.ts",
    "main.ts",
    "src/index.ts",
    "src/app.ts",
    "src/main.ts",
  ].map((to) => path.resolve(root, to).replace(/\\/g, "/"));

  for (const indexPath of paths) {
    if (fs.existsSync(indexPath)) {
      // This must execute before the app imports Lit (or any other HTMLElement
      // subclass). The custom-elements polyfill replaces window.HTMLElement, and
      // classes extending the constructor captured before that replacement cannot
      // be upgraded by the polyfilled registry ("Illegal constructor").
      return `import 'fiber-extension/runtime/polyfill';\nimport '${indexPath}';`;
    }
  }

  throw "Can't find an entry-point file. Need index, app, or main (.ts) at root or in src/";
}

function earlyTrapEntryPath(): string {
  return `import 'fiber-extension/runtime/overlay-key-trap';`;
}

function backgroundEntryPath(
  isDev: boolean,
  devServerPort: number,
): string {
  const devLiveReloadPoll = isDev
    ? `
let lastTimestamp = Date.now();

async function checkForUpdates() {
  try {
    const res = await fetch('http://localhost:${devServerPort}/__fiber_timestamp');
    const ts = await res.text();

    if (parseInt(ts) > lastTimestamp) {
      lastTimestamp = parseInt(ts);

      const tabs = await chrome.tabs.query({});

      for (const tab of tabs) {
        if (tab.id) chrome.tabs.reload(tab.id);
      }

      chrome.runtime.reload();
    }
  } catch {}
}

setInterval(checkForUpdates, 1000);`
    : "";

  return `import 'fiber-extension/runtime/background';${devLiveReloadPoll}`;
}
