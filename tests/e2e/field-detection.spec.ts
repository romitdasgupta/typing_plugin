import { test, expect } from "./fixtures";

test.describe("Field detection", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`file://${__dirname}/test-page.html`);
    await page.waitForTimeout(500);
  });

  test("detects standard text input", async ({ page }) => {
    const input = page.locator("#text-input");
    await input.click();
    await page.keyboard.type("k", { delay: 50 });
    const value = await input.inputValue();
    expect(value).not.toBe("k");
    expect(value).toContain("क");
  });

  test("detects textarea", async ({ page }) => {
    const textarea = page.locator("#textarea");
    await textarea.click();
    await page.keyboard.type("k", { delay: 50 });
    const value = await textarea.inputValue();
    expect(value).not.toBe("k");
    expect(value).toContain("क");
  });

  test("detects contenteditable", async ({ page }) => {
    const div = page.locator("#contenteditable");
    await div.click();
    await page.keyboard.type("k", { delay: 50 });
    const text = await div.textContent();
    expect(text).toContain("क");
  });

  test("detects role=textbox", async ({ page }) => {
    const editor = page.locator("#rich-editor");
    await editor.click();
    await page.keyboard.type("k", { delay: 50 });
    const text = await editor.textContent();
    expect(text).toContain("क");
  });

  test("detects input inside iframe", async ({ page }) => {
    const iframe = page.frameLocator("#iframe-test");
    const input = iframe.locator("#iframe-input");
    await input.click();
    await page.keyboard.type("k", { delay: 50 });
    const value = await input.inputValue();
    expect(value).not.toBe("k");
    expect(value).toContain("क");
  });
});
