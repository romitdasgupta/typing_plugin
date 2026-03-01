import { test as base, chromium, type BrowserContext, type Page } from "@playwright/test";
import path from "path";

// Path to built extension
const EXTENSION_PATH = path.join(__dirname, "..", "..", "dist");

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
  page: Page;
}>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        "--no-first-run",
        "--disable-default-apps",
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent("serviceworker");
    }
    const extensionId = background.url().split("/")[2];
    await use(extensionId);
  },
  page: async ({ context }, use) => {
    const page = await context.newPage();
    await use(page);
  },
});

export const expect = test.expect;
