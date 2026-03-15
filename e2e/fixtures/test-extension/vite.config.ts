import { defineConfig } from "vite";
import { fiberExtension } from "fiber-extension/vite";

export default defineConfig({
  plugins: [
    fiberExtension({
      manifest: {
        name: "Fiber E2E Test Extension",
        version: "1.0.0",
        permissions: ["storage", "tabs"],
        host_permissions: ["<all_urls>"],
      },
      // deno-lint-ignore no-explicit-any
    }) as any,
  ],
});
