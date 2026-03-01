import { test, expect } from "./fixtures";

test.describe("Transliteration", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`file://${__dirname}/test-page.html`);
    await page.waitForTimeout(500);
  });

  test("transliterates 'namaste' to Devanagari in text input", async ({ page }) => {
    const input = page.locator("#text-input");
    await input.click();
    for (const ch of "namaste") {
      await page.keyboard.press(ch, { delay: 30 });
    }
    await page.keyboard.press("Space");
    const value = await input.inputValue();
    expect(value.trim()).toContain("नमस्ते");
  });

  test("transliterates in textarea", async ({ page }) => {
    const textarea = page.locator("#textarea");
    await textarea.click();
    for (const ch of "kaam") {
      await page.keyboard.press(ch, { delay: 30 });
    }
    await page.keyboard.press("Space");
    const value = await textarea.inputValue();
    expect(value.trim()).toContain("काम");
  });

  test("transliterates in contenteditable", async ({ page }) => {
    const div = page.locator("#contenteditable");
    await div.click();
    for (const ch of "bharat") {
      await page.keyboard.press(ch, { delay: 30 });
    }
    await page.keyboard.press("Space");
    const text = await div.textContent();
    expect(text?.trim()).toContain("भरत");
  });

  test("candidate selection with number keys", async ({ page }) => {
    const input = page.locator("#text-input");
    await input.click();
    await page.keyboard.press("k", { delay: 30 });
    await page.keyboard.press("1");
    const value = await input.inputValue();
    expect(value).toContain("क");
  });

  test("escape cancels composition", async ({ page }) => {
    const input = page.locator("#text-input");
    await input.click();
    await page.keyboard.press("k", { delay: 30 });
    await page.keyboard.press("Escape");
    const value = await input.inputValue();
    expect(value).toBe("");
  });

  test("backspace removes last character from buffer", async ({ page }) => {
    const input = page.locator("#text-input");
    await input.click();
    await page.keyboard.press("k", { delay: 30 });
    await page.keyboard.press("a", { delay: 30 });
    await page.keyboard.press("Backspace", { delay: 30 });
    await page.keyboard.press("Space");
    const value = await input.inputValue();
    expect(value.trim()).toContain("क");
  });
});
