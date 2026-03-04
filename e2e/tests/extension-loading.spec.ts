import { test, expect, callContentScript } from '../fixtures';

test.describe('Extension Loading', () => {
  test('should load extension and inject content script', async ({ context, extensionId }) => {
    expect(extensionId).toBeTruthy();
    expect(extensionId).toMatch(/^[a-z]{32}$/);

    const page = await context.newPage();
    await page.goto('https://example.com');

    await expect(page.locator('html[data-fiber-loaded="true"]')).toBeAttached({
      timeout: 5000,
    });
  });

  test('should have service worker running', async ({ serviceWorker }) => {
    expect(serviceWorker).toBeTruthy();
    expect(serviceWorker.url()).toContain('background.js');
  });

  test('content script should respond to test commands', async ({ context }) => {
    const page = await context.newPage();
    await page.goto('https://example.com');

    await expect(page.locator('html[data-fiber-loaded="true"]')).toBeAttached();

    // Test that content script responds via custom events
    const result = await callContentScript(page, 'testRpc');
    expect(Array.isArray(result)).toBe(true);
  });
});
