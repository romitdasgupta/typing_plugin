/**
 * Injects Devanagari text into input fields using browser-native methods.
 *
 * Strategy:
 * 1. Primary: document.execCommand('insertText') — preserves undo, fires events
 * 2. Fallback: Direct value manipulation + synthetic InputEvent
 *
 * This is critical for compatibility with WhatsApp Web, Telegram, Gmail,
 * and React/Vue/Angular apps that rely on native input events.
 */
export class TextInjector {
  private composing = false;

  /** Begin a composition session. Call before the first preview insert. */
  startComposition(field: HTMLElement): void {
    if (this.composing) return;
    this.composing = true;
    field.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true, data: "" })
    );
  }

  /** Update the composition preview — replaces previous preview text. */
  updateComposition(
    field: HTMLElement,
    text: string,
    previousLength: number
  ): void {
    if (!this.composing) this.startComposition(field);

    field.dispatchEvent(
      new CompositionEvent("compositionupdate", { bubbles: true, data: text })
    );

    if (previousLength > 0) {
      this.replaceBeforeCursor(field, previousLength, text);
    } else {
      this.insert(field, text);
    }
  }

  /** End composition — commit the final text. */
  endComposition(
    field: HTMLElement,
    text: string,
    previousLength: number
  ): void {
    if (!this.composing) return;

    if (previousLength > 0) {
      this.replaceBeforeCursor(field, previousLength, text);
    }

    field.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: text })
    );
    this.composing = false;
  }

  /** Cancel composition — remove preview text. */
  cancelComposition(field: HTMLElement, previousLength: number): void {
    if (!this.composing) return;

    if (previousLength > 0) {
      this.deleteBeforeCursor(field, previousLength);
    }

    field.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "" })
    );
    this.composing = false;
  }

  isComposing(): boolean {
    return this.composing;
  }

  /**
   * Insert text at the current cursor position in the given field.
   */
  insert(field: HTMLElement, text: string): void {
    if (!text) return;

    if (this.isInputOrTextarea(field)) {
      this.insertIntoInput(field as HTMLInputElement | HTMLTextAreaElement, text);
    } else if (this.isContentEditable(field)) {
      this.insertIntoContentEditable(field, text);
    }
  }

  /**
   * Replace the last N characters before the cursor with new text.
   * Used for updating the inline preview as the user types.
   */
  replaceBeforeCursor(field: HTMLElement, deleteCount: number, text: string): void {
    if (this.isInputOrTextarea(field)) {
      this.replaceInInput(
        field as HTMLInputElement | HTMLTextAreaElement,
        deleteCount,
        text
      );
    } else if (this.isContentEditable(field)) {
      this.replaceInContentEditable(field, deleteCount, text);
    }
  }

  /**
   * Delete the last N characters before the cursor.
   */
  deleteBeforeCursor(field: HTMLElement, count: number): void {
    if (count <= 0) return;
    this.replaceBeforeCursor(field, count, "");
  }

  private insertIntoInput(
    field: HTMLInputElement | HTMLTextAreaElement,
    text: string
  ): void {
    field.focus();

    // Try execCommand first (preserves undo stack)
    if (this.tryExecCommand(text)) return;

    // Fallback: direct value manipulation
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? start;
    const before = field.value.slice(0, start);
    const after = field.value.slice(end);

    field.value = before + text + after;
    const newPos = start + text.length;
    field.setSelectionRange(newPos, newPos);

    this.dispatchInputEvent(field, text);
  }

  private insertIntoContentEditable(field: HTMLElement, text: string): void {
    field.focus();

    // Try execCommand first
    if (this.tryExecCommand(text)) return;

    // Fallback: insert text node at selection
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);

    // Move cursor after inserted text
    range.setStartAfter(textNode);
    range.setEndAfter(textNode);
    sel.removeAllRanges();
    sel.addRange(range);

    this.dispatchInputEvent(field, text);
  }

  private replaceInInput(
    field: HTMLInputElement | HTMLTextAreaElement,
    deleteCount: number,
    text: string
  ): void {
    field.focus();

    const cursorPos = field.selectionStart ?? field.value.length;
    const deleteFrom = Math.max(0, cursorPos - deleteCount);

    // Select the text to replace
    field.setSelectionRange(deleteFrom, cursorPos);

    // Try execCommand for the replacement
    if (this.tryExecCommand(text)) return;

    // Fallback
    const before = field.value.slice(0, deleteFrom);
    const after = field.value.slice(cursorPos);
    field.value = before + text + after;
    const newPos = deleteFrom + text.length;
    field.setSelectionRange(newPos, newPos);

    this.dispatchInputEvent(field, text);
  }

  private replaceInContentEditable(
    field: HTMLElement,
    deleteCount: number,
    text: string
  ): void {
    field.focus();

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    // Extend selection backwards by deleteCount characters
    for (let i = 0; i < deleteCount; i++) {
      sel.modify("extend", "backward", "character");
    }

    // Now replace the selection
    if (this.tryExecCommand(text)) return;

    // Fallback
    const newRange = sel.getRangeAt(0);
    newRange.deleteContents();
    if (text) {
      const textNode = document.createTextNode(text);
      newRange.insertNode(textNode);
      newRange.setStartAfter(textNode);
      newRange.setEndAfter(textNode);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }

    this.dispatchInputEvent(field, text);
  }

  private tryExecCommand(text: string): boolean {
    try {
      return document.execCommand("insertText", false, text);
    } catch {
      return false;
    }
  }

  private dispatchInputEvent(field: HTMLElement, data: string): void {
    const event = new InputEvent("input", {
      bubbles: true,
      cancelable: false,
      inputType: "insertText",
      data,
    });
    field.dispatchEvent(event);
  }

  private isInputOrTextarea(
    el: HTMLElement
  ): el is HTMLInputElement | HTMLTextAreaElement {
    const tag = el.tagName.toLowerCase();
    return tag === "input" || tag === "textarea";
  }

  private isContentEditable(el: HTMLElement): boolean {
    const ce = el.getAttribute("contenteditable");
    return ce === "true" || ce === "";
  }
}
