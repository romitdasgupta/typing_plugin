import { test, expect, TEST_PAGE_URL } from "./fixtures";

test.describe("Toggle", () => {
  test("popup toggle turns off transliteration", async ({ page, extensionId }) => {
    // Use the popup to toggle off
    const popup = await page.context().newPage();
    await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
    await popup.waitForTimeout(500);
    // Click the visible slider (the checkbox itself is hidden)
    await popup.locator(".toggle-switch").first().click();
    await popup.waitForTimeout(200);
    await popup.close();

    // Navigate to test page
    await page.goto(TEST_PAGE_URL);
    await page.waitForTimeout(500);

    const input = page.locator("#text-input");
    await input.click();
    await page.keyboard.type("hello");
    const value = await input.inputValue();
    expect(value).toBe("hello");
  });

  test("popup toggle turns transliteration back on", async ({ page, extensionId }) => {
    // Toggle off via popup
    const popup = await page.context().newPage();
    await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
    await popup.waitForTimeout(500);
    await popup.locator(".toggle-switch").first().click();
    await popup.waitForTimeout(200);
    // Toggle back on
    await popup.locator(".toggle-switch").first().click();
    await popup.waitForTimeout(200);
    await popup.close();

    // Navigate to test page
    await page.goto(TEST_PAGE_URL);
    await page.waitForTimeout(500);

    const input = page.locator("#text-input");
    await input.click();
    await page.keyboard.press("k", { delay: 30 });
    await page.keyboard.press("Space");
    const value = await input.inputValue();
    expect(value.trim()).toContain("क");
  });
});
