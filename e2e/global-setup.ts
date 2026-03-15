import { execSync } from "child_process";

export default function globalSetup() {
  const dir = import.meta.dirname;

  if (!dir) throw new Error("import.meta.dirname is not defined");

  const testExtensionDir = `${dir}/fixtures/test-extension`;

  console.log("[e2e] Building test extension...");
  execSync("pnpm install && pnpm build", {
    cwd: testExtensionDir,
    stdio: "inherit",
  });
  console.log("[e2e] Test extension built successfully");
}
