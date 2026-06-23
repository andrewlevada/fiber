# AGENTS.md

## Cursor Cloud specific instructions

Fiber is a Chrome-extension framework library. Its toolchain is **Deno** (the
`package.json` scripts delegate to `deno task`), with Node + pnpm used only for
Playwright. See `CLAUDE.md` for the architecture and the canonical command list.

- `deno` is installed and symlinked at `/usr/local/bin/deno`, so it is on `PATH`
  for all shells.
- `pnpm build` (= `deno task build`) compiles `src/` to `dist/`. The `dist/` must
  exist before the e2e suite runs and before the sibling
  `internet-shaper-thesis-2026/browser-extension` (which links `fiber-extension`
  via `../../fiber`) can resolve the package. `dist/` is git-ignored; rebuild it
  after changing fiber source.
- `@types/node`, `esbuild`, and `lit-html` are devDependencies. They are only
  needed so the standalone `tsc` build can resolve types/imports; at consumer
  runtime they come transitively from the `lit`/`vite` peer dependencies.
- e2e tests (`pnpm test:e2e`) drive a **headed** Chromium through Playwright
  (extensions require headed Chrome), so they need a display — `DISPLAY=:1` is
  available in this environment. To run a single test use
  `deno run --allow-read --allow-run --allow-env e2e/run-tests.ts <n>` (the
  Deno-shebang runner cannot be launched with `node`).
- The `fetch-proxy` spec hits `httpbin.org`; it can fail intermittently due to
  external network latency, not a code regression — re-run to confirm.
- `deno task typecheck`, `deno lint`, and `deno fmt --check` currently report
  pre-existing issues (e.g. in `src/types/ext.d.ts`, missing `node:` import
  prefixes). These are source-level, not environment problems.
