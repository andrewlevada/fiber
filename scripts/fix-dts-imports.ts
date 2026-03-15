/**
 * Post-build script to fix .d.ts import extensions for Deno compatibility.
 * TypeScript's rewriteRelativeImportExtensions only affects .js output,
 * not .d.ts declaration files.
 */

function fixDtsImports(dir: string): void {
  for (const entry of Deno.readDirSync(dir)) {
    const fullPath = `${dir}/${entry.name}`;
    if (entry.isDirectory) {
      fixDtsImports(fullPath);
    } else if (entry.name.endsWith(".d.ts")) {
      const content = Deno.readTextFileSync(fullPath);
      // Replace .ts imports with .js (but not .d.ts)
      const updated = content.replace(
        /from\s*["']([^"']+)(?<!\.d)\.ts["']/g,
        'from "$1.js"',
      );
      if (updated !== content) {
        Deno.writeTextFileSync(fullPath, updated);
      }
    }
  }
}

fixDtsImports("dist");
