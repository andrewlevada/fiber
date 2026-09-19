#!/usr/bin/env -S deno run --allow-read --allow-run --allow-env

const testsDir = new URL("./tests", import.meta.url).pathname;

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

if (args.length === 0) {
  Deno.exit(runPlaywright());
}

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

Deno.exit(runPlaywright(selectedFiles));

function runPlaywright(selectedFiles: string[] = []): number {
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

  return result.code;
}

function envForPlaywright(): Record<string, string> {
  const env = Deno.env.toObject();
  const currentPath = env.PLAYWRIGHT_BROWSERS_PATH ?? "";

  if (currentPath && !currentPath.includes("cursor-sandbox-cache")) return env;

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
