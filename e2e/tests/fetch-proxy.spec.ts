import { test, expect, callContentScript } from '../fixtures';

test.describe('Fetch Proxy', () => {
  test('should fetch data through background script', async ({ context }) => {
    const page = await context.newPage();
    await page.goto('https://example.com');

    await expect(page.locator('html[data-fiber-loaded="true"]')).toBeAttached();

    const result = await callContentScript(page, 'testFetch', 'https://httpbin.org/get') as {
      ok: boolean;
      status: number;
      body: string;
    };

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.body).toContain('httpbin.org');
  });

  test('should handle fetch errors', async ({ context }) => {
    const page = await context.newPage();
    await page.goto('https://example.com');

    await expect(page.locator('html[data-fiber-loaded="true"]')).toBeAttached();

    const result = await callContentScript(page, 'testFetch', 'https://httpbin.org/status/404') as {
      ok: boolean;
      status: number;
      body: string;
    };

    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
  });

  test('should bypass CORS restrictions', async ({ context }) => {
    const page = await context.newPage();
    await page.goto('https://example.com');

    await expect(page.locator('html[data-fiber-loaded="true"]')).toBeAttached();

    const result = await callContentScript(page, 'testFetch', 'https://api.github.com/zen') as {
      ok: boolean;
      status: number;
      body: string;
    };

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
  });
});
