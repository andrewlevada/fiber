#!/usr/bin/env node
import { execSync } from 'child_process';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const testsDir = join(__dirname, 'tests');

// Get all test files sorted alphabetically
const testFiles = readdirSync(testsDir)
  .filter(f => f.endsWith('.spec.ts'))
  .sort();

const args = process.argv.slice(2);

if (args.includes('--list') || args.includes('-l')) {
  console.log('Available tests:');
  testFiles.forEach((f, i) => console.log(`  ${i + 1}. ${f.replace('.spec.ts', '')}`));
  process.exit(0);
}

// If no args, run all tests
if (args.length === 0) {
  execSync('pnpm playwright test --config=e2e/playwright.config.ts', { stdio: 'inherit' });
  process.exit(0);
}

// Map numbers to test files
const selectedFiles = args
  .map(arg => {
    const num = parseInt(arg, 10);
    if (isNaN(num) || num < 1 || num > testFiles.length) {
      console.error(`Invalid test number: ${arg}. Use --list to see available tests.`);
      process.exit(1);
    }
    return testFiles[num - 1];
  })
  .map(f => `e2e/tests/${f}`);

const cmd = `pnpm playwright test --config=e2e/playwright.config.ts ${selectedFiles.join(' ')}`;
execSync(cmd, { stdio: 'inherit' });
