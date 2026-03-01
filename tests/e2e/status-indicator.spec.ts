import { test, expect } from "./fixtures";

test.describe("Status indicator", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`file://${__dirname}/test-page.html`);
    await page.waitForTimeout(500);
  });

  test("shows indicator when field is focused", async ({ page }) => {
    await page.locator("#text-input").click();
    const indicator = page.locator("#hindi-typing-indicator");
    await expect(indicator).toBeAttached();
  });

  test("shows Hindi mode by default", async ({ page }) => {
    await page.locator("#text-input").click();
    const text = await page.evaluate(() => {
      const host = document.getElementById("hindi-typing-indicator");
      if (!host?.shadowRoot) return "";
      const pill = host.shadowRoot.querySelector(".indicator-pill");
      return pill?.textContent ?? "";
    });
    expect(text).toContain("हि");
  });

  test("indicator fades after timeout", async ({ page }) => {
    await page.locator("#text-input").click();
    await page.waitForTimeout(2500);
    const opacity = await page.evaluate(() => {
      const host = document.getElementById("hindi-typing-indicator");
      if (!host?.shadowRoot) return "1";
      const pill = host.shadowRoot.querySelector(".indicator-pill") as HTMLElement;
      return pill ? getComputedStyle(pill).opacity : "1";
    });
    expect(parseFloat(opacity)).toBeLessThan(0.5);
  });
});
