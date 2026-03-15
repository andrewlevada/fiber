import {
  type BrowserContext,
  chromium,
  type Page,
  test as base,
  type Worker,
} from "@playwright/test";
import path from "path";

export interface ExtensionFixtures {
  context: BrowserContext;
  extensionId: string;
  serviceWorker: Worker;
}

/**
 * Helper to call content script functions via custom events.
 * Content scripts run in isolated context, so we use events to communicate.
 */
export function callContentScript(
  page: Page,
  command: string,
  ...args: unknown[]
): Promise<unknown> {
  return page.evaluate(
    ({ command, args }) => {
      return new Promise((resolve, reject) => {
        const id = Math.random().toString(36).slice(2);

        const handler = (e: Event) => {
          const { id: responseId, result, error } = (e as CustomEvent).detail;
          if (responseId !== id) return;
          globalThis.removeEventListener("fiber-test-response", handler);
          if (error) reject(new Error(error));
          else resolve(result);
        };

        globalThis.addEventListener("fiber-test-response", handler);
        globalThis.dispatchEvent(
          new CustomEvent("fiber-test-command", {
            detail: { command, args, id },
          }),
        );

        // Timeout after 10 seconds
        setTimeout(() => {
          globalThis.removeEventListener("fiber-test-response", handler);
          reject(new Error(`Timeout waiting for ${command}`));
        }, 10000);
      });
    },
    { command, args },
  );
}

export const test = base.extend<ExtensionFixtures>({
  context: async (_, use) => {
    const pathToExtension = path.join(
      import.meta.dirname,
      "fixtures/test-extension/dist",
    );
    const context = await chromium.launchPersistentContext("", {
      headless: false,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });
    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent("serviceworker");
    }
    const extensionId = serviceWorker.url().split("/")[2];
    await use(extensionId);
  },

  serviceWorker: async ({ context }, use) => {
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent("serviceworker");
    }
    await use(serviceWorker);
  },
});

export { expect } from "@playwright/test";
