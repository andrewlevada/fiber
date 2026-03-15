#!/usr/bin/env -S deno run --allow-read --allow-run --allow-env

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
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});
const result = cmd.outputSync();
Deno.exit(result.code);
