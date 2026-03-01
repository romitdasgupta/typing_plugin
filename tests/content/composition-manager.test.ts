import { describe, it, expect, beforeEach, vi } from "vitest";
import { CompositionManager } from "../../src/content/composition-manager";
import type { Candidate, TransliterationRules } from "../../src/shared/types";
import hindiRules from "../../data/hindi/transliteration-rules.json";

// Mock TextInjector since we don't have a DOM in Node tests
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
