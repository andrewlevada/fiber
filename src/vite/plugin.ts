import type { Plugin, ResolvedConfig, ViteDevServer } from "vite";
import path from "node:path";
import { build as esbuild } from "esbuild";
import process from "node:process";
import { buildManifest, ManifestV3 } from "./manifest.ts";

export interface FiberOptions {
  manifest: Partial<ManifestV3>;
}

function generateContentEntry(_isDev: boolean, _devServerPort: number): string {
  const appPath = path.resolve("src/app.ts").replace(/\\/g, "/");
  return `import '${appPath}';`;
}

function generateEarlyTrapEntry(): string {
  return `import 'fiber-extension/runtime/overlay-key-trap';`;
}

function generateBackgroundEntry(
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

async function bundleWithEsbuild(
  outDir: string,
  devServerPort: number,
  manifestPartial: Partial<ManifestV3>,
): Promise<void> {
  const fs = await import("fs/promises");
  await fs.mkdir(outDir, { recursive: true });

  await esbuild({
    stdin: {
      contents: generateContentEntry(true, devServerPort),
      resolveDir: process.cwd(),
      loader: "ts",
    },
    bundle: true,
    format: "iife",
    outfile: path.join(outDir, "content.js"),
  });

  await esbuild({
    stdin: {
      contents: generateEarlyTrapEntry(),
      resolveDir: process.cwd(),
      loader: "ts",
    },
    bundle: true,
    format: "iife",
    outfile: path.join(outDir, "content-early.js"),
  });

  await esbuild({
    stdin: {
      contents: generateBackgroundEntry(true, devServerPort),
      resolveDir: process.cwd(),
      loader: "ts",
    },
    bundle: true,
    format: "iife",
    outfile: path.join(outDir, "background.js"),
  });

  const manifest = buildManifest(manifestPartial, true);
  await fs.writeFile(
    path.join(outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
}

export function fiberExtension(options: FiberOptions): Plugin {
  let isDev = false;
  let devServerPort = 5173;
  let _resolvedConfig: ResolvedConfig;

  return {
    name: "fiber-extension",

    config(_, { command }) {
      isDev = command === "serve";

      if (isDev) {
        return {
          build: {
            outDir: "dist",
          },
        };
      }

      return {
        build: {
          rollupOptions: {
            input: {
              content: "virtual:fiber/content",
              "content-early": "virtual:fiber/content-early",
              background: "virtual:fiber/background",
            },
            output: {
              entryFileNames: "[name].js",
              chunkFileNames: "[name].js",
            },
            preserveEntrySignatures: "strict",
          },
          outDir: "dist",
          emptyOutDir: true,
        },
      };
    },

    configResolved(config: ResolvedConfig) {
      _resolvedConfig = config;
      devServerPort = config.server.port ?? 5173;
    },

    configureServer(server: ViteDevServer) {
      const outDir = server.config.build.outDir;
      const port = server.config.server.port ?? 5173;
      let lastBuildTimestamp = Date.now();

      server.middlewares.use("/__fiber_timestamp", (_req, res) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Content-Type", "text/plain");
        res.end(String(lastBuildTimestamp));
      });

      server.httpServer?.once("listening", async () => {
        console.log("[fiber] Building extension...");
        try {
          await bundleWithEsbuild(outDir, port, options.manifest);
          console.log(
            "[fiber] Extension built. Load dist/ folder in chrome://extensions",
          );
        } catch (err) {
          console.error("[fiber] Initial build failed:", err);
        }
      });

      const srcDir = path.resolve("src");
      server.watcher.on("change", async (file: string) => {
        if (!file.startsWith(srcDir)) return;

        console.log(
          `[fiber] ${
            path.relative(process.cwd(), file)
          } changed, rebuilding...`,
        );
        try {
          await bundleWithEsbuild(outDir, port, options.manifest);
          lastBuildTimestamp = Date.now();
          console.log("[fiber] Rebuild complete");
        } catch (err) {
          console.error("[fiber] Rebuild failed:", err);
        }
      });
    },

    handleHotUpdate({ file }) {
      const srcDir = path.resolve("src");
      if (!file.startsWith(srcDir)) return;

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
        return generateContentEntry(isDev, devServerPort);
      }

      if (id === "virtual:fiber/content-early") {
        return generateEarlyTrapEntry();
      }

      if (id === "virtual:fiber/background") {
        return generateBackgroundEntry(isDev, devServerPort);
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
      const manifest = buildManifest(options.manifest, isDev);
      this.emitFile({
        type: "asset",
        fileName: "manifest.json",
        source: JSON.stringify(manifest, null, 2),
      });
    },

    buildStart() {
      if (!options.manifest) {
        this.warn("No manifest options provided. Using defaults.");
      }
    },

    buildEnd(error: Error | undefined) {
      if (error) {
        console.error("[fiber] Build failed:", error.message);
      }
    },

    async closeBundle() {
      const outDir = _resolvedConfig.build.outDir;
      const contentPath = path.join(outDir, "content.js");
      const backgroundPath = path.join(outDir, "background.js");

      await esbuild({
        entryPoints: [contentPath],
        bundle: true,
        format: "iife",
        outfile: contentPath,
        allowOverwrite: true,
        minify: !isDev,
      });

      await esbuild({
        entryPoints: [backgroundPath],
        bundle: true,
        format: "iife",
        outfile: backgroundPath,
        allowOverwrite: true,
        minify: !isDev,
      });

      const earlyPath = path.join(outDir, "content-early.js");
      await esbuild({
        entryPoints: [earlyPath],
        bundle: true,
        format: "iife",
        outfile: earlyPath,
        allowOverwrite: true,
        minify: !isDev,
      });

      const keepFiles = new Set([
        "content.js",
        "background.js",
        "content-early.js",
      ]);
      const fs = await import("fs/promises");
      const files = await fs.readdir(outDir);
      for (const file of files) {
        if (file.endsWith(".js") && !keepFiles.has(file)) {
          await fs.unlink(path.join(outDir, file));
        }
      }
    },
  };
}
