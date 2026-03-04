import { execSync } from 'child_process';
import path from 'path';

export default async function globalSetup() {
  const testExtensionDir = path.join(import.meta.dirname, 'fixtures/test-extension');

  console.log('[e2e] Building test extension...');
  execSync('pnpm install && pnpm build', {
    cwd: testExtensionDir,
    stdio: 'inherit',
  });
  console.log('[e2e] Test extension built successfully');
}
