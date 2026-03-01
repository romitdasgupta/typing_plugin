import type { Candidate } from "../shared/types";
import { CANDIDATE_STRIP_Z_INDEX } from "../shared/constants";

/**
 * Floating candidate strip rendered in a Shadow DOM.
 *
 * Shows transliteration alternatives as a horizontal bar near the text cursor.
 * Isolated from host page styles via Shadow DOM. Supports keyboard (number keys,
 * arrows) and mouse selection.
 *
 * Positioning:
 * - contenteditable: window.getSelection().getRangeAt(0).getBoundingClientRect()
 * - input/textarea: mirror-div technique (clone field styles, measure caret offset)
 */
export class CandidateStrip {
  private host: HTMLDivElement;
  private shadow: ShadowRoot;
  private container: HTMLDivElement;
  private selectCallback: ((index: number) => void) | null = null;
  private visible = false;
  private predictionContainer: HTMLDivElement;
  private predictionSelectCallback: ((word: string) => void) | null = null;
  private loadingEl: HTMLDivElement;

  constructor() {
    // Create host element
    this.host = document.createElement("div");
    this.host.id = "hindi-typing-candidates";
    this.host.style.position = "fixed";
    this.host.style.zIndex = String(CANDIDATE_STRIP_Z_INDEX);
    this.host.style.pointerEvents = "none";
    this.host.style.top = "0";
    this.host.style.left = "0";
    this.host.style.width = "0";
    this.host.style.height = "0";

    // Create Shadow DOM
    this.shadow = this.host.attachShadow({ mode: "closed" });

    // Inject styles
    const style = document.createElement("style");
    style.textContent = this.getStyles();
    this.shadow.appendChild(style);

    // Create container
    this.container = document.createElement("div");
    this.container.className = "candidate-strip";
    this.container.style.display = "none";
    this.shadow.appendChild(this.container);

    // Prediction row container
    this.predictionContainer = document.createElement("div");
    this.predictionContainer.className = "prediction-strip";
    this.predictionContainer.style.display = "none";
    this.shadow.appendChild(this.predictionContainer);

    // Loading indicator
    this.loadingEl = document.createElement("div");
    this.loadingEl.className = "prediction-loading";
    this.loadingEl.textContent = "✦";
    this.loadingEl.style.display = "none";
    this.shadow.appendChild(this.loadingEl);

    document.body.appendChild(this.host);

    // Hide on scroll/resize
    window.addEventListener("scroll", this.handleScrollResize, true);
    window.addEventListener("resize", this.handleScrollResize);
  }

  /** Register callback for when a candidate is clicked. */
  onSelect(callback: (index: number) => void): void {
    this.selectCallback = callback;
  }

  onPredictionSelect(callback: (word: string) => void): void {
    this.predictionSelectCallback = callback;
  }

  updatePredictions(predictions: string[]): void {
    while (this.predictionContainer.firstChild) {
      this.predictionContainer.removeChild(this.predictionContainer.firstChild);
    }
    this.loadingEl.style.display = "none";

    if (predictions.length === 0) {
      this.predictionContainer.style.display = "none";
      return;
    }

    const marker = document.createElement("span");
    marker.className = "prediction-marker";
    marker.textContent = "✦";
    this.predictionContainer.appendChild(marker);

    predictions.forEach((word) => {
      const item = document.createElement("div");
      item.className = "prediction-item";
      item.style.pointerEvents = "auto";
      item.textContent = word;

      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.predictionSelectCallback?.(word);
      });

      this.predictionContainer.appendChild(item);
    });

    this.predictionContainer.style.display = "flex";
  }

  showLoading(): void {
    this.predictionContainer.style.display = "none";
    this.loadingEl.style.display = "flex";
  }

  hidePredictions(): void {
    this.predictionContainer.style.display = "none";
    this.loadingEl.style.display = "none";
  }

  /** Update displayed candidates and highlight the selected one. */
  update(candidates: Candidate[], selectedIndex: number): void {
    // Clear container safely (no innerHTML)
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }

    candidates.forEach((candidate, index) => {
      const item = document.createElement("div");
      item.className = `candidate-item${index === selectedIndex ? " selected" : ""}`;
      item.style.pointerEvents = "auto";

      const keyHint = document.createElement("span");
      keyHint.className = "key-hint";
      keyHint.textContent = String(index + 1);

      const text = document.createElement("span");
      text.className = "candidate-text";
      text.textContent = candidate.text;

      item.appendChild(keyHint);
      item.appendChild(text);

      item.addEventListener("mousedown", (e) => {
        e.preventDefault(); // Don't steal focus from text field
        e.stopPropagation();
        this.selectCallback?.(index);
      });

      this.container.appendChild(item);
    });
  }

  /** Show the strip near the given text field's cursor. */
  show(field: HTMLElement): void {
    const pos = this.getCursorPosition(field);
    if (!pos) return;

    const stripHeight = 36;
    const gap = 4;

    let top = pos.bottom + gap;
    let left = pos.left;

    // Flip above if too close to viewport bottom
    if (top + stripHeight > window.innerHeight) {
      top = pos.top - stripHeight - gap;
    }

    // Clamp left to viewport
    const stripWidth = this.container.scrollWidth || 200;
    if (left + stripWidth > window.innerWidth) {
      left = window.innerWidth - stripWidth - 8;
    }
    if (left < 4) left = 4;

    this.container.style.position = "fixed";
    this.container.style.top = `${top}px`;
    this.container.style.left = `${left}px`;
    this.container.style.display = "flex";
    this.visible = true;

    // Position prediction row directly below candidate strip
    if (this.predictionContainer.style.display !== "none") {
      this.predictionContainer.style.position = "fixed";
      this.predictionContainer.style.top = `${top + stripHeight + 2}px`;
      this.predictionContainer.style.left = `${left}px`;
    }
    if (this.loadingEl.style.display !== "none") {
      this.loadingEl.style.position = "fixed";
      this.loadingEl.style.top = `${top + stripHeight + 2}px`;
      this.loadingEl.style.left = `${left}px`;
    }
  }

  /** Hide the candidate strip. */
  hide(): void {
    this.container.style.display = "none";
    this.predictionContainer.style.display = "none";
    this.loadingEl.style.display = "none";
    this.visible = false;
  }

  isVisible(): boolean {
    return this.visible;
  }

  /** Clean up DOM elements and listeners. */
  destroy(): void {
    window.removeEventListener("scroll", this.handleScrollResize, true);
    window.removeEventListener("resize", this.handleScrollResize);
    this.host.remove();
  }

  private handleScrollResize = (): void => {
    if (this.visible) {
      this.hide();
    }
  };

  /**
   * Get the pixel position of the cursor in the given field.
   */
  private getCursorPosition(
    field: HTMLElement
  ): { top: number; bottom: number; left: number } | null {
    const tag = field.tagName.toLowerCase();

    if (tag === "input" || tag === "textarea") {
      return this.getInputCursorPosition(
        field as HTMLInputElement | HTMLTextAreaElement
      );
    }

    // contenteditable — use Selection API
    return this.getContentEditableCursorPosition();
  }

  /**
   * Mirror-div technique for input/textarea caret position.
   */
  private getInputCursorPosition(
    field: HTMLInputElement | HTMLTextAreaElement
  ): { top: number; bottom: number; left: number } | null {
    const mirror = document.createElement("div");
    const computed = window.getComputedStyle(field);

    const stylesToCopy = [
      "fontFamily",
      "fontSize",
      "fontWeight",
      "fontStyle",
      "letterSpacing",
      "wordSpacing",
      "textIndent",
      "textTransform",
      "lineHeight",
      "padding",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "border",
      "borderTop",
      "borderRight",
      "borderBottom",
      "borderLeft",
      "boxSizing",
      "whiteSpace",
      "wordWrap",
      "overflowWrap",
    ] as const;

    mirror.style.position = "absolute";
    mirror.style.top = "-9999px";
    mirror.style.left = "-9999px";
    mirror.style.visibility = "hidden";
    mirror.style.overflow = "hidden";

    for (const prop of stylesToCopy) {
      (mirror.style as unknown as Record<string, string>)[prop] =
        computed.getPropertyValue(
          prop.replace(/([A-Z])/g, "-$1").toLowerCase()
        );
    }

    if (field.tagName.toLowerCase() === "input") {
      mirror.style.whiteSpace = "pre";
      mirror.style.width = "auto";
    } else {
      mirror.style.width = computed.width;
      mirror.style.whiteSpace = "pre-wrap";
    }

    document.body.appendChild(mirror);

    const cursorPos = field.selectionStart ?? field.value.length;
    const textBeforeCursor = field.value.slice(0, cursorPos);

    const textNode = document.createTextNode(textBeforeCursor);
    const marker = document.createElement("span");
    marker.textContent = "|";

    mirror.appendChild(textNode);
    mirror.appendChild(marker);

    const fieldRect = field.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();

    const relativeLeft = markerRect.left - mirrorRect.left;
    const relativeTop = markerRect.top - mirrorRect.top;

    document.body.removeChild(mirror);

    const scrollLeft = field.scrollLeft || 0;
    const scrollTop = field.scrollTop || 0;

    return {
      left: fieldRect.left + relativeLeft - scrollLeft,
      top: fieldRect.top + relativeTop - scrollTop,
      bottom:
        fieldRect.top +
        relativeTop -
        scrollTop +
        parseFloat(computed.lineHeight || computed.fontSize),
    };
  }

  /**
   * Use Selection API for contenteditable cursor position.
   */
  private getContentEditableCursorPosition(): {
    top: number;
    bottom: number;
    left: number;
  } | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;

    const range = sel.getRangeAt(0).cloneRange();
    range.collapse(false);

    const span = document.createElement("span");
    span.textContent = "\u200B"; // zero-width space
    range.insertNode(span);

    const rect = span.getBoundingClientRect();
    const result = {
      left: rect.left,
      top: rect.top,
      bottom: rect.bottom,
    };

    span.parentNode?.removeChild(span);

    sel.removeAllRanges();
    sel.addRange(range);

    return result;
  }

  private getStyles(): string {
    return `
      .candidate-strip {
        position: fixed;
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 2px;
        padding: 4px 6px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        line-height: 1;
        white-space: nowrap;
        user-select: none;
        pointer-events: auto;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        background: rgba(255, 255, 255, 0.95);
        color: #1a1a1a;
      }

      @media (prefers-color-scheme: dark) {
        .candidate-strip {
          background: rgba(40, 40, 40, 0.95);
          color: #e8e8e8;
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.08);
        }
      }

      .candidate-item {
        display: flex;
        align-items: center;
        gap: 3px;
        padding: 4px 8px;
        border-radius: 5px;
        cursor: pointer;
        transition: background 0.1s;
      }

      .candidate-item:hover {
        background: rgba(0, 0, 0, 0.06);
      }

      @media (prefers-color-scheme: dark) {
        .candidate-item:hover {
          background: rgba(255, 255, 255, 0.08);
        }
      }

      .candidate-item.selected {
        background: #2563eb;
        color: white;
      }

      .candidate-item.selected .key-hint {
        background: rgba(255, 255, 255, 0.25);
        color: white;
      }

      @media (prefers-color-scheme: dark) {
        .candidate-item.selected {
          background: #3b82f6;
        }
      }

      .key-hint {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        border-radius: 3px;
        font-size: 10px;
        font-weight: 600;
        background: rgba(0, 0, 0, 0.07);
        color: #666;
        flex-shrink: 0;
      }

      @media (prefers-color-scheme: dark) {
        .key-hint {
          background: rgba(255, 255, 255, 0.1);
          color: #999;
        }
      }

      .candidate-text {
        font-size: 16px;
        font-weight: 500;
      }

      .prediction-strip {
        position: fixed;
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 2px;
        padding: 4px 6px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        line-height: 1;
        white-space: nowrap;
        user-select: none;
        pointer-events: auto;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.04);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        background: rgba(245, 245, 255, 0.95);
        color: #1a1a1a;
      }

      @media (prefers-color-scheme: dark) {
        .prediction-strip {
          background: rgba(35, 35, 50, 0.95);
          color: #e8e8e8;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.06);
        }
      }

      .prediction-marker {
        font-size: 10px;
        color: #7c3aed;
        margin-right: 2px;
      }

      @media (prefers-color-scheme: dark) {
        .prediction-marker { color: #a78bfa; }
      }

      .prediction-item {
        padding: 4px 8px;
        border-radius: 5px;
        cursor: pointer;
        font-size: 15px;
        font-weight: 500;
        transition: background 0.1s;
      }

      .prediction-item:hover {
        background: rgba(124, 58, 237, 0.1);
      }

      @media (prefers-color-scheme: dark) {
        .prediction-item:hover {
          background: rgba(167, 139, 250, 0.15);
        }
      }

      .prediction-loading {
        position: fixed;
        display: flex;
        align-items: center;
        padding: 4px 8px;
        border-radius: 8px;
        font-size: 12px;
        color: #7c3aed;
        background: rgba(245, 245, 255, 0.95);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        animation: pulse 1.5s ease-in-out infinite;
      }

      @media (prefers-color-scheme: dark) {
        .prediction-loading {
          color: #a78bfa;
          background: rgba(35, 35, 50, 0.95);
        }
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }
    `;
  }
}
