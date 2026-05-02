#!/usr/bin/env -S deno run --allow-read --allow-run --allow-env

/**
 * Cursor agent (and some sandboxes) set HOME under cursor-sandbox-cache; Playwright
 * then looks for Chromium in that empty tree. Point at normal OS cache using USER.
 */
function envForPlaywright(): Record<string, string> {
  const env = Deno.env.toObject();
  const cur = env.PLAYWRIGHT_BROWSERS_PATH ?? "";
  if (cur && !cur.includes("cursor-sandbox-cache")) return env;

  const user = env.USER ?? env.USERNAME;
  const os = Deno.build.os;

  if (os === "darwin" && user) {
    return {
      ...env,
      PLAYWRIGHT_BROWSERS_PATH: `/Users/${user}/Library/Caches/ms-playwright`,
    };
  }
  if (os === "linux" && user) {
    const home = env.HOME?.includes("cursor-sandbox-cache")
      ? `/home/${user}`
      : env.HOME;
    if (home) {
      return {
        ...env,
        PLAYWRIGHT_BROWSERS_PATH: `${home}/.cache/ms-playwright`,
      };
    }
  }
  if (os === "windows" && env.LOCALAPPDATA) {
    return {
      ...env,
      PLAYWRIGHT_BROWSERS_PATH: `${env.LOCALAPPDATA}\\ms-playwright`,
    };
  }

  return env;
}

const testsDir = new URL("./tests", import.meta.url).pathname;

// Get all test files sorted alphabetically
const testFiles = [...Deno.readDirSync(testsDir)]
  .filter((f) => f.name.endsWith(".spec.ts"))
  .map((f) => f.name)
  .sort();

const args = Deno.args;

if (args.includes("--list") || args.includes("-l")) {
  console.log("Available tests:");
  testFiles.forEach((f, i) =>
    console.log(`  ${i + 1}. ${f.replace(".spec.ts", "")}`)
  );
  Deno.exit(0);
}

// If no args, run all tests
// Note: Playwright requires Node.js, so we use npx to run it
if (args.length === 0) {
  const cmd = new Deno.Command("npx", {
    args: ["playwright", "test", "--config=e2e/playwright.config.ts"],
    env: envForPlaywright(),
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const result = cmd.outputSync();
  Deno.exit(result.code);
}

// Map numbers to test files
const selectedFiles: string[] = [];
for (const arg of args) {
  const num = parseInt(arg, 10);
  if (isNaN(num) || num < 1 || num > testFiles.length) {
    console.error(
      `Invalid test number: ${arg}. Use --list to see available tests.`,
    );
    Deno.exit(1);
  }
  selectedFiles.push(`e2e/tests/${testFiles[num - 1]}`);
}

const cmd = new Deno.Command("npx", {
  args: [
    "playwright",
    "test",
    "--config=e2e/playwright.config.ts",
    ...selectedFiles,
  ],
  env: envForPlaywright(),
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});
const result = cmd.outputSync();
Deno.exit(result.code);
