// tests/e2e/extension-loads.spec.ts
import { test, expect } from "./fixtures";

test("extension service worker is running", async ({ extensionId }) => {
  expect(extensionId).toBeTruthy();
  expect(extensionId.length).toBeGreaterThan(0);
});

test("extension loads content script on test page", async ({ page }) => {
  // Serve the test page
  await page.goto(`file://${__dirname}/test-page.html`);
  await page.waitForTimeout(1000); // Wait for content script injection

  // The content script should have injected the candidate strip host element
  const candidateHost = await page.locator("#hindi-typing-candidates").count();
  expect(candidateHost).toBe(1);
});
