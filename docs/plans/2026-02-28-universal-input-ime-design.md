# Universal Input + Status Indicator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Hindi transliteration work on all input types (standard fields, contenteditable, rich editors, iframes) with a visible status indicator for toggling modes.

**Architecture:** Wrap text injection in Composition Event lifecycle so IME-aware editors (Google Docs, Notion, Slate) process our input naturally. Expand field detection to catch `role="textbox"` and nested editable elements. Add a Shadow DOM status indicator that shows current mode near the active field.

**Tech Stack:** TypeScript, Chrome Extension MV3, Playwright for e2e testing, Vite + @crxjs/vite-plugin for builds.

---

### Task 1: Install Playwright and Create Config

**Files:**
- Modify: `package.json`
- Create: `playwright.config.ts`

**Step 1: Install Playwright**

Run: `npm install -D @playwright/test`
Then: `npx playwright install chromium`

**Step 2: Create Playwright config**

```typescript
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: 0,
  use: {
    browserName: "chromium",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
```

**Step 3: Add test script to package.json**

Add to `"scripts"`:
```json
"test:e2e": "npx playwright test",
"build:ext": "vite build"
```

**Step 4: Commit**

```bash
git add package.json playwright.config.ts package-lock.json
git commit -m "chore: add Playwright and e2e config"
```

---

### Task 2: Create Playwright Test Fixtures and Test Page

**Files:**
- Create: `tests/e2e/fixtures.ts`
- Create: `tests/e2e/test-page.html`

**Step 1: Create the test fixture that loads the extension**

```typescript
// tests/e2e/fixtures.ts
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
```

**Step 2: Create the test page with various input types**

```html
<!-- tests/e2e/test-page.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Hindi Typing Test Page</title>
  <style>
    body { font-family: sans-serif; padding: 20px; }
    .field { margin: 16px 0; }
    label { display: block; font-weight: bold; margin-bottom: 4px; }
    input, textarea { width: 300px; padding: 8px; font-size: 16px; }
    [contenteditable] {
      border: 1px solid #ccc; padding: 8px; min-height: 40px;
      width: 300px; font-size: 16px;
    }
    [role="textbox"] {
      border: 1px solid #999; padding: 8px; min-height: 40px;
      width: 300px; font-size: 16px; outline: none;
    }
    iframe { border: 1px solid #ccc; width: 320px; height: 80px; }
  </style>
</head>
<body>
  <h1>Hindi Typing — Test Page</h1>

  <div class="field">
    <label for="text-input">Standard Text Input</label>
    <input type="text" id="text-input" placeholder="Type here...">
  </div>

  <div class="field">
    <label for="textarea">Textarea</label>
    <textarea id="textarea" rows="3" placeholder="Type here..."></textarea>
  </div>

  <div class="field">
    <label>Contenteditable Div</label>
    <div contenteditable="true" id="contenteditable"></div>
  </div>

  <div class="field">
    <label>Role="textbox" (Rich Editor Simulation)</label>
    <div role="textbox" contenteditable="true" id="rich-editor"
         aria-multiline="true" tabindex="0"></div>
  </div>

  <div class="field">
    <label>Iframe Input</label>
    <iframe id="iframe-test" srcdoc='
      <!DOCTYPE html>
      <html><body style="margin:8px">
        <input type="text" id="iframe-input"
               style="width:280px;padding:8px;font-size:16px"
               placeholder="Type in iframe...">
      </body></html>
    '></iframe>
  </div>

  <div class="field">
    <label for="search-input">Search Input</label>
    <input type="search" id="search-input" placeholder="Search...">
  </div>

  <div class="field">
    <label for="email-input">Email Input (should NOT transliterate)</label>
    <input type="email" id="email-input" placeholder="email@example.com">
  </div>
</body>
</html>
```

**Step 3: Commit**

```bash
git add tests/e2e/fixtures.ts tests/e2e/test-page.html
git commit -m "test: add Playwright fixtures and test page"
```

---

### Task 3: Write Basic E2E Smoke Test

**Files:**
- Create: `tests/e2e/extension-loads.spec.ts`

**Step 1: Build the extension first**

Run: `npm run build:ext`
Expected: Extension built to `dist/`

**Step 2: Write the failing test**

```typescript
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
```

**Step 3: Run the test**

Run: `npx playwright test tests/e2e/extension-loads.spec.ts`
Expected: Both tests pass (extension loads, content script injects)

**Step 4: Commit**

```bash
git add tests/e2e/extension-loads.spec.ts
git commit -m "test: add e2e smoke test for extension loading"
```

---

### Task 4: Expand Field Detection in FieldInterceptor

**Files:**
- Modify: `src/content/field-interceptor.ts:233-254` (`isTextField` method)
- Modify: `src/content/field-interceptor.ts:101-125` (`handleMutations` method)

**Step 1: Write the failing e2e test**

```typescript
// tests/e2e/field-detection.spec.ts
import { test, expect } from "./fixtures";

test.describe("Field detection", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`file://${__dirname}/test-page.html`);
    await page.waitForTimeout(500);
  });

  test("detects standard text input", async ({ page }) => {
    const input = page.locator("#text-input");
    await input.click();
    // Type a Roman character — if intercepted, it won't appear as-is
    await page.keyboard.type("k", { delay: 50 });
    // The field should contain Devanagari, not "k"
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
```

**Step 2: Run test to verify role=textbox fails**

Run: `npm run build:ext && npx playwright test tests/e2e/field-detection.spec.ts`
Expected: `role=textbox` test fails (not currently detected by `isTextField`)

**Step 3: Expand `isTextField` in field-interceptor.ts**

Replace the `isTextField` method at line 233:

```typescript
/** Check if an element is a text input field. */
private isTextField(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();

  if (tag === "textarea") return true;

  if (tag === "input") {
    const type = (el as HTMLInputElement).type.toLowerCase();
    return (
      type === "text" ||
      type === "search" ||
      type === "url" ||
      type === "" // no type attribute defaults to text
    );
  }

  // contenteditable
  const ce = el.getAttribute("contenteditable");
  if (ce === "true" || ce === "") return true;

  // ARIA role-based detection (Slate, ProseMirror, Notion, etc.)
  const role = el.getAttribute("role");
  if (role === "textbox" || role === "combobox") return true;

  // Check if element has a contenteditable ancestor and is focusable
  if (el.isContentEditable) return true;

  return false;
}
```

Also update the `handleMutations` querySelector at line 112-113 to include role-based selectors:

```typescript
const fields = node.querySelectorAll(
  'input[type="text"], input:not([type]), textarea, ' +
  '[contenteditable="true"], [contenteditable=""], ' +
  '[role="textbox"], [role="combobox"]'
);
```

**Step 4: Rebuild and run test**

Run: `npm run build:ext && npx playwright test tests/e2e/field-detection.spec.ts`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/content/field-interceptor.ts tests/e2e/field-detection.spec.ts
git commit -m "feat: expand field detection to support role=textbox and isContentEditable"
```

---

### Task 5: Add Composition Event Lifecycle to TextInjector

**Files:**
- Modify: `src/content/text-injector.ts`

This is the core change. We wrap text insertion operations in Composition Event lifecycle so IME-aware editors (Google Docs, Notion, Slack) handle our input correctly. The actual text insertion still uses `execCommand` as primary, with fallbacks.

**Step 1: Add composition lifecycle methods to TextInjector**

Add these new methods to the `TextInjector` class:

```typescript
// Add to top of class
private composing = false;

/** Begin a composition session. Call before the first preview insert. */
startComposition(field: HTMLElement): void {
  if (this.composing) return;
  this.composing = true;
  field.dispatchEvent(
    new CompositionEvent("compositionstart", { bubbles: true, data: "" })
  );
}

/** Update the composition preview — replaces previous preview text. */
updateComposition(
  field: HTMLElement,
  text: string,
  previousLength: number
): void {
  if (!this.composing) this.startComposition(field);

  field.dispatchEvent(
    new CompositionEvent("compositionupdate", { bubbles: true, data: text })
  );

  if (previousLength > 0) {
    this.replaceBeforeCursor(field, previousLength, text);
  } else {
    this.insert(field, text);
  }
}

/** End composition — commit the final text. */
endComposition(
  field: HTMLElement,
  text: string,
  previousLength: number
): void {
  if (!this.composing) return;

  if (previousLength > 0) {
    this.replaceBeforeCursor(field, previousLength, text);
  }

  field.dispatchEvent(
    new CompositionEvent("compositionend", { bubbles: true, data: text })
  );
  this.composing = false;
}

/** Cancel composition — remove preview text. */
cancelComposition(field: HTMLElement, previousLength: number): void {
  if (!this.composing) return;

  if (previousLength > 0) {
    this.deleteBeforeCursor(field, previousLength);
  }

  field.dispatchEvent(
    new CompositionEvent("compositionend", { bubbles: true, data: "" })
  );
  this.composing = false;
}

isComposing(): boolean {
  return this.composing;
}
```

**Step 2: Update CompositionManager to use composition lifecycle**

In `src/content/composition-manager.ts`, replace direct `insert`/`replaceBeforeCursor`/`deleteBeforeCursor` calls with composition lifecycle calls.

In `handleChar` (around line 94):
```typescript
private handleChar(char: string, field: HTMLElement): void {
  if (this.state.status === "IDLE") {
    this.state.status = "COMPOSING";
    this.state.romanBuffer = "";
    this.state.committedText = "";
    this.previewLength = 0;
    this.callbacks.onComposingChange(true);
  }

  this.state.romanBuffer += char;
  const result = this.transliterator.process(this.state.romanBuffer);
  const newPreview = result.topCandidate;

  // Use composition lifecycle
  this.injector.updateComposition(field, newPreview, this.previewLength);

  this.previewLength = this.graphemeLength(newPreview);
  this.state.devanagariPreview = newPreview;

  const candidates = rankCandidates(result.candidates, this.maxCandidates);
  this.state.candidates = candidates;
  this.state.selectedIndex = 0;
  this.callbacks.onCandidatesUpdate(candidates, 0);
}
```

In `handleBackspace` (around line 134):
```typescript
private handleBackspace(field: HTMLElement): void {
  if (this.state.status !== "COMPOSING") return;

  if (this.state.romanBuffer.length <= 1) {
    this.injector.cancelComposition(field, this.previewLength);
    this.resetState();
    return;
  }

  this.state.romanBuffer = this.state.romanBuffer.slice(0, -1);
  const result = this.transliterator.process(this.state.romanBuffer);
  const newPreview = result.topCandidate;

  this.injector.updateComposition(field, newPreview, this.previewLength);

  this.previewLength = this.graphemeLength(newPreview);
  this.state.devanagariPreview = newPreview;

  const candidates = rankCandidates(result.candidates, this.maxCandidates);
  this.state.candidates = candidates;
  this.state.selectedIndex = 0;
  this.callbacks.onCandidatesUpdate(candidates, 0);
}
```

In `commitTopCandidate` (around line 169):
```typescript
private commitTopCandidate(field: HTMLElement): void {
  if (this.state.status !== "COMPOSING") return;

  const candidate = this.state.candidates[this.state.selectedIndex];
  if (candidate) {
    this.injector.endComposition(field, candidate.text, this.previewLength);
  } else {
    this.injector.endComposition(
      field,
      this.state.devanagariPreview,
      this.previewLength
    );
  }

  this.resetState();
}
```

In `cancelComposition` (around line 220):
```typescript
private cancelComposition(field: HTMLElement): void {
  if (this.state.status !== "COMPOSING") return;
  this.injector.cancelComposition(field, this.previewLength);
  this.resetState();
}
```

**Step 3: Update the mock in composition-manager.test.ts**

Update the mock `TextInjector` in `tests/content/composition-manager.test.ts` to include the new methods:

```typescript
vi.mock("../../src/content/text-injector", () => {
  return {
    TextInjector: class {
      private buffer = "";
      private composing = false;
      insert(_field: HTMLElement, text: string) {
        this.buffer += text;
      }
      replaceBeforeCursor(_field: HTMLElement, _deleteCount: number, text: string) {
        this.buffer = text;
      }
      deleteBeforeCursor(_field: HTMLElement, _count: number) {
        this.buffer = "";
      }
      startComposition(_field: HTMLElement) {
        this.composing = true;
      }
      updateComposition(_field: HTMLElement, text: string, previousLength: number) {
        if (previousLength > 0) {
          this.buffer = text;
        } else {
          this.buffer += text;
        }
        this.composing = true;
      }
      endComposition(_field: HTMLElement, _text: string, _previousLength: number) {
        this.composing = false;
      }
      cancelComposition(_field: HTMLElement, _previousLength: number) {
        this.buffer = "";
        this.composing = false;
      }
      isComposing() {
        return this.composing;
      }
    },
  };
});
```

**Step 4: Run unit tests to verify nothing broke**

Run: `npm run test`
Expected: All existing tests pass

**Step 5: Rebuild and run e2e tests**

Run: `npm run build:ext && npx playwright test tests/e2e/field-detection.spec.ts`
Expected: All tests pass

**Step 6: Commit**

```bash
git add src/content/text-injector.ts src/content/composition-manager.ts tests/content/composition-manager.test.ts
git commit -m "feat: add Composition Event lifecycle to TextInjector for IME-aware editors"
```

---

### Task 6: Create Status Indicator Component

**Files:**
- Create: `src/content/status-indicator.ts`

**Step 1: Write the failing e2e test**

```typescript
// tests/e2e/status-indicator.spec.ts
import { test, expect } from "./fixtures";

test.describe("Status indicator", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`file://${__dirname}/test-page.html`);
    await page.waitForTimeout(500);
  });

  test("shows indicator when field is focused", async ({ page }) => {
    await page.locator("#text-input").click();
    // The indicator host should exist in the DOM
    const indicator = page.locator("#hindi-typing-indicator");
    await expect(indicator).toBeAttached();
  });

  test("shows Hindi mode by default", async ({ page }) => {
    await page.locator("#text-input").click();
    // Check shadow DOM content via evaluate
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
    // Wait for fade timeout (2s) + animation
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
```

**Step 2: Run test to verify it fails**

Run: `npm run build:ext && npx playwright test tests/e2e/status-indicator.spec.ts`
Expected: FAIL — no indicator element exists yet

**Step 3: Create StatusIndicator component**

```typescript
// src/content/status-indicator.ts
import { CANDIDATE_STRIP_Z_INDEX } from "../shared/constants";

/**
 * Small pill that shows the current input mode (Hindi/English)
 * near the active text field. Uses Shadow DOM for style isolation.
 *
 * Appears on field focus and on toggle, auto-fades after 2 seconds.
 */
export class StatusIndicator {
  private host: HTMLDivElement;
  private shadow: ShadowRoot;
  private pill: HTMLDivElement;
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;
  private enabled = true;

  constructor() {
    this.host = document.createElement("div");
    this.host.id = "hindi-typing-indicator";
    this.host.style.position = "fixed";
    this.host.style.zIndex = String(CANDIDATE_STRIP_Z_INDEX - 1);
    this.host.style.pointerEvents = "none";
    this.host.style.top = "0";
    this.host.style.left = "0";
    this.host.style.width = "0";
    this.host.style.height = "0";

    this.shadow = this.host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = this.getStyles();
    this.shadow.appendChild(style);

    this.pill = document.createElement("div");
    this.pill.className = "indicator-pill active";
    this.pill.textContent = "हि";
    this.shadow.appendChild(this.pill);

    document.body.appendChild(this.host);
  }

  /** Show the indicator near the given field. */
  show(field: HTMLElement): void {
    const rect = field.getBoundingClientRect();
    this.pill.style.position = "fixed";
    this.pill.style.top = `${rect.bottom - 24}px`;
    this.pill.style.left = `${rect.right - 36}px`;
    this.pill.style.opacity = "1";
    this.pill.style.display = "flex";
    this.startFadeTimer();
  }

  /** Hide the indicator immediately. */
  hide(): void {
    this.pill.style.display = "none";
    this.clearFadeTimer();
  }

  /** Update the displayed mode. */
  setMode(hindiActive: boolean): void {
    this.enabled = hindiActive;
    this.pill.textContent = hindiActive ? "हि" : "EN";
    this.pill.className = `indicator-pill ${hindiActive ? "active" : "inactive"}`;
    // Show briefly on toggle
    this.pill.style.opacity = "1";
    this.pill.style.display = "flex";
    this.startFadeTimer();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  destroy(): void {
    this.clearFadeTimer();
    this.host.remove();
  }

  private startFadeTimer(): void {
    this.clearFadeTimer();
    this.fadeTimer = setTimeout(() => {
      this.pill.style.opacity = "0";
    }, 2000);
  }

  private clearFadeTimer(): void {
    if (this.fadeTimer) {
      clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
    }
  }

  private getStyles(): string {
    return `
      .indicator-pill {
        display: none;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 20px;
        border-radius: 10px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 11px;
        font-weight: 700;
        color: white;
        transition: opacity 0.3s ease;
        user-select: none;
        pointer-events: none;
      }
      .indicator-pill.active {
        background: #4CAF50;
      }
      .indicator-pill.inactive {
        background: #9E9E9E;
      }
    `;
  }
}
```

**Step 4: Rebuild and run test**

Run: `npm run build:ext && npx playwright test tests/e2e/status-indicator.spec.ts`
Expected: Still fails — not yet wired into content-script.ts

**Step 5: Commit (partial — component only)**

```bash
git add src/content/status-indicator.ts tests/e2e/status-indicator.spec.ts
git commit -m "feat: add StatusIndicator component with Shadow DOM"
```

---

### Task 7: Integrate Status Indicator into Content Script

**Files:**
- Modify: `src/content/content-script.ts`

**Step 1: Import and wire StatusIndicator**

Update `content-script.ts` `setupTransliteration` function. Add `StatusIndicator` import at top:

```typescript
import { StatusIndicator } from "./status-indicator";
```

Inside `setupTransliteration`, create the indicator after the candidate strip:

```typescript
function setupTransliteration(prefs: UserPreferences): void {
  const rules: TransliterationRules = { /* ...existing... */ };
  const candidateStrip = new CandidateStrip();
  const statusIndicator = new StatusIndicator();
  statusIndicator.setMode(prefs.enabled);

  const compositionManager = new CompositionManager(
    rules,
    {
      onCandidatesUpdate: (candidates, selectedIndex) => {
        candidateStrip.update(candidates, selectedIndex);
        if (candidates.length > 0) {
          const field = fieldInterceptor.getActiveField();
          if (field) {
            candidateStrip.show(field);
          }
        }
      },
      onCompositionEnd: () => {
        candidateStrip.hide();
      },
      onComposingChange: (composing) => {
        fieldInterceptor.setComposing(composing);
      },
    },
    prefs.maxCandidates
  );

  candidateStrip.onSelect((index) => {
    const field = fieldInterceptor.getActiveField();
    if (field) {
      compositionManager.handleAction({ type: "select", index }, field);
    }
  });

  const fieldInterceptor = new FieldInterceptor({
    onKeyAction: (action, field) => {
      compositionManager.handleAction(action, field);
    },
    onFieldFocus: (field) => {
      statusIndicator.show(field);
    },
    onFieldBlur: () => {
      candidateStrip.hide();
      statusIndicator.hide();
    },
  });

  fieldInterceptor.start();
  listenForToggle(fieldInterceptor, candidateStrip, compositionManager, statusIndicator);
}
```

Update `listenForToggle` signature:

```typescript
function listenForToggle(
  interceptor: FieldInterceptor | null,
  strip: CandidateStrip | null,
  _manager: CompositionManager | null,
  indicator: StatusIndicator | null
): void {
  chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
    if (message.type === "TOGGLE_TRANSLITERATION") {
      if (message.enabled && !interceptor) {
        setupTransliteration(DEFAULT_PREFERENCES);
      } else if (interceptor) {
        interceptor.setEnabled(message.enabled ?? true);
        indicator?.setMode(message.enabled ?? true);
        if (!message.enabled) {
          strip?.hide();
        }
      }
    }
  });
}
```

Update the initial call in `init()` (when disabled):

```typescript
if (!prefs.enabled) {
  listenForToggle(null, null, null, null);
  return;
}
```

**Step 2: Rebuild and run tests**

Run: `npm run build:ext && npx playwright test`
Expected: All e2e tests pass including status indicator tests

**Step 3: Run unit tests to ensure no regression**

Run: `npm run test`
Expected: All unit tests pass

**Step 4: Commit**

```bash
git add src/content/content-script.ts
git commit -m "feat: integrate StatusIndicator into content script with toggle support"
```

---

### Task 8: Write E2E Tests for Toggle and Transliteration

**Files:**
- Create: `tests/e2e/transliteration.spec.ts`
- Create: `tests/e2e/toggle.spec.ts`

**Step 1: Write transliteration e2e tests**

```typescript
// tests/e2e/transliteration.spec.ts
import { test, expect } from "./fixtures";

test.describe("Transliteration", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`file://${__dirname}/test-page.html`);
    await page.waitForTimeout(500);
  });

  test("transliterates 'namaste' to Devanagari in text input", async ({ page }) => {
    const input = page.locator("#text-input");
    await input.click();
    // Type each character with delay to allow composition
    for (const ch of "namaste") {
      await page.keyboard.press(ch, { delay: 30 });
    }
    // Press space to commit
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
    // Candidates should be showing — press 1 to select first
    await page.keyboard.press("1");
    const value = await input.inputValue();
    // Should have committed the first candidate (क)
    expect(value).toContain("क");
  });

  test("escape cancels composition", async ({ page }) => {
    const input = page.locator("#text-input");
    await input.click();
    await page.keyboard.press("k", { delay: 30 });
    await page.keyboard.press("Escape");
    const value = await input.inputValue();
    // Composition cancelled — field should be empty
    expect(value).toBe("");
  });

  test("backspace removes last character from buffer", async ({ page }) => {
    const input = page.locator("#text-input");
    await input.click();
    await page.keyboard.press("k", { delay: 30 });
    await page.keyboard.press("a", { delay: 30 });
    await page.keyboard.press("Backspace", { delay: 30 });
    // Buffer is now just "k", preview should be क
    await page.keyboard.press("Space");
    const value = await input.inputValue();
    expect(value.trim()).toContain("क");
  });
});
```

**Step 2: Write toggle e2e tests**

```typescript
// tests/e2e/toggle.spec.ts
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
```

**Step 3: Run all e2e tests**

Run: `npm run build:ext && npx playwright test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add tests/e2e/transliteration.spec.ts tests/e2e/toggle.spec.ts
git commit -m "test: add e2e tests for transliteration, candidate selection, and toggle"
```

---

### Task 9: Verify Everything Works End-to-End

**Step 1: Run all unit tests**

Run: `npm run test`
Expected: All unit tests pass

**Step 2: Build the extension**

Run: `npm run build:ext`
Expected: Clean build, no errors

**Step 3: Run all e2e tests**

Run: `npx playwright test`
Expected: All e2e tests pass

**Step 4: Manual verification**

Load the extension manually in Chrome (`chrome://extensions` → Load unpacked → select `dist/`):
1. Open a page with text inputs — verify transliteration works
2. Try `Alt+Shift+H` — verify toggle + indicator
3. Open a contenteditable-based app (e.g. Gmail compose) — verify it works
4. Try a page with iframes — verify cross-frame works

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: universal input support with IME composition, status indicator, and e2e tests"
```
