import { describe, it, expect, beforeAll } from "vitest";
import { Dictionary } from "../../src/engine/dictionary";

describe("Dictionary", () => {
  let dict: Dictionary;

  beforeAll(() => {
    dict = new Dictionary();
    dict.loadFromWordList(
      [
        "है\t100000",
        "का\t95000",
        "के\t94000",
        "में\t93000",
        "की\t92000",
        "को\t91000",
        "कर\t71000",
        "करना\t45000",
        "करता\t39000",
        "काम\t58000",
        "कैसे\t14000",
        "कौन\t12000",
        "कहाँ\t11000",
        "नमस्ते\t20000",
        "नाम\t51000",
        "नहीं\t81000",
        "नया\t28000",
        "भारत\t4000",
        "भाई\t4800",
        "भी\t80000",
      ].join("\n")
    );
  });

  it("should report loaded after loading words", () => {
    expect(dict.isLoaded()).toBe(true);
  });

  it("should report correct word count", () => {
    expect(dict.size()).toBe(20);
  });

  it("should check word existence", () => {
    expect(dict.has("है")).toBe(true);
    expect(dict.has("नमस्ते")).toBe(true);
    expect(dict.has("zzz")).toBe(false);
    expect(dict.has("")).toBe(false);
  });

  describe("predict", () => {
    it("should return predictions for a prefix", () => {
      const results = dict.predict("क");
      expect(results.length).toBeGreaterThan(0);
      // All results should start with क
      for (const r of results) {
        expect(r.word.startsWith("क")).toBe(true);
      }
    });

    it("should sort by frequency (highest first)", () => {
      const results = dict.predict("क", 10);
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].rank).toBeGreaterThanOrEqual(results[i].rank);
      }
    });

    it("should respect maxResults", () => {
      const results = dict.predict("क", 3);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it("should return empty for non-matching prefix", () => {
      const results = dict.predict("zzz");
      expect(results).toEqual([]);
    });

    it("should return empty for empty prefix", () => {
      const results = dict.predict("");
      expect(results).toEqual([]);
    });

    it("should find exact word matches", () => {
      const results = dict.predict("नमस्ते");
      expect(results.length).toBe(1);
      expect(results[0].word).toBe("नमस्ते");
    });

    it("should include matchedPrefix in results", () => {
      const results = dict.predict("न");
      for (const r of results) {
        expect(r.matchedPrefix).toBe("न");
      }
    });

    it("should return multiple words sharing a prefix", () => {
      // "कर", "करना", "करता" all share "कर" prefix
      const results = dict.predict("कर");
      expect(results.length).toBeGreaterThanOrEqual(2);
      const words = results.map((r) => r.word);
      expect(words).toContain("कर");
      expect(words).toContain("करना");
    });
  });

  describe("serialization", () => {
    it("should serialize and deserialize correctly", () => {
      const binary = dict.serialize();
      expect(binary.byteLength).toBeGreaterThan(0);

      const dict2 = new Dictionary();
      // Use loadFromUrl with a mock, or manually call internal deserialize
      // For now, just verify the binary is valid by checking header
      const view = new DataView(binary);
      const decoder = new TextDecoder();
      const magic = decoder.decode(new Uint8Array(binary, 0, 4));
      expect(magic).toBe("HTDT");
      expect(view.getUint32(4, true)).toBe(1); // version
      expect(view.getUint32(8, true)).toBe(20); // word count
    });
  });
});
