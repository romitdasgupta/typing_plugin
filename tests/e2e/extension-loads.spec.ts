import { test, expect, TEST_PAGE_URL } from "./fixtures";

test("extension service worker is running", async ({ extensionId }) => {
  expect(extensionId).toBeTruthy();
  expect(extensionId.length).toBeGreaterThan(0);
});

test("extension loads content script on test page", async ({ page }) => {
  await page.goto(TEST_PAGE_URL);
  await page.waitForTimeout(1000);

  const candidateHost = await page.locator("#hindi-typing-candidates").count();
  expect(candidateHost).toBe(1);
});
