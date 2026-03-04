import { test, expect, callContentScript } from '../fixtures';

test.describe('RPC Communication', () => {
  test('should communicate with background via ext.tabs.query', async ({ context }) => {
    const page = await context.newPage();
    await page.goto('https://example.com');

    await expect(page.locator('html[data-fiber-loaded="true"]')).toBeAttached();

    const tabs = await callContentScript(page, 'testRpc') as Array<{ id: number; url: string }>;

    expect(Array.isArray(tabs)).toBe(true);
    expect(tabs.length).toBeGreaterThan(0);
    expect(tabs[0]).toHaveProperty('id');
    expect(tabs[0]).toHaveProperty('url');
  });

  test('should handle storage operations via RPC', async ({ context }) => {
    const page = await context.newPage();
    await page.goto('https://example.com');

    await expect(page.locator('html[data-fiber-loaded="true"]')).toBeAttached();

    const result = await callContentScript(page, 'testStorage');

    expect(result).toEqual({ testKey: 'testValue' });
  });
});
