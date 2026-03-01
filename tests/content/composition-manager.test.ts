import { describe, it, expect, beforeEach, vi } from "vitest";
import { CompositionManager } from "../../src/content/composition-manager";
import type { Candidate, TransliterationRules } from "../../src/shared/types";
import hindiRules from "../../data/hindi/transliteration-rules.json";

/**
 * Simulates a text field's value and cursor, using code-unit math
 * identical to the real TextInjector.replaceInInput.
 */
class FieldSimulator {
  value = "";
  cursor = 0;
  composing = false;

  insert(text: string) {
    const before = this.value.slice(0, this.cursor);
    const after = this.value.slice(this.cursor);
    this.value = before + text + after;
    this.cursor += text.length;
  }

  replaceBeforeCursor(deleteCount: number, text: string) {
    const deleteFrom = Math.max(0, this.cursor - deleteCount);
    const before = this.value.slice(0, deleteFrom);
    const after = this.value.slice(this.cursor);
    this.value = before + text + after;
    this.cursor = deleteFrom + text.length;
  }
}

let fieldSim: FieldSimulator;

vi.mock("../../src/content/text-injector", () => {
  return {
    TextInjector: class {
      private composing = false;
      insert(_field: HTMLElement, text: string) {
        fieldSim.insert(text);
      }
      replaceBeforeCursor(_field: HTMLElement, deleteCount: number, text: string) {
        fieldSim.replaceBeforeCursor(deleteCount, text);
      }
      deleteBeforeCursor(_field: HTMLElement, count: number) {
        fieldSim.replaceBeforeCursor(count, "");
      }
      startComposition(_field: HTMLElement) {
        this.composing = true;
        fieldSim.composing = true;
      }
      updateComposition(_field: HTMLElement, text: string, previousLength: number) {
        if (!this.composing) {
          this.composing = true;
          fieldSim.composing = true;
        }
        if (previousLength > 0) {
          fieldSim.replaceBeforeCursor(previousLength, text);
        } else {
          fieldSim.insert(text);
        }
      }
      endComposition(_field: HTMLElement, text: string, previousLength: number) {
        if (!this.composing) return;
        if (previousLength > 0) {
          fieldSim.replaceBeforeCursor(previousLength, text);
        }
        this.composing = false;
        fieldSim.composing = false;
      }
      cancelComposition(_field: HTMLElement, previousLength: number) {
        if (!this.composing) return;
        if (previousLength > 0) {
          fieldSim.replaceBeforeCursor(previousLength, "");
        }
        this.composing = false;
        fieldSim.composing = false;
      }
      isComposing() {
        return this.composing;
      }
    },
  };
});

const rules: TransliterationRules = {
  vowels: hindiRules.vowels,
  consonants: hindiRules.consonants,
  nuqta_consonants: hindiRules.nuqta_consonants,
  conjuncts: hindiRules.conjuncts,
  special: hindiRules.special,
  halant: hindiRules.halant,
};

describe("CompositionManager", () => {
  let manager: CompositionManager;
  let candidatesHistory: { candidates: Candidate[]; selectedIndex: number }[];
  let compositionEnded: boolean;
  let composingState: boolean;
  let mockField: HTMLElement;

  beforeEach(() => {
    candidatesHistory = [];
    compositionEnded = false;
    composingState = false;
    fieldSim = new FieldSimulator();

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
      },
      5
    );

    // Mock field element
    mockField = {
      tagName: "INPUT",
      focus: vi.fn(),
      selectionStart: 0,
      selectionEnd: 0,
      value: "",
    } as unknown as HTMLElement;
  });

  describe("State transitions", () => {
    it("should start in IDLE state", () => {
      const state = manager.getState();
      expect(state.status).toBe("IDLE");
      expect(state.romanBuffer).toBe("");
      expect(state.candidates).toEqual([]);
    });

    it("should transition to COMPOSING on first char", () => {
      manager.handleAction({ type: "char", char: "k" }, mockField);
      const state = manager.getState();
      expect(state.status).toBe("COMPOSING");
      expect(state.romanBuffer).toBe("k");
      expect(composingState).toBe(true);
    });

    it("should return to IDLE after space (commit)", () => {
      manager.handleAction({ type: "char", char: "k" }, mockField);
      manager.handleAction({ type: "space" }, mockField);
      const state = manager.getState();
      expect(state.status).toBe("IDLE");
      expect(compositionEnded).toBe(true);
    });

    it("should return to IDLE after escape (cancel)", () => {
      manager.handleAction({ type: "char", char: "k" }, mockField);
      manager.handleAction({ type: "escape" }, mockField);
      const state = manager.getState();
      expect(state.status).toBe("IDLE");
      expect(compositionEnded).toBe(true);
    });

    it("should return to IDLE after commit action", () => {
      manager.handleAction({ type: "char", char: "k" }, mockField);
      manager.handleAction({ type: "commit" }, mockField);
      const state = manager.getState();
      expect(state.status).toBe("IDLE");
    });
  });

  describe("Roman buffer management", () => {
    it("should accumulate characters in the buffer", () => {
      manager.handleAction({ type: "char", char: "n" }, mockField);
      expect(manager.getState().romanBuffer).toBe("n");

      manager.handleAction({ type: "char", char: "a" }, mockField);
      expect(manager.getState().romanBuffer).toBe("na");

      manager.handleAction({ type: "char", char: "m" }, mockField);
      expect(manager.getState().romanBuffer).toBe("nam");
    });

    it("should handle backspace by removing last char", () => {
      manager.handleAction({ type: "char", char: "n" }, mockField);
      manager.handleAction({ type: "char", char: "a" }, mockField);
      manager.handleAction({ type: "char", char: "m" }, mockField);
      manager.handleAction({ type: "backspace" }, mockField);
      expect(manager.getState().romanBuffer).toBe("na");
    });

    it("should cancel composition on backspace with single char", () => {
      manager.handleAction({ type: "char", char: "k" }, mockField);
      manager.handleAction({ type: "backspace" }, mockField);
      expect(manager.getState().status).toBe("IDLE");
      expect(compositionEnded).toBe(true);
    });

    it("should clear buffer after commit", () => {
      manager.handleAction({ type: "char", char: "k" }, mockField);
      manager.handleAction({ type: "space" }, mockField);
      expect(manager.getState().romanBuffer).toBe("");
    });
  });

  describe("Candidate generation", () => {
    it("should generate candidates on char input", () => {
      manager.handleAction({ type: "char", char: "k" }, mockField);
      expect(candidatesHistory.length).toBeGreaterThan(0);
      const lastUpdate = candidatesHistory[candidatesHistory.length - 1];
      expect(lastUpdate.candidates.length).toBeGreaterThan(0);
      expect(lastUpdate.selectedIndex).toBe(0);
    });

    it("should update candidates as buffer grows", () => {
      manager.handleAction({ type: "char", char: "k" }, mockField);
      const afterK = candidatesHistory[candidatesHistory.length - 1];

      manager.handleAction({ type: "char", char: "a" }, mockField);
      const afterKa = candidatesHistory[candidatesHistory.length - 1];

      // Candidates should change as input changes
      expect(afterK).not.toEqual(afterKa);
    });
  });

  describe("Candidate selection", () => {
    it("should select candidate by index", () => {
      manager.handleAction({ type: "char", char: "k" }, mockField);
      // Select candidate at index 0 should commit
      manager.handleAction({ type: "select", index: 0 }, mockField);
      expect(manager.getState().status).toBe("IDLE");
    });

    it("should ignore out-of-range selection", () => {
      manager.handleAction({ type: "char", char: "k" }, mockField);
      manager.handleAction({ type: "select", index: 99 }, mockField);
      // Should still be composing since selection was invalid
      expect(manager.getState().status).toBe("COMPOSING");
    });
  });

  describe("Arrow navigation", () => {
    it("should navigate candidates with arrow keys", () => {
      manager.handleAction({ type: "char", char: "k" }, mockField);
      const initialIndex = manager.getState().selectedIndex;
      expect(initialIndex).toBe(0);

      manager.handleAction({ type: "arrowDown" }, mockField);
      const lastUpdate = candidatesHistory[candidatesHistory.length - 1];
      // If there are multiple candidates, index should change
      if (manager.getState().candidates.length > 1) {
        expect(lastUpdate.selectedIndex).toBe(1);
      }
    });

    it("should wrap around on arrow navigation", () => {
      manager.handleAction({ type: "char", char: "k" }, mockField);
      // Navigate up from 0 should wrap to last
      manager.handleAction({ type: "arrowUp" }, mockField);
      const lastUpdate = candidatesHistory[candidatesHistory.length - 1];
      const numCandidates = manager.getState().candidates.length;
      if (numCandidates > 0) {
        expect(lastUpdate.selectedIndex).toBe(numCandidates - 1);
      }
    });
  });

  describe("Devanagari preview", () => {
    it("should update devanagariPreview on input", () => {
      manager.handleAction({ type: "char", char: "k" }, mockField);
      expect(manager.getState().devanagariPreview).toBeTruthy();
    });

    it("should have non-empty preview for valid input", () => {
      manager.handleAction({ type: "char", char: "n" }, mockField);
      manager.handleAction({ type: "char", char: "a" }, mockField);
      const preview = manager.getState().devanagariPreview;
      expect(preview.length).toBeGreaterThan(0);
    });
  });

  describe("Tab commit", () => {
    it("should commit on tab key", () => {
      manager.handleAction({ type: "char", char: "k" }, mockField);
      manager.handleAction({ type: "tab" }, mockField);
      expect(manager.getState().status).toBe("IDLE");
      expect(compositionEnded).toBe(true);
    });
  });

  describe("Field content correctness (no duplication)", () => {
    it("should produce correct field content for simple consonant+vowel", () => {
      // "ka" → क (inherent 'a', single code unit)
      for (const ch of "ka") {
        manager.handleAction({ type: "char", char: ch }, mockField);
      }
      const preview = manager.getState().devanagariPreview;
      manager.handleAction({ type: "space" }, mockField);
      // Field should contain exactly the committed text + space
      expect(fieldSim.value).toBe(preview + " ");
    });

    it("should not duplicate characters for text with matras (kaa → का)", () => {
      // "kaa" → का (2 code units: क + ा matra)
      for (const ch of "kaa") {
        manager.handleAction({ type: "char", char: ch }, mockField);
      }
      const preview = manager.getState().devanagariPreview;
      expect(preview).toBe("का");
      manager.handleAction({ type: "commit" }, mockField);
      expect(fieldSim.value).toBe("का");
    });

    it("should not duplicate characters for text with i-matra (ki → कि)", () => {
      for (const ch of "ki") {
        manager.handleAction({ type: "char", char: ch }, mockField);
      }
      const preview = manager.getState().devanagariPreview;
      expect(preview).toBe("कि");
      manager.handleAction({ type: "commit" }, mockField);
      expect(fieldSim.value).toBe("कि");
    });

    it("should not duplicate characters for longer words (paanee → पानी)", () => {
      for (const ch of "paanee") {
        manager.handleAction({ type: "char", char: ch }, mockField);
      }
      const preview = manager.getState().devanagariPreview;
      expect(preview).toBe("पानी");
      manager.handleAction({ type: "space" }, mockField);
      expect(fieldSim.value).toBe("पानी ");
    });

    it("should not duplicate when selecting a candidate by index", () => {
      for (const ch of "kaa") {
        manager.handleAction({ type: "char", char: ch }, mockField);
      }
      const candidates = manager.getState().candidates;
      expect(candidates.length).toBeGreaterThan(0);
      manager.handleAction({ type: "select", index: 0 }, mockField);
      // Field should contain exactly the selected candidate, no duplication
      expect(fieldSim.value).toBe(candidates[0].text);
    });

    it("should handle backspace correctly with multi-code-unit preview", () => {
      // Type "kaa" → "का", then backspace → "ka" → "क"
      for (const ch of "kaa") {
        manager.handleAction({ type: "char", char: ch }, mockField);
      }
      expect(fieldSim.value).toBe("का");
      manager.handleAction({ type: "backspace" }, mockField);
      const preview = manager.getState().devanagariPreview;
      expect(fieldSim.value).toBe(preview);
    });

    it("should cleanly cancel composition with multi-code-unit preview", () => {
      for (const ch of "kee") {
        manager.handleAction({ type: "char", char: ch }, mockField);
      }
      expect(fieldSim.value.length).toBeGreaterThan(0);
      manager.handleAction({ type: "escape" }, mockField);
      expect(fieldSim.value).toBe("");
    });

    it("should handle conjuncts correctly (ksh → क्ष)", () => {
      for (const ch of "ksh") {
        manager.handleAction({ type: "char", char: ch }, mockField);
      }
      const preview = manager.getState().devanagariPreview;
      manager.handleAction({ type: "commit" }, mockField);
      expect(fieldSim.value).toBe(preview);
      expect(fieldSim.value.length).toBeGreaterThan(0);
    });

    it("should handle anusvara correctly (M suffix)", () => {
      for (const ch of "naM") {
        manager.handleAction({ type: "char", char: ch }, mockField);
      }
      const preview = manager.getState().devanagariPreview;
      manager.handleAction({ type: "commit" }, mockField);
      expect(fieldSim.value).toBe(preview);
    });

    it("should produce correct content over two consecutive words", () => {
      // First word
      for (const ch of "kaa") {
        manager.handleAction({ type: "char", char: ch }, mockField);
      }
      manager.handleAction({ type: "space" }, mockField);
      const afterFirst = fieldSim.value;

      // Second word
      for (const ch of "paanee") {
        manager.handleAction({ type: "char", char: ch }, mockField);
      }
      manager.handleAction({ type: "space" }, mockField);

      expect(fieldSim.value).toBe(afterFirst + "पानी ");
    });
  });

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
      for (const ch of "ka") {
        manager.handleAction({ type: "char", char: ch }, mockField);
      }
      manager.handleAction({ type: "space" }, mockField);

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

  describe("No-op in IDLE", () => {
    it("should not crash on backspace in IDLE", () => {
      manager.handleAction({ type: "backspace" }, mockField);
      expect(manager.getState().status).toBe("IDLE");
    });

    it("should not crash on escape in IDLE", () => {
      manager.handleAction({ type: "escape" }, mockField);
      expect(manager.getState().status).toBe("IDLE");
    });

    it("should not crash on space in IDLE", () => {
      manager.handleAction({ type: "space" }, mockField);
      expect(manager.getState().status).toBe("IDLE");
    });

    it("should not crash on commit in IDLE", () => {
      manager.handleAction({ type: "commit" }, mockField);
      expect(manager.getState().status).toBe("IDLE");
    });
  });
});
