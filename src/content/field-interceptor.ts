import { PASSTHROUGH_KEYS, COMMIT_KEYS, ROMAN_CHARS } from "../shared/constants";

export type KeyAction =
  | { type: "char"; char: string }
  | { type: "backspace" }
  | { type: "space" }
  | { type: "escape" }
  | { type: "select"; index: number }
  | { type: "commit" }
  | { type: "tab" }
  | { type: "arrowUp" }
  | { type: "arrowDown" };

export interface FieldInterceptorCallbacks {
  onKeyAction: (action: KeyAction, field: HTMLElement) => void;
  onFieldFocus: (field: HTMLElement) => void;
  onFieldBlur: () => void;
}

/**
 * Detects text input fields and intercepts keystrokes for transliteration.
 *
 * Handles:
 * - Static and dynamically-added input/textarea/contenteditable elements
 * - Keystroke suppression (preventDefault) for Roman chars when active
 * - Passthrough for Ctrl/Cmd combos, arrows, function keys
 * - Backspace, Space, Escape, number keys (1-9) for candidate selection
 */
export class FieldInterceptor {
  private activeField: HTMLElement | null = null;
  private observer: MutationObserver | null = null;
  private enabled = true;
  private composing = false;
  private callbacks: FieldInterceptorCallbacks;

  constructor(callbacks: FieldInterceptorCallbacks) {
    this.callbacks = callbacks;
  }

  /** Start intercepting keyboard events on text fields. */
  start(): void {
    document.addEventListener("focusin", this.handleFocusIn, true);
    document.addEventListener("focusout", this.handleFocusOut, true);

    // Observe DOM for dynamically added fields (SPAs).
    // Guard against document.body being null (e.g., early iframe load).
    if (document.body) {
      this.observer = new MutationObserver(this.handleMutations);
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    // Detect already-focused field (e.g., contenteditable body inside
    // a Google Docs iframe that was focused before the script loaded)
    const active = document.activeElement as HTMLElement | null;
    if (active && this.isTextField(active)) {
      this.activeField = active;
      this.attachKeyListener();
      this.callbacks.onFieldFocus(active);
    }
  }

  /** Stop intercepting and clean up. */
  stop(): void {
    document.removeEventListener("focusin", this.handleFocusIn, true);
    document.removeEventListener("focusout", this.handleFocusOut, true);
    this.detachKeyListener();
    this.observer?.disconnect();
    this.observer = null;
    this.activeField = null;
  }

  /** Enable or disable interception. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.detachKeyListener();
    }
  }

  /** Notify interceptor that composition has started/stopped. */
  setComposing(composing: boolean): void {
    this.composing = composing;
  }

  getActiveField(): HTMLElement | null {
    return this.activeField;
  }

  private handleFocusIn = (e: FocusEvent): void => {
    const target = e.target as HTMLElement;
    if (!this.enabled || !this.isTextField(target)) return;

    this.activeField = target;
    this.attachKeyListener();
    this.callbacks.onFieldFocus(target);
  };

  private handleFocusOut = (_e: FocusEvent): void => {
    // Delay to allow focus to transfer to candidate strip clicks
    setTimeout(() => {
      const active = document.activeElement as HTMLElement | null;
      if (!active || !this.isTextField(active)) {
        this.detachKeyListener();
        this.activeField = null;
        this.callbacks.onFieldBlur();
      }
    }, 100);
  };

  private handleMutations = (mutations: MutationRecord[]): void => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) {
          // Check if the added node itself is a text field
          if (this.isTextField(node) && node === document.activeElement) {
            this.activeField = node;
            this.attachKeyListener();
            this.callbacks.onFieldFocus(node);
          }
          // Check children for text fields
          const fields = node.querySelectorAll(
            'input[type="text"], input:not([type]), textarea, ' +
            '[contenteditable="true"], [contenteditable=""], ' +
            '[role="textbox"], [role="combobox"]'
          );
          for (const field of fields) {
            if (field === document.activeElement) {
              this.activeField = field as HTMLElement;
              this.attachKeyListener();
              this.callbacks.onFieldFocus(field as HTMLElement);
            }
          }
        }
      }
    }
  };

  private attachKeyListener(): void {
    if (!this.activeField) return;
    this.activeField.addEventListener("keydown", this.handleKeyDown, true);
  }

  private detachKeyListener(): void {
    if (!this.activeField) return;
    this.activeField.removeEventListener("keydown", this.handleKeyDown, true);
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (!this.enabled || !this.activeField) return;

    // Always pass through modifier combos (Ctrl+C, Cmd+V, etc.)
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // Pass through special keys
    if (PASSTHROUGH_KEYS.has(e.key)) return;

    // Space: commit current composition + insert space
    if (e.key === " ") {
      if (this.composing) {
        e.preventDefault();
        this.callbacks.onKeyAction({ type: "space" }, this.activeField);
        return;
      }
      return; // Not composing — let space through normally
    }

    // Backspace: remove last char from buffer
    if (e.key === "Backspace") {
      if (this.composing) {
        e.preventDefault();
        this.callbacks.onKeyAction({ type: "backspace" }, this.activeField);
        return;
      }
      return; // Not composing — let backspace through normally
    }

    // Escape: cancel composition
    if (e.key === "Escape") {
      if (this.composing) {
        e.preventDefault();
        this.callbacks.onKeyAction({ type: "escape" }, this.activeField);
        return;
      }
      return;
    }

    // Enter/Tab: commit current composition then let the key through
    if (COMMIT_KEYS.has(e.key)) {
      if (this.composing) {
        this.callbacks.onKeyAction(
          e.key === "Tab" ? { type: "tab" } : { type: "commit" },
          this.activeField
        );
        // Don't preventDefault — let Enter/Tab pass through after commit
        return;
      }
      return;
    }

    // Number keys 1-9: select candidate by index (only while composing)
    if (this.composing && e.key >= "1" && e.key <= "9") {
      e.preventDefault();
      this.callbacks.onKeyAction(
        { type: "select", index: parseInt(e.key) - 1 },
        this.activeField
      );
      return;
    }

    // Arrow up/down: navigate candidates
    if (this.composing && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      this.callbacks.onKeyAction(
        { type: e.key === "ArrowUp" ? "arrowUp" : "arrowDown" },
        this.activeField
      );
      return;
    }

    // Roman characters: suppress and route to transliteration
    if (e.key.length === 1 && ROMAN_CHARS.includes(e.key)) {
      e.preventDefault();
      this.callbacks.onKeyAction(
        { type: "char", char: e.key },
        this.activeField
      );
      return;
    }

    // Period/dot — handle for danda (।) support
    if (e.key === ".") {
      if (this.composing) {
        e.preventDefault();
        this.callbacks.onKeyAction(
          { type: "char", char: "." },
          this.activeField
        );
        return;
      }
    }
  };

  /** Check if an element is a text input field. */
  private isTextField(el: HTMLElement): boolean {
    const tag = el.tagName.toLowerCase();

    if (tag === "textarea") return true;

    if (tag === "input") {
      const type = (el as HTMLInputElement).type.toLowerCase();
      return (
        type === "text" ||
        type === "search" ||
        type === "url" ||
        type === "" // no type attribute defaults to text
      );
    }

    // contenteditable
    const ce = el.getAttribute("contenteditable");
    if (ce === "true" || ce === "") return true;

    // ARIA role-based detection (Slate, ProseMirror, Notion, etc.)
    const role = el.getAttribute("role");
    if (role === "textbox" || role === "combobox") return true;

    // Check if element has a contenteditable ancestor and is focusable
    if (el.isContentEditable) return true;

    return false;
  }
}
