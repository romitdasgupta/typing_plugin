import { describe, it, expect, beforeAll } from "vitest";
import { Transliterator } from "../../src/engine/transliterator";
import type { TransliterationRules } from "../../src/shared/types";
import hindiRules from "../../data/hindi/transliteration-rules.json";

const rules: TransliterationRules = {
  vowels: hindiRules.vowels,
  consonants: hindiRules.consonants,
  nuqta_consonants: hindiRules.nuqta_consonants,
  conjuncts: hindiRules.conjuncts,
  special: hindiRules.special,
  halant: hindiRules.halant,
};

describe("Transliterator", () => {
  let engine: Transliterator;

  beforeAll(() => {
    engine = new Transliterator(rules);
  });

  describe("Vowels (independent)", () => {
    it.each([
      ["a", "अ"],
      ["aa", "आ"],
      ["i", "इ"],
      ["ee", "ई"],
      ["u", "उ"],
      ["oo", "ऊ"],
      ["e", "ए"],
      ["ai", "ऐ"],
      ["o", "ओ"],
      ["au", "औ"],
      ["ri", "ऋ"],
    ])("should transliterate '%s' to '%s'", (roman, expected) => {
      const result = engine.process(roman);
      expect(result.topCandidate).toBe(expected);
    });

    it("should handle doubled vowel aliases", () => {
      expect(engine.process("ii").topCandidate).toBe("ई");
      expect(engine.process("uu").topCandidate).toBe("ऊ");
    });
  });

  describe("Consonants", () => {
    it.each([
      ["k", "क"],
      ["kh", "ख"],
      ["g", "ग"],
      ["gh", "घ"],
      ["ch", "च"],
      ["chh", "छ"],
      ["j", "ज"],
      ["jh", "झ"],
      ["t", "त"],
      ["th", "थ"],
      ["d", "द"],
      ["dh", "ध"],
      ["n", "न"],
      ["p", "प"],
      ["ph", "फ"],
      ["b", "ब"],
      ["bh", "भ"],
      ["m", "म"],
      ["y", "य"],
      ["r", "र"],
      ["l", "ल"],
      ["v", "व"],
      ["sh", "श"],
      ["s", "स"],
      ["h", "ह"],
    ])("should transliterate '%s' to '%s'", (roman, expected) => {
      const result = engine.process(roman);
      expect(result.topCandidate).toBe(expected);
    });

    it("should handle casual aliases", () => {
      expect(engine.process("w").topCandidate).toBe("व");
      expect(engine.process("f").topCandidate).toBe("फ");
      expect(engine.process("z").topCandidate).toBe("ज़");
    });

    it("should handle retroflex consonants", () => {
      expect(engine.process("T").topCandidate).toBe("ट");
      expect(engine.process("Th").topCandidate).toBe("ठ");
      expect(engine.process("D").topCandidate).toBe("ड");
      expect(engine.process("Dh").topCandidate).toBe("ढ");
      expect(engine.process("N").topCandidate).toBe("ण");
    });
  });

  describe("Consonant + Vowel (matra forms)", () => {
    it.each([
      ["ka", "क"],       // inherent 'a' — no matra
      ["kaa", "का"],
      ["ki", "कि"],
      ["kee", "की"],
      ["ku", "कु"],
      ["koo", "कू"],
      ["ke", "के"],
      ["kai", "कै"],
      ["ko", "को"],
      ["kau", "कौ"],
    ])("should transliterate '%s' to '%s'", (roman, expected) => {
      const result = engine.process(roman);
      expect(result.topCandidate).toBe(expected);
    });

    it("should handle matra with different consonants", () => {
      expect(engine.process("na").topCandidate).toBe("न");
      expect(engine.process("naa").topCandidate).toBe("ना");
      expect(engine.process("ni").topCandidate).toBe("नि");
      expect(engine.process("pa").topCandidate).toBe("प");
      expect(engine.process("pi").topCandidate).toBe("पि");
    });
  });

  describe("Consonant clusters (halant joining)", () => {
    it("should join two consonants with halant", () => {
      // k + t → क्त
      const result = engine.process("kt");
      expect(result.topCandidate).toBe("क्त");
    });

    it("should handle triple consonant clusters", () => {
      // s + t + r → स्त्र
      const result = engine.process("str");
      expect(result.topCandidate).toBe("स्त्र");
    });
  });

  describe("Conjuncts", () => {
    it.each([
      ["ksh", "क्ष"],
      ["x", "क्ष"],
      ["tr", "त्र"],
      ["gn", "ज्ञ"],
      ["gy", "ज्ञ"],
      ["shr", "श्र"],
    ])("should transliterate conjunct '%s' to '%s'", (roman, expected) => {
      const result = engine.process(roman);
      expect(result.topCandidate).toBe(expected);
    });
  });

  describe("Nuqta consonants", () => {
    it.each([
      ["q", "क़"],
      ["z", "ज़"],
    ])("should transliterate nuqta '%s' to '%s'", (roman, expected) => {
      const result = engine.process(roman);
      expect(result.topCandidate).toBe(expected);
    });
  });

  describe("Special characters", () => {
    it("should handle anusvara", () => {
      expect(engine.process("M").topCandidate).toBe("ं");
    });

    it("should handle visarga", () => {
      expect(engine.process("H").topCandidate).toBe("ः");
    });
  });

  describe("Multi-syllable words", () => {
    it("should transliterate 'namaste'", () => {
      const result = engine.process("namaste");
      expect(result.topCandidate).toBe("नमस्ते");
    });

    it("should transliterate 'bharat'", () => {
      const result = engine.process("bharat");
      expect(result.topCandidate).toBe("भरत");
    });

    it("should transliterate 'hindi'", () => {
      const result = engine.process("hindi");
      expect(result.topCandidate).toBe("हिन्दि");
    });

    it("should transliterate 'kaam'", () => {
      const result = engine.process("kaam");
      expect(result.topCandidate).toBe("काम");
    });

    it("should transliterate 'paani'", () => {
      const result = engine.process("paani");
      expect(result.topCandidate).toBe("पानि");
    });
  });

  describe("Edge cases", () => {
    it("should return empty for empty input", () => {
      const result = engine.process("");
      expect(result.topCandidate).toBe("");
      expect(result.candidates).toHaveLength(0);
    });

    it("should pass through unrecognized characters", () => {
      const result = engine.process("@#$");
      expect(result.topCandidate).toBe("@#$");
    });

    it("should handle mixed recognized/unrecognized", () => {
      const result = engine.process("k@a");
      // k matches, @ passes through, a matches
      expect(result.topCandidate).toContain("क");
    });
  });

  describe("Trie structure", () => {
    it("should detect partial matches", () => {
      // "k" has children (kh, ksh) so it's partial
      expect(engine.hasPartialMatch("k")).toBe(true);
      // "kh" is terminal (ख) — vowel handling is dynamic, not via trie children
      // "ch" does have children though (chh → छ)
      expect(engine.hasPartialMatch("ch")).toBe(true);
      // "zzz" has no match at all
      expect(engine.hasPartialMatch("zzz")).toBe(false);
    });

    it("should build candidates from partial input", () => {
      const candidates = engine.buildCandidates("k");
      expect(candidates.length).toBeGreaterThan(0);
      // Should include क (k) and ख (kh) among candidates
      const texts = candidates.map((c) => c.text);
      expect(texts).toContain("क");
    });

    it("should have loaded all consonant rules", () => {
      const allRules = engine.getAllRules();
      // Should have at least vowels + consonants + conjuncts
      expect(allRules.size).toBeGreaterThan(50);
    });
  });
});
