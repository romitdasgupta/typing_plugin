import { test, expect } from "./fixtures";

test.describe("Toggle", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`file://${__dirname}/test-page.html`);
    await page.waitForTimeout(500);
  });

  test("Alt+Shift+H toggles transliteration off", async ({ page }) => {
    const input = page.locator("#text-input");
    await input.click();

    // Toggle off
    await page.keyboard.press("Alt+Shift+KeyH");
    await page.waitForTimeout(200);

    // Now typing should produce Roman characters
    await page.keyboard.type("hello");
    const value = await input.inputValue();
    expect(value).toBe("hello");
  });

  test("Alt+Shift+H toggles back on", async ({ page }) => {
    const input = page.locator("#text-input");
    await input.click();

    // Toggle off then on
    await page.keyboard.press("Alt+Shift+KeyH");
    await page.waitForTimeout(200);
    await page.keyboard.press("Alt+Shift+KeyH");
    await page.waitForTimeout(200);

    // Should transliterate again
    await page.keyboard.press("k", { delay: 30 });
    await page.keyboard.press("Space");
    const value = await input.inputValue();
    expect(value.trim()).toContain("क");
  });
});
