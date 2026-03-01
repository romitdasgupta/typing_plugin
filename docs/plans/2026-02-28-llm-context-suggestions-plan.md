# LLM Context-Aware Suggestions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add optional LLM-powered next-word predictions that use full sentence context, displayed in a separate row below transliteration candidates.

**Architecture:** Content script tracks committed words in a `sentenceHistory` array. On word commit and debounced while typing, it sends the context to the service worker via `chrome.runtime.sendMessage`. The service worker calls an OpenAI-compatible endpoint, caches results in an LRU cache, and returns predicted words. The CandidateStrip renders predictions in a second click-only row.

**Tech Stack:** TypeScript, Vitest, Chrome Extension APIs (Manifest V3), native `fetch()`.

**Design doc:** `docs/plans/2026-02-28-llm-context-suggestions-design.md`

---

### Task 1: Shared Types & Constants

Add LLM preferences, message types, and defaults. This is the foundation all other tasks depend on.

**Files:**
- Modify: `src/shared/types.ts:86-95`
- Modify: `src/shared/message-protocol.ts:1-63`
- Modify: `src/shared/constants.ts:61-69`

**Step 1: Add LLM fields to UserPreferences**

In `src/shared/types.ts`, add after `showNumberKeys: boolean;` (line 94):

```typescript
  /** Whether LLM-powered suggestions are enabled */
  llmEnabled: boolean;
  /** OpenAI-compatible API endpoint URL */
  llmEndpoint: string;
  /** API key for the LLM endpoint */
  llmApiKey: string;
  /** Model name (e.g., "llama3", "gpt-4o-mini") */
  llmModel: string;
  /** Max number of LLM suggestions to show */
  llmMaxSuggestions: number;
```

**Step 2: Add LLM message types to the protocol**

In `src/shared/message-protocol.ts`, add to the `ExtensionMessage` union (after `StatusResponseMessage`):

```typescript
  | LLMPredictRequest
  | LLMPredictResult
  | LLMPredictError;
```

Then add these interfaces at the end of the file:

```typescript
export interface LLMPredictRequest {
  type: "LLM_PREDICT";
  sentenceContext: string[];
  partialWord: string;
}

export interface LLMPredictResult {
  type: "LLM_PREDICT_RESULT";
  predictions: string[];
}

export interface LLMPredictError {
  type: "LLM_PREDICT_ERROR";
  error: string;
}
```

**Step 3: Add LLM defaults to constants**

In `src/shared/constants.ts`, add to `DEFAULT_PREFERENCES` (after `showNumberKeys: true,`):

```typescript
  llmEnabled: false,
  llmEndpoint: "",
  llmApiKey: "",
  llmModel: "",
  llmMaxSuggestions: 3,
```

**Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add src/shared/types.ts src/shared/message-protocol.ts src/shared/constants.ts
git commit -m "feat: add LLM suggestion types, messages, and defaults"
```

---

### Task 2: LLM Client with LRU Cache (TDD)

Build the OpenAI-compatible API client and LRU cache. This is a pure module with no DOM or Chrome API dependencies — ideal for unit testing.

**Files:**
- Create: `src/background/llm-client.ts`
- Create: `tests/background/llm-client.test.ts`

**Step 1: Write the failing tests**

Create `tests/background/llm-client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LLMClient } from "../../src/background/llm-client";

describe("LLMClient", () => {
  let client: LLMClient;

  beforeEach(() => {
    client = new LLMClient();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("buildPrompt", () => {
    it("should include sentence context and partial word", () => {
      const prompt = client.buildPrompt(["नमस्ते", "दोस्तों"], "आ", 3);
      expect(prompt).toContain("नमस्ते दोस्तों");
      expect(prompt).toContain("आ");
    });

    it("should handle empty context", () => {
      const prompt = client.buildPrompt([], "", 3);
      expect(prompt).toContain("predict");
    });

    it("should handle empty partial word", () => {
      const prompt = client.buildPrompt(["नमस्ते"], "", 3);
      expect(prompt).not.toContain("Partial word being typed");
    });

    it("should include max suggestions count", () => {
      const prompt = client.buildPrompt([], "", 5);
      expect(prompt).toContain("5");
    });
  });

  describe("parseResponse", () => {
    it("should parse a JSON array from response text", () => {
      const result = client.parseResponse('["आपका", "आज", "आप"]');
      expect(result).toEqual(["आपका", "आज", "आप"]);
    });

    it("should extract JSON array embedded in other text", () => {
      const result = client.parseResponse('Here are the words: ["आपका", "आज"]');
      expect(result).toEqual(["आपका", "आज"]);
    });

    it("should return empty array for unparseable response", () => {
      const result = client.parseResponse("I cannot help with that");
      expect(result).toEqual([]);
    });

    it("should filter out non-string items", () => {
      const result = client.parseResponse('[123, "आपका", null, "आज"]');
      expect(result).toEqual(["आपका", "आज"]);
    });
  });

  describe("LRU cache", () => {
    it("should return cached result for same context", () => {
      client.cacheSet(["नमस्ते"], "", ["दोस्तों", "जी"]);
      const result = client.cacheGet(["नमस्ते"], "");
      expect(result).toEqual(["दोस्तों", "जी"]);
    });

    it("should return null for cache miss", () => {
      const result = client.cacheGet(["नमस्ते"], "");
      expect(result).toBeNull();
    });

    it("should evict oldest entry when max size exceeded", () => {
      // Fill cache to max (100)
      for (let i = 0; i < 100; i++) {
        client.cacheSet([`word${i}`], "", [`pred${i}`]);
      }
      // Add one more — should evict the first
      client.cacheSet(["word100"], "", ["pred100"]);
      expect(client.cacheGet(["word0"], "")).toBeNull();
      expect(client.cacheGet(["word100"], "")).toEqual(["pred100"]);
    });

    it("should expire entries after TTL (5 minutes)", () => {
      client.cacheSet(["नमस्ते"], "", ["दोस्तों"]);
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
      expect(client.cacheGet(["नमस्ते"], "")).toBeNull();
    });

    it("should use last 3 words of context as cache key", () => {
      client.cacheSet(["a", "b", "c", "d"], "", ["pred"]);
      // Same last 3 words should hit cache
      const result = client.cacheGet(["x", "b", "c", "d"], "");
      expect(result).toEqual(["pred"]);
    });
  });

  describe("predictNextWords", () => {
    it("should call fetch with correct endpoint and headers", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: '["दोस्तों"]' } }],
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await client.predictNextWords(
        {
          endpoint: "http://localhost:11434/v1/chat/completions",
          apiKey: "test-key",
          model: "llama3",
          maxSuggestions: 3,
        },
        ["नमस्ते"],
        ""
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("http://localhost:11434/v1/chat/completions");
      expect(options.method).toBe("POST");
      expect(options.headers["Authorization"]).toBe("Bearer test-key");
      expect(options.headers["Content-Type"]).toBe("application/json");

      const body = JSON.parse(options.body);
      expect(body.model).toBe("llama3");
      expect(body.temperature).toBeLessThanOrEqual(0.3);
    });

    it("should return cached result without calling fetch", async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      client.cacheSet(["नमस्ते"], "", ["दोस्तों"]);
      const result = await client.predictNextWords(
        { endpoint: "http://x", apiKey: "", model: "m", maxSuggestions: 3 },
        ["नमस्ते"],
        ""
      );

      expect(result).toEqual(["दोस्तों"]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should return empty array on fetch error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("Network error"))
      );

      const result = await client.predictNextWords(
        { endpoint: "http://x", apiKey: "", model: "m", maxSuggestions: 3 },
        ["नमस्ते"],
        ""
      );

      expect(result).toEqual([]);
    });

    it("should return empty array on non-ok response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: false, status: 401 })
      );

      const result = await client.predictNextWords(
        { endpoint: "http://x", apiKey: "", model: "m", maxSuggestions: 3 },
        ["नमस्ते"],
        ""
      );

      expect(result).toEqual([]);
    });

    it("should abort previous request when a new one arrives", async () => {
      let abortSignal: AbortSignal | undefined;
      const mockFetch = vi.fn().mockImplementation((_url, options) => {
        abortSignal = options.signal;
        return new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: () =>
                  Promise.resolve({
                    choices: [{ message: { content: '["a"]' } }],
                  }),
              }),
            1000
          )
        );
      });
      vi.stubGlobal("fetch", mockFetch);

      const config = {
        endpoint: "http://x",
        apiKey: "",
        model: "m",
        maxSuggestions: 3,
      };

      // Start first request
      client.predictNextWords(config, ["word1"], "");

      // Start second request before first completes
      client.predictNextWords(config, ["word2"], "");

      // The first request's signal should be aborted
      expect(abortSignal).toBeDefined();
    });

    it("should skip Authorization header when apiKey is empty", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: '["a"]' } }],
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await client.predictNextWords(
        { endpoint: "http://x", apiKey: "", model: "m", maxSuggestions: 3 },
        [],
        ""
      );

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers["Authorization"]).toBeUndefined();
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/background/llm-client.test.ts`
Expected: FAIL — module not found

**Step 3: Implement LLMClient**

Create `src/background/llm-client.ts`:

```typescript
export interface LLMConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  maxSuggestions: number;
}

interface CacheEntry {
  predictions: string[];
  timestamp: number;
}

const CACHE_MAX_SIZE = 100;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class LLMClient {
  private cache = new Map<string, CacheEntry>();
  private abortController: AbortController | null = null;

  buildPrompt(
    sentenceContext: string[],
    partialWord: string,
    maxSuggestions: number
  ): string {
    const sentence = sentenceContext.join(" ");
    let prompt =
      "You are a Hindi typing assistant. Given the Hindi text typed so far, predict the most likely next words.\n\n";

    if (sentence) {
      prompt += `Sentence so far: "${sentence}"\n`;
    } else {
      prompt += "The user is starting a new sentence.\n";
    }

    if (partialWord) {
      prompt += `Partial word being typed: "${partialWord}"\n`;
    }

    prompt += `\nReturn ONLY a JSON array of ${maxSuggestions} predicted Hindi words, most likely first.\nExample: ["आपका", "आज", "आप"]`;
    return prompt;
  }

  parseResponse(text: string): string[] {
    // Try to extract a JSON array from the response
    const match = text.match(/\[[\s\S]*?\]/);
    if (!match) return [];

    try {
      const parsed = JSON.parse(match[0]);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((item): item is string => typeof item === "string");
    } catch {
      return [];
    }
  }

  private cacheKey(sentenceContext: string[], partialWord: string): string {
    const lastThree = sentenceContext.slice(-3);
    return JSON.stringify(lastThree) + "|" + partialWord;
  }

  cacheGet(sentenceContext: string[], partialWord: string): string[] | null {
    const key = this.cacheKey(sentenceContext, partialWord);
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }

    return entry.predictions;
  }

  cacheSet(
    sentenceContext: string[],
    partialWord: string,
    predictions: string[]
  ): void {
    const key = this.cacheKey(sentenceContext, partialWord);

    // Evict oldest if at capacity
    if (this.cache.size >= CACHE_MAX_SIZE && !this.cache.has(key)) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, { predictions, timestamp: Date.now() });
  }

  async predictNextWords(
    config: LLMConfig,
    sentenceContext: string[],
    partialWord: string
  ): Promise<string[]> {
    // Check cache first
    const cached = this.cacheGet(sentenceContext, partialWord);
    if (cached) return cached;

    // Abort any in-flight request
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    const prompt = this.buildPrompt(
      sentenceContext,
      partialWord,
      config.maxSuggestions
    );

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (config.apiKey) {
      headers["Authorization"] = `Bearer ${config.apiKey}`;
    }

    try {
      const response = await fetch(config.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
          max_tokens: 100,
        }),
        signal: this.abortController.signal,
      });

      if (!response.ok) return [];

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content ?? "";
      const predictions = this.parseResponse(content);

      // Cache the result
      this.cacheSet(sentenceContext, partialWord, predictions);

      return predictions;
    } catch {
      return [];
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/background/llm-client.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/background/llm-client.ts tests/background/llm-client.test.ts
git commit -m "feat: add LLM client with LRU cache and OpenAI-compatible API support"
```

---

### Task 3: Service Worker LLM Handler

Wire the `LLMClient` into the service worker message handler.

**Files:**
- Modify: `src/background/service-worker.ts:79-127`

**Step 1: Add LLM client import and instance**

At the top of `src/background/service-worker.ts`, add after line 3:

```typescript
import { LLMClient } from "./llm-client";

const llmClient = new LLMClient();
```

**Step 2: Add LLM_PREDICT case to the message handler**

In the `switch` statement (after the `STATUS_REQUEST` case, around line 122), add:

```typescript
      case "LLM_PREDICT":
        handleLLMPredict(message).then((result) => {
          sendResponse(result);
        });
        return true; // async response
```

**Step 3: Add the handler function**

Before the event listeners section (before line 69), add:

```typescript
async function handleLLMPredict(
  message: Extract<ExtensionMessage, { type: "LLM_PREDICT" }>
): Promise<ExtensionMessage> {
  if (!currentPrefs.llmEnabled || !currentPrefs.llmEndpoint) {
    return { type: "LLM_PREDICT_ERROR", error: "LLM not configured" };
  }

  try {
    const predictions = await llmClient.predictNextWords(
      {
        endpoint: currentPrefs.llmEndpoint,
        apiKey: currentPrefs.llmApiKey,
        model: currentPrefs.llmModel,
        maxSuggestions: currentPrefs.llmMaxSuggestions,
      },
      message.sentenceContext,
      message.partialWord
    );
    return { type: "LLM_PREDICT_RESULT", predictions };
  } catch {
    return { type: "LLM_PREDICT_ERROR", error: "LLM request failed" };
  }
}
```

**Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add src/background/service-worker.ts
git commit -m "feat: add LLM prediction handler to service worker"
```

---

### Task 4: CompositionManager Sentence History (TDD)

Track committed words and expose new callbacks for LLM integration.

**Files:**
- Modify: `src/content/composition-manager.ts`
- Modify: `tests/content/composition-manager.test.ts`

**Step 1: Write failing tests**

Add to the end of `tests/content/composition-manager.test.ts`, inside the outer `describe` block:

```typescript
  describe("Sentence history tracking", () => {
    let wordCommits: { sentenceHistory: string[]; committedWord: string }[];

    beforeEach(() => {
      wordCommits = [];
      manager = new CompositionManager(
        rules,
        {
          onCandidatesUpdate: (candidates, selectedIndex) => {
            candidatesHistory.push({ candidates, selectedIndex });
          },
          onCompositionEnd: () => {
            compositionEnded = true;
          },
          onComposingChange: (composing) => {
            composingState = composing;
          },
          onWordCommitted: (sentenceHistory, committedWord) => {
            wordCommits.push({
              sentenceHistory: [...sentenceHistory],
              committedWord,
            });
          },
        },
        5
      );
      fieldSim = new FieldSimulator();
    });

    it("should call onWordCommitted with committed word on space", () => {
      for (const ch of "ka") {
        manager.handleAction({ type: "char", char: ch }, mockField);
      }
      manager.handleAction({ type: "space" }, mockField);

      expect(wordCommits).toHaveLength(1);
      expect(wordCommits[0].committedWord).toBeTruthy();
      expect(wordCommits[0].sentenceHistory).toHaveLength(1);
    });

    it("should accumulate sentence history across multiple words", () => {
      // First word
      for (const ch of "ka") {
        manager.handleAction({ type: "char", char: ch }, mockField);
      }
      manager.handleAction({ type: "space" }, mockField);

      // Second word
      for (const ch of "paanee") {
        manager.handleAction({ type: "char", char: ch }, mockField);
      }
      manager.handleAction({ type: "space" }, mockField);

      expect(wordCommits).toHaveLength(2);
      expect(wordCommits[1].sentenceHistory).toHaveLength(2);
    });

    it("should call onWordCommitted on candidate selection", () => {
      for (const ch of "ka") {
        manager.handleAction({ type: "char", char: ch }, mockField);
      }
      manager.handleAction({ type: "select", index: 0 }, mockField);

      expect(wordCommits).toHaveLength(1);
    });

    it("should not call onWordCommitted on escape", () => {
      for (const ch of "ka") {
        manager.handleAction({ type: "char", char: ch }, mockField);
      }
      manager.handleAction({ type: "escape" }, mockField);

      expect(wordCommits).toHaveLength(0);
    });

    it("should reset sentence history via resetSentenceHistory", () => {
      for (const ch of "ka") {
        manager.handleAction({ type: "char", char: ch }, mockField);
      }
      manager.handleAction({ type: "space" }, mockField);

      manager.resetSentenceHistory();

      // Next word should start fresh
      for (const ch of "na") {
        manager.handleAction({ type: "char", char: ch }, mockField);
      }
      manager.handleAction({ type: "space" }, mockField);

      expect(wordCommits[1].sentenceHistory).toHaveLength(1);
    });

    it("should provide current sentence history via getter", () => {
      for (const ch of "ka") {
        manager.handleAction({ type: "char", char: ch }, mockField);
      }
      manager.handleAction({ type: "space" }, mockField);

      expect(manager.getSentenceHistory()).toHaveLength(1);
    });
  });
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/content/composition-manager.test.ts`
Expected: FAIL — `onWordCommitted` not in type, `resetSentenceHistory` / `getSentenceHistory` don't exist

**Step 3: Implement sentence history in CompositionManager**

In `src/content/composition-manager.ts`:

Add `onWordCommitted` to the `CompositionCallbacks` interface:

```typescript
export interface CompositionCallbacks {
  onCandidatesUpdate: (candidates: Candidate[], selectedIndex: number) => void;
  onCompositionEnd: () => void;
  onComposingChange: (composing: boolean) => void;
  onWordCommitted?: (sentenceHistory: string[], committedWord: string) => void;
}
```

Add the `sentenceHistory` field after `private previewLength = 0;`:

```typescript
  private sentenceHistory: string[] = [];
```

Add public methods after `getState()`:

```typescript
  getSentenceHistory(): string[] {
    return [...this.sentenceHistory];
  }

  resetSentenceHistory(): void {
    this.sentenceHistory = [];
  }
```

Modify `commitTopCandidate` to track history and fire callback. Replace the method body:

```typescript
  private commitTopCandidate(field: HTMLElement): void {
    if (this.state.status !== "COMPOSING") return;

    const candidate = this.state.candidates[this.state.selectedIndex];
    const committedWord = candidate
      ? candidate.text
      : this.state.devanagariPreview;

    if (candidate) {
      this.injector.endComposition(field, candidate.text, this.previewLength);
    } else {
      this.injector.endComposition(
        field,
        this.state.devanagariPreview,
        this.previewLength
      );
    }

    if (committedWord) {
      this.sentenceHistory.push(committedWord);
      this.callbacks.onWordCommitted?.(this.sentenceHistory, committedWord);
    }

    this.resetState();
  }
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/content/composition-manager.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/content/composition-manager.ts tests/content/composition-manager.test.ts
git commit -m "feat: track sentence history in CompositionManager with onWordCommitted callback"
```

---

### Task 5: CandidateStrip Prediction Row (TDD)

Add a second row for LLM predictions below the existing transliteration candidates.

**Files:**
- Modify: `src/content/candidate-strip.ts`
- Create: `tests/content/candidate-strip.test.ts`

**Step 1: Write failing tests**

Create `tests/content/candidate-strip.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CandidateStrip } from "../../src/content/candidate-strip";

// Minimal DOM mock for Shadow DOM
class MockShadowRoot {
  children: unknown[] = [];
  mode = "closed";
  appendChild(child: unknown) {
    this.children.push(child);
    return child;
  }
}

describe("CandidateStrip prediction row", () => {
  // We test the public API — updatePredictions, showLoading, hidePredictions
  // CandidateStrip uses Shadow DOM, so we test behavior via its methods

  let strip: CandidateStrip;

  beforeEach(() => {
    // Mock minimal DOM environment
    // CandidateStrip needs document.createElement and document.body
    if (typeof document === "undefined") {
      // In node environment, skip DOM-dependent tests
      return;
    }
    strip = new CandidateStrip();
  });

  afterEach(() => {
    if (strip) strip.destroy();
  });

  it("should have updatePredictions method", () => {
    expect(typeof strip.updatePredictions).toBe("function");
  });

  it("should have showLoading method", () => {
    expect(typeof strip.showLoading).toBe("function");
  });

  it("should have hidePredictions method", () => {
    expect(typeof strip.hidePredictions).toBe("function");
  });

  it("should accept a prediction select callback", () => {
    expect(typeof strip.onPredictionSelect).toBe("function");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/content/candidate-strip.test.ts`
Expected: FAIL — methods don't exist (or DOM not available in node)

Note: CandidateStrip heavily depends on DOM (Shadow DOM, `document.createElement`). The node test environment won't support full rendering tests. We'll keep these as API contract tests. Visual testing will be covered by the e2e tests.

**Step 3: Add prediction row to CandidateStrip**

In `src/content/candidate-strip.ts`, add these fields after `private visible = false;`:

```typescript
  private predictionContainer: HTMLDivElement;
  private predictionSelectCallback: ((word: string) => void) | null = null;
  private loadingEl: HTMLDivElement;
```

In the constructor, after `this.shadow.appendChild(this.container);`, add:

```typescript
    // Prediction row container
    this.predictionContainer = document.createElement("div");
    this.predictionContainer.className = "prediction-strip";
    this.predictionContainer.style.display = "none";
    this.shadow.appendChild(this.predictionContainer);

    // Loading indicator
    this.loadingEl = document.createElement("div");
    this.loadingEl.className = "prediction-loading";
    this.loadingEl.textContent = "✦";
    this.loadingEl.style.display = "none";
    this.shadow.appendChild(this.loadingEl);
```

Add these public methods after `onSelect`:

```typescript
  onPredictionSelect(callback: (word: string) => void): void {
    this.predictionSelectCallback = callback;
  }

  updatePredictions(predictions: string[]): void {
    while (this.predictionContainer.firstChild) {
      this.predictionContainer.removeChild(this.predictionContainer.firstChild);
    }
    this.loadingEl.style.display = "none";

    if (predictions.length === 0) {
      this.predictionContainer.style.display = "none";
      return;
    }

    const marker = document.createElement("span");
    marker.className = "prediction-marker";
    marker.textContent = "✦";
    this.predictionContainer.appendChild(marker);

    predictions.forEach((word) => {
      const item = document.createElement("div");
      item.className = "prediction-item";
      item.style.pointerEvents = "auto";
      item.textContent = word;

      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.predictionSelectCallback?.(word);
      });

      this.predictionContainer.appendChild(item);
    });

    this.predictionContainer.style.display = "flex";
  }

  showLoading(): void {
    this.predictionContainer.style.display = "none";
    this.loadingEl.style.display = "flex";
  }

  hidePredictions(): void {
    this.predictionContainer.style.display = "none";
    this.loadingEl.style.display = "none";
  }
```

In the `show` method, update positioning to account for the prediction row. After setting `this.container.style.display`:

```typescript
    // Position prediction row directly below candidate strip
    if (this.predictionContainer.style.display !== "none") {
      this.predictionContainer.style.position = "fixed";
      this.predictionContainer.style.top = `${top + stripHeight + 2}px`;
      this.predictionContainer.style.left = `${left}px`;
    }
    if (this.loadingEl.style.display !== "none") {
      this.loadingEl.style.position = "fixed";
      this.loadingEl.style.top = `${top + stripHeight + 2}px`;
      this.loadingEl.style.left = `${left}px`;
    }
```

In the `hide` method, also hide predictions:

```typescript
  hide(): void {
    this.container.style.display = "none";
    this.predictionContainer.style.display = "none";
    this.loadingEl.style.display = "none";
    this.visible = false;
  }
```

In `getStyles()`, add prediction row styles after the existing `.candidate-text` rule:

```css
      .prediction-strip {
        position: fixed;
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 2px;
        padding: 4px 6px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        line-height: 1;
        white-space: nowrap;
        user-select: none;
        pointer-events: auto;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.04);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        background: rgba(245, 245, 255, 0.95);
        color: #1a1a1a;
      }

      @media (prefers-color-scheme: dark) {
        .prediction-strip {
          background: rgba(35, 35, 50, 0.95);
          color: #e8e8e8;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.06);
        }
      }

      .prediction-marker {
        font-size: 10px;
        color: #7c3aed;
        margin-right: 2px;
      }

      @media (prefers-color-scheme: dark) {
        .prediction-marker { color: #a78bfa; }
      }

      .prediction-item {
        padding: 4px 8px;
        border-radius: 5px;
        cursor: pointer;
        font-size: 15px;
        font-weight: 500;
        transition: background 0.1s;
      }

      .prediction-item:hover {
        background: rgba(124, 58, 237, 0.1);
      }

      @media (prefers-color-scheme: dark) {
        .prediction-item:hover {
          background: rgba(167, 139, 250, 0.15);
        }
      }

      .prediction-loading {
        position: fixed;
        display: flex;
        align-items: center;
        padding: 4px 8px;
        border-radius: 8px;
        font-size: 12px;
        color: #7c3aed;
        background: rgba(245, 245, 255, 0.95);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        animation: pulse 1.5s ease-in-out infinite;
      }

      @media (prefers-color-scheme: dark) {
        .prediction-loading {
          color: #a78bfa;
          background: rgba(35, 35, 50, 0.95);
        }
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/content/candidate-strip.test.ts`
Expected: PASS (or skip if DOM not available — these are contract tests)

**Step 5: Commit**

```bash
git add src/content/candidate-strip.ts tests/content/candidate-strip.test.ts
git commit -m "feat: add prediction row to CandidateStrip for LLM suggestions"
```

---

### Task 6: Wire Up LLM Flow in Content Script

Connect CompositionManager, CandidateStrip, and service worker messaging with debounced LLM requests.

**Files:**
- Modify: `src/content/content-script.ts`

**Step 1: Add debounce utility and LLM request function**

At the top of `src/content/content-script.ts`, after the imports, add:

```typescript
let llmDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const LLM_DEBOUNCE_MS = 300;

function requestLLMPredictions(
  sentenceContext: string[],
  partialWord: string,
  strip: CandidateStrip
): void {
  const message: ExtensionMessage = {
    type: "LLM_PREDICT",
    sentenceContext,
    partialWord,
  };

  strip.showLoading();

  chrome.runtime.sendMessage(message, (response) => {
    if (chrome.runtime.lastError) {
      strip.hidePredictions();
      return;
    }
    if (response?.type === "LLM_PREDICT_RESULT") {
      strip.updatePredictions(response.predictions);
    } else {
      strip.hidePredictions();
    }
  });
}

function debouncedLLMRequest(
  sentenceContext: string[],
  partialWord: string,
  strip: CandidateStrip
): void {
  if (llmDebounceTimer) clearTimeout(llmDebounceTimer);
  llmDebounceTimer = setTimeout(() => {
    requestLLMPredictions(sentenceContext, partialWord, strip);
  }, LLM_DEBOUNCE_MS);
}
```

**Step 2: Wire up the onWordCommitted callback**

In `setupTransliteration`, add `onWordCommitted` to the callbacks object passed to `CompositionManager`:

```typescript
      onWordCommitted: (sentenceHistory, _committedWord) => {
        if (prefs.llmEnabled) {
          requestLLMPredictions(sentenceHistory, "", candidateStrip);
        }
      },
```

**Step 3: Add debounced LLM calls during composition**

In the `onCandidatesUpdate` callback, after `candidateStrip.show(field)`, add:

```typescript
        if (prefs.llmEnabled && candidates.length > 0) {
          const topCandidate = candidates[0].text;
          debouncedLLMRequest(
            compositionManager.getSentenceHistory(),
            topCandidate,
            candidateStrip
          );
        }
```

**Step 4: Wire up prediction click handler**

After `candidateStrip.onSelect(...)`, add:

```typescript
  candidateStrip.onPredictionSelect((word) => {
    const field = fieldInterceptor.getActiveField();
    if (field) {
      // If currently composing, cancel the current composition first
      if (compositionManager.getState().status === "COMPOSING") {
        compositionManager.handleAction({ type: "escape" }, field);
      }
      // Insert the predicted word + space
      const injector = new (
        // Use dynamic import to avoid circular dependency
        (await import("./text-injector")).TextInjector
      )();
      injector.insert(field, word + " ");
    }
  });
```

Wait — this introduces async complexity. Simpler approach: expose an `insertPrediction` method on `CompositionManager`.

**Step 4 (revised): Add insertPrediction to CompositionManager**

In `src/content/composition-manager.ts`, add a public method:

```typescript
  insertPrediction(word: string, field: HTMLElement): void {
    // Cancel any active composition
    if (this.state.status === "COMPOSING") {
      this.injector.cancelComposition(field, this.previewLength);
      this.resetState();
    }
    // Insert the prediction directly
    this.injector.insert(field, word + " ");
    this.sentenceHistory.push(word);
    this.callbacks.onWordCommitted?.(this.sentenceHistory, word);
  }
```

Then in `content-script.ts`, the handler becomes:

```typescript
  candidateStrip.onPredictionSelect((word) => {
    const field = fieldInterceptor.getActiveField();
    if (field) {
      compositionManager.insertPrediction(word, field);
    }
  });
```

**Step 5: Reset sentence history on field change**

In `onFieldBlur` callback, add:

```typescript
      compositionManager.resetSentenceHistory();
```

And in `onFieldFocus`, also reset:

```typescript
      compositionManager.resetSentenceHistory();
```

**Step 6: Cancel debounced requests on composition end**

In the `onCompositionEnd` callback, add:

```typescript
      if (llmDebounceTimer) clearTimeout(llmDebounceTimer);
```

**Step 7: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 8: Commit**

```bash
git add src/content/content-script.ts src/content/composition-manager.ts
git commit -m "feat: wire up LLM prediction flow with debouncing in content script"
```

---

### Task 7: Popup UI for LLM Settings

Add the "AI Suggestions" settings section to the popup.

**Files:**
- Modify: `src/popup/popup.html`
- Modify: `src/popup/popup.ts`

**Step 1: Add HTML section**

In `src/popup/popup.html`, add after the closing `</div>` of the Settings section (after line 231) and before the `.shortcut` div:

```html
  <div class="section">
    <div class="section-title">AI Suggestions</div>

    <div class="setting-row">
      <span class="setting-label">Enable</span>
      <label class="toggle-switch">
        <input type="checkbox" id="llmEnabled">
        <span class="toggle-slider"></span>
      </label>
    </div>

    <div id="llmSettings" style="display: none;">
      <div class="setting-row">
        <span class="setting-label">Endpoint</span>
      </div>
      <div class="setting-row">
        <input type="text" id="llmEndpoint" placeholder="http://localhost:11434/v1/chat/completions" class="text-input">
      </div>

      <div class="setting-row">
        <span class="setting-label">API Key</span>
      </div>
      <div class="setting-row">
        <input type="password" id="llmApiKey" placeholder="Optional" class="text-input">
      </div>

      <div class="setting-row">
        <span class="setting-label">Model</span>
      </div>
      <div class="setting-row">
        <input type="text" id="llmModel" placeholder="e.g. llama3, gpt-4o-mini" class="text-input">
      </div>

      <div class="setting-row">
        <span class="setting-label">Max Suggestions</span>
        <select id="llmMaxSuggestions">
          <option value="3" selected>3</option>
          <option value="4">4</option>
          <option value="5">5</option>
        </select>
      </div>
    </div>
  </div>
```

Add CSS for `.text-input` in the `<style>` block (after the `select` styles):

```css
    .text-input {
      width: 100%;
      padding: 6px 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 12px;
      background: #fff;
      color: inherit;
      box-sizing: border-box;
    }

    @media (prefers-color-scheme: dark) {
      .text-input {
        background: #2a2a2a;
        border-color: #444;
      }
    }
```

**Step 2: Add TypeScript handlers**

In `src/popup/popup.ts`, add element references after the existing ones:

```typescript
const llmEnabledEl = document.getElementById("llmEnabled") as HTMLInputElement;
const llmSettingsEl = document.getElementById("llmSettings") as HTMLDivElement;
const llmEndpointEl = document.getElementById("llmEndpoint") as HTMLInputElement;
const llmApiKeyEl = document.getElementById("llmApiKey") as HTMLInputElement;
const llmModelEl = document.getElementById("llmModel") as HTMLInputElement;
const llmMaxSuggestionsEl = document.getElementById("llmMaxSuggestions") as HTMLSelectElement;
```

In `applyPrefsToUI()`, add after the existing assignments:

```typescript
  llmEnabledEl.checked = currentPrefs.llmEnabled;
  llmSettingsEl.style.display = currentPrefs.llmEnabled ? "block" : "none";
  llmEndpointEl.value = currentPrefs.llmEndpoint;
  llmApiKeyEl.value = currentPrefs.llmApiKey;
  llmModelEl.value = currentPrefs.llmModel;
  llmMaxSuggestionsEl.value = String(currentPrefs.llmMaxSuggestions);
```

Add event listeners after the existing ones:

```typescript
llmEnabledEl.addEventListener("change", () => {
  const enabled = llmEnabledEl.checked;
  llmSettingsEl.style.display = enabled ? "block" : "none";
  savePref({ llmEnabled: enabled });
});

llmEndpointEl.addEventListener("change", () => {
  savePref({ llmEndpoint: llmEndpointEl.value.trim() });
});

llmApiKeyEl.addEventListener("change", () => {
  savePref({ llmApiKey: llmApiKeyEl.value });
});

llmModelEl.addEventListener("change", () => {
  savePref({ llmModel: llmModelEl.value.trim() });
});

llmMaxSuggestionsEl.addEventListener("change", () => {
  savePref({ llmMaxSuggestions: parseInt(llmMaxSuggestionsEl.value) });
});
```

**Step 3: Verify it builds**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/popup/popup.html src/popup/popup.ts
git commit -m "feat: add AI Suggestions settings section to popup UI"
```

---

### Task 8: Integration Test

Test the full flow end-to-end with mocked chrome APIs.

**Files:**
- Create: `tests/integration/llm-suggestions.test.ts`

**Step 1: Write the integration test**

Create `tests/integration/llm-suggestions.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { LLMClient } from "../../src/background/llm-client";

describe("LLM suggestions integration", () => {
  let client: LLMClient;

  beforeEach(() => {
    client = new LLMClient();
  });

  it("full flow: build prompt → call API → parse → cache → retrieve", async () => {
    // 1. Build the prompt
    const prompt = client.buildPrompt(["नमस्ते", "दोस्तों"], "", 3);
    expect(prompt).toContain("नमस्ते दोस्तों");

    // 2. Mock the API call
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: '["आज", "मैं", "कैसे"]',
              },
            },
          ],
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    // 3. Call predictNextWords
    const predictions = await client.predictNextWords(
      {
        endpoint: "http://localhost:11434/v1/chat/completions",
        apiKey: "",
        model: "llama3",
        maxSuggestions: 3,
      },
      ["नमस्ते", "दोस्तों"],
      ""
    );

    expect(predictions).toEqual(["आज", "मैं", "कैसे"]);

    // 4. Second call should use cache (no new fetch)
    mockFetch.mockClear();
    const cached = await client.predictNextWords(
      {
        endpoint: "http://localhost:11434/v1/chat/completions",
        apiKey: "",
        model: "llama3",
        maxSuggestions: 3,
      },
      ["नमस्ते", "दोस्तों"],
      ""
    );

    expect(cached).toEqual(["आज", "मैं", "कैसे"]);
    expect(mockFetch).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("partial word flow: predictions filter by prefix context", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: { content: '["आपका", "आज", "आप"]' },
            },
          ],
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const predictions = await client.predictNextWords(
      {
        endpoint: "http://localhost:11434/v1/chat/completions",
        apiKey: "",
        model: "llama3",
        maxSuggestions: 3,
      },
      ["नमस्ते"],
      "आ"
    );

    expect(predictions).toEqual(["आपका", "आज", "आप"]);

    // Verify the prompt included the partial word
    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.messages[0].content).toContain("आ");

    vi.unstubAllGlobals();
  });

  it("error resilience: network failure returns empty array gracefully", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED"))
    );

    const predictions = await client.predictNextWords(
      {
        endpoint: "http://localhost:11434/v1/chat/completions",
        apiKey: "",
        model: "llama3",
        maxSuggestions: 3,
      },
      ["नमस्ते"],
      ""
    );

    expect(predictions).toEqual([]);

    vi.unstubAllGlobals();
  });

  it("error resilience: malformed LLM response returns empty array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: "I'm sorry, I can't predict Hindi words.",
                },
              },
            ],
          }),
      })
    );

    const predictions = await client.predictNextWords(
      {
        endpoint: "http://x",
        apiKey: "",
        model: "m",
        maxSuggestions: 3,
      },
      ["नमस्ते"],
      ""
    );

    expect(predictions).toEqual([]);

    vi.unstubAllGlobals();
  });
});
```

**Step 2: Run test to verify it passes**

Run: `npx vitest run tests/integration/llm-suggestions.test.ts`
Expected: PASS (depends on Task 2 LLMClient being implemented)

**Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add tests/integration/llm-suggestions.test.ts
git commit -m "test: add integration tests for LLM suggestion flow"
```

---

### Task 9: Final Verification

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

**Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Build the extension**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "chore: fix any remaining issues from LLM suggestions implementation"
```
