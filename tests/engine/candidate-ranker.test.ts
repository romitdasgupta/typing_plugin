import { describe, it, expect } from "vitest";
import {
  rankCandidates,
  mergeCandidatesWithPredictions,
} from "../../src/engine/candidate-ranker";
import type { Candidate } from "../../src/shared/types";

describe("rankCandidates", () => {
  it("should return empty array for empty input", () => {
    expect(rankCandidates([])).toEqual([]);
  });

  it("should sort by frequency (higher first)", () => {
    const candidates: Candidate[] = [
      { text: "क", roman: "k", type: "consonant", frequency: 50 },
      { text: "ख", roman: "kh", type: "consonant", frequency: 100 },
      { text: "ग", roman: "g", type: "consonant", frequency: 75 },
    ];
    const ranked = rankCandidates(candidates);
    expect(ranked[0].text).toBe("ख");
    expect(ranked[1].text).toBe("ग");
    expect(ranked[2].text).toBe("क");
  });

  it("should prefer shorter Roman input on frequency tie", () => {
    const candidates: Candidate[] = [
      { text: "क", roman: "ka", type: "consonant", frequency: 100 },
      { text: "क़", roman: "q", type: "consonant", frequency: 100 },
    ];
    const ranked = rankCandidates(candidates);
    expect(ranked[0].roman.length).toBeLessThanOrEqual(
      ranked[1].roman.length
    );
  });

  it("should deduplicate by Devanagari text", () => {
    const candidates: Candidate[] = [
      { text: "क", roman: "k", type: "consonant", frequency: 50 },
      { text: "क", roman: "ka", type: "consonant", frequency: 100 },
    ];
    const ranked = rankCandidates(candidates);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].frequency).toBe(100); // keeps higher frequency
  });

  it("should limit results to maxResults", () => {
    const candidates: Candidate[] = Array.from({ length: 20 }, (_, i) => ({
      text: `char${i}`,
      roman: `r${i}`,
      type: "consonant" as const,
      frequency: i,
    }));
    const ranked = rankCandidates(candidates, 5);
    expect(ranked).toHaveLength(5);
  });
});

describe("mergeCandidatesWithPredictions", () => {
  it("should put transliteration candidate first", () => {
    const translit: Candidate[] = [
      { text: "क", roman: "k", type: "consonant", frequency: 100 },
    ];
    const predictions: Candidate[] = [
      { text: "कम", roman: "kam", type: "consonant", frequency: 90 },
      { text: "कर", roman: "kar", type: "consonant", frequency: 80 },
    ];
    const merged = mergeCandidatesWithPredictions(translit, predictions);
    expect(merged[0].text).toBe("क");
    expect(merged[1].text).toBe("कम");
    expect(merged[2].text).toBe("कर");
  });

  it("should deduplicate predictions against translit candidates", () => {
    const translit: Candidate[] = [
      { text: "क", roman: "k", type: "consonant", frequency: 100 },
    ];
    const predictions: Candidate[] = [
      { text: "क", roman: "k", type: "consonant", frequency: 90 }, // duplicate
      { text: "कर", roman: "kar", type: "consonant", frequency: 80 },
    ];
    const merged = mergeCandidatesWithPredictions(translit, predictions);
    expect(merged).toHaveLength(2);
  });

  it("should respect maxResults", () => {
    const translit: Candidate[] = [
      { text: "क", roman: "k", type: "consonant", frequency: 100 },
    ];
    const predictions: Candidate[] = Array.from({ length: 20 }, (_, i) => ({
      text: `pred${i}`,
      roman: `p${i}`,
      type: "consonant" as const,
      frequency: 100 - i,
    }));
    const merged = mergeCandidatesWithPredictions(translit, predictions, 5);
    expect(merged).toHaveLength(5);
    expect(merged[0].text).toBe("क");
  });
});
