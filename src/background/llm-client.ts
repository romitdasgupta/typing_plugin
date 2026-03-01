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
    const cached = this.cacheGet(sentenceContext, partialWord);
    if (cached) return cached;

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

      this.cacheSet(sentenceContext, partialWord, predictions);

      return predictions;
    } catch {
      return [];
    }
  }
}
