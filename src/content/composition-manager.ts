import type { CompositionState, Candidate, TransliterationRules } from "../shared/types";
import { Transliterator } from "../engine/transliterator";
import { rankCandidates } from "../engine/candidate-ranker";
import { TextInjector } from "./text-injector";
import type { KeyAction } from "./field-interceptor";

export interface CompositionCallbacks {
  onCandidatesUpdate: (candidates: Candidate[], selectedIndex: number) => void;
  onCompositionEnd: () => void;
  onComposingChange: (composing: boolean) => void;
}

/**
 * Orchestrates the transliteration composition lifecycle.
 *
 * State machine:
 *   IDLE → (char typed) → COMPOSING → (space/select/commit/escape) → IDLE
 *
 * While composing:
 * - Maintains a romanBuffer of accumulated keystrokes
 * - Shows inline Devanagari preview in the text field
 * - Updates candidate strip with alternatives
 * - Handles backspace (removes last char, re-processes)
 * - Handles space (commits top candidate + space)
 * - Handles number keys (selects specific candidate)
 * - Handles escape (cancels, reverts to empty)
 */
export class CompositionManager {
  private state: CompositionState;
  private transliterator: Transliterator;
  private injector: TextInjector;
  private callbacks: CompositionCallbacks;
  private maxCandidates: number;

  /** Length of the current inline preview in the text field (for replacement). */
  private previewLength = 0;

  constructor(
    rules: TransliterationRules,
    callbacks: CompositionCallbacks,
    maxCandidates = 5
  ) {
    this.transliterator = new Transliterator(rules);
    this.injector = new TextInjector();
    this.callbacks = callbacks;
    this.maxCandidates = maxCandidates;

    this.state = this.createIdleState();
  }

  getState(): CompositionState {
    return { ...this.state };
  }

  /**
   * Handle a key action from the field interceptor.
   */
  handleAction(action: KeyAction, field: HTMLElement): void {
    switch (action.type) {
      case "char":
        this.handleChar(action.char, field);
        break;
      case "backspace":
        this.handleBackspace(field);
        break;
      case "space":
        this.commitTopCandidate(field);
        this.injector.insert(field, " ");
        break;
      case "escape":
        this.cancelComposition(field);
        break;
      case "select":
        this.selectCandidate(action.index, field);
        break;
      case "commit":
        this.commitTopCandidate(field);
        break;
      case "tab":
        this.commitTopCandidate(field);
        break;
      case "arrowUp":
        this.navigateCandidates(-1);
        break;
      case "arrowDown":
        this.navigateCandidates(1);
        break;
    }
  }

  /**
   * Handle a Roman character keystroke.
   */
  private handleChar(char: string, field: HTMLElement): void {
    // Start composing if idle
    if (this.state.status === "IDLE") {
      this.state.status = "COMPOSING";
      this.state.romanBuffer = "";
      this.state.committedText = "";
      this.previewLength = 0;
      this.callbacks.onComposingChange(true);
    }

    // Add character to buffer
    this.state.romanBuffer += char;

    // Process the full buffer through the transliterator
    const result = this.transliterator.process(this.state.romanBuffer);

    // Update preview
    const newPreview = result.topCandidate;

    // Replace the old preview in the field with the new one
    if (this.previewLength > 0) {
      this.injector.replaceBeforeCursor(field, this.previewLength, newPreview);
    } else {
      this.injector.insert(field, newPreview);
    }

    this.previewLength = this.graphemeLength(newPreview);
    this.state.devanagariPreview = newPreview;

    // Update candidates
    const candidates = rankCandidates(result.candidates, this.maxCandidates);
    this.state.candidates = candidates;
    this.state.selectedIndex = 0;

    this.callbacks.onCandidatesUpdate(candidates, 0);
  }

  /**
   * Handle backspace: remove last Roman char and re-process buffer.
   */
  private handleBackspace(field: HTMLElement): void {
    if (this.state.status !== "COMPOSING") return;

    if (this.state.romanBuffer.length <= 1) {
      // Buffer will be empty — cancel composition
      this.cancelComposition(field);
      return;
    }

    // Remove last character from Roman buffer
    this.state.romanBuffer = this.state.romanBuffer.slice(0, -1);

    // Re-process the shorter buffer
    const result = this.transliterator.process(this.state.romanBuffer);
    const newPreview = result.topCandidate;

    // Replace the old preview
    if (this.previewLength > 0) {
      this.injector.replaceBeforeCursor(field, this.previewLength, newPreview);
    }

    this.previewLength = this.graphemeLength(newPreview);
    this.state.devanagariPreview = newPreview;

    // Update candidates
    const candidates = rankCandidates(result.candidates, this.maxCandidates);
    this.state.candidates = candidates;
    this.state.selectedIndex = 0;

    this.callbacks.onCandidatesUpdate(candidates, 0);
  }

  /**
   * Commit the top candidate (or selected candidate) and return to IDLE.
   */
  private commitTopCandidate(field: HTMLElement): void {
    if (this.state.status !== "COMPOSING") return;

    const candidate = this.state.candidates[this.state.selectedIndex];
    if (candidate) {
      // Replace preview with the selected candidate's text
      if (this.previewLength > 0) {
        this.injector.replaceBeforeCursor(
          field,
          this.previewLength,
          candidate.text
        );
      }
    }
    // If no candidate, the preview stays as-is (already in the field)

    this.resetState();
  }

  /**
   * Select a specific candidate by index and commit.
   */
  private selectCandidate(index: number, field: HTMLElement): void {
    if (this.state.status !== "COMPOSING") return;
    if (index < 0 || index >= this.state.candidates.length) return;

    this.state.selectedIndex = index;
    this.commitTopCandidate(field);
  }

  /**
   * Navigate candidates with arrow keys.
   */
  private navigateCandidates(direction: number): void {
    if (this.state.status !== "COMPOSING") return;
    if (this.state.candidates.length === 0) return;

    let newIndex = this.state.selectedIndex + direction;
    if (newIndex < 0) newIndex = this.state.candidates.length - 1;
    if (newIndex >= this.state.candidates.length) newIndex = 0;

    this.state.selectedIndex = newIndex;
    this.callbacks.onCandidatesUpdate(
      this.state.candidates,
      this.state.selectedIndex
    );
  }

  /**
   * Cancel composition — remove the preview from the field.
   */
  private cancelComposition(field: HTMLElement): void {
    if (this.state.status !== "COMPOSING") return;

    // Delete the inline preview
    if (this.previewLength > 0) {
      this.injector.deleteBeforeCursor(field, this.previewLength);
    }

    this.resetState();
  }

  private resetState(): void {
    this.state = this.createIdleState();
    this.previewLength = 0;
    this.callbacks.onCompositionEnd();
    this.callbacks.onComposingChange(false);
  }

  private createIdleState(): CompositionState {
    return {
      status: "IDLE",
      romanBuffer: "",
      devanagariPreview: "",
      candidates: [],
      selectedIndex: 0,
      committedText: "",
      enabled: true,
    };
  }

  /**
   * Get the visual length of a Devanagari string for replacement.
   * Matras and combining marks don't count as separate positions for
   * cursor-based replacement — we need the full string length.
   */
  private graphemeLength(text: string): number {
    // Use Intl.Segmenter if available for accurate grapheme counting
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
      const segmenter = new Intl.Segmenter("hi", { granularity: "grapheme" });
      return Array.from(segmenter.segment(text)).length;
    }
    // Fallback: count code points (not perfect for combining chars)
    return [...text].length;
  }
}
