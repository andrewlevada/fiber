import { callContentScript, expect, test } from "../fixtures.ts";

test.describe("Overlay Rendering", () => {
  test("should attach overlay with Shadow DOM", async ({ context }) => {
    const page = await context.newPage();
    await page.goto("https://example.com");

    await expect(page.locator('html[data-fiber-loaded="true"]')).toBeAttached();

    await callContentScript(page, "attachOverlay");

    await expect(page.locator("[data-fiber-overlay]")).toBeAttached();
    await expect(page.getByTestId("fiber-overlay-content")).toBeVisible();
    await expect(page.getByText("Fiber Overlay Test")).toBeVisible();
  });

  test("should handle overlay button interactions", async ({ context }) => {
    const page = await context.newPage();
    await page.goto("https://example.com");

    await expect(page.locator('html[data-fiber-loaded="true"]')).toBeAttached();

    await callContentScript(page, "attachOverlay");

    const button = page.getByTestId("overlay-button");
    await expect(button).toBeVisible();
    await button.click();
  });

  test("should hide overlay", async ({ context }) => {
    const page = await context.newPage();
    await page.goto("https://example.com");

    await expect(page.locator('html[data-fiber-loaded="true"]')).toBeAttached();

    await callContentScript(page, "attachOverlay");
    await expect(page.locator("[data-fiber-overlay]")).toBeVisible();

    await callContentScript(page, "detachOverlay");
    await expect(page.locator("[data-fiber-overlay]")).not.toBeVisible();
  });

  test("should allow calling show multiple times", async ({ context }) => {
    const page = await context.newPage();
    await page.goto("https://example.com");

    await expect(page.locator('html[data-fiber-loaded="true"]')).toBeAttached();

    await callContentScript(page, "attachOverlay");
    await expect(page.getByText("Fiber Overlay Test")).toBeVisible();

    // Calling show again should work without throwing
    await callContentScript(page, "attachOverlay");
    await expect(page.getByText("Fiber Overlay Test")).toBeVisible();
  });
});
