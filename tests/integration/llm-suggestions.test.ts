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

  it("partial word flow: predictions include partial word context", async () => {
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
