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
      for (let i = 0; i < 100; i++) {
        client.cacheSet([`word${i}`], "", [`pred${i}`]);
      }
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
      const signals: AbortSignal[] = [];
      const mockFetch = vi.fn().mockImplementation((_url, options) => {
        signals.push(options.signal);
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

      client.predictNextWords(config, ["word1"], "");
      client.predictNextWords(config, ["word2"], "");

      // First request's signal should be aborted
      expect(signals).toHaveLength(2);
      expect(signals[0].aborted).toBe(true);
      // Second request's signal should still be active
      expect(signals[1].aborted).toBe(false);
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
