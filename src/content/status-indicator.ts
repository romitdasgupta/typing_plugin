import { CANDIDATE_STRIP_Z_INDEX } from "../shared/constants";

/**
 * Small pill that shows the current input mode (Hindi/English)
 * near the active text field. Uses Shadow DOM for style isolation.
 *
 * Appears on field focus and on toggle, auto-fades after 2 seconds.
 */
export class StatusIndicator {
  private host: HTMLDivElement;
  private shadow: ShadowRoot;
  private pill: HTMLDivElement;
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;
  private enabled = true;

  constructor() {
    this.host = document.createElement("div");
    this.host.id = "hindi-typing-indicator";
    this.host.style.position = "fixed";
    this.host.style.zIndex = String(CANDIDATE_STRIP_Z_INDEX - 1);
    this.host.style.pointerEvents = "none";
    this.host.style.top = "0";
    this.host.style.left = "0";
    this.host.style.width = "0";
    this.host.style.height = "0";

    this.shadow = this.host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = this.getStyles();
    this.shadow.appendChild(style);

    this.pill = document.createElement("div");
    this.pill.className = "indicator-pill active";
    this.pill.textContent = "हि";
    this.shadow.appendChild(this.pill);

    document.body.appendChild(this.host);
  }

  /** Show the indicator near the given field. */
  show(field: HTMLElement): void {
    const rect = field.getBoundingClientRect();
    this.pill.style.position = "fixed";
    this.pill.style.top = `${rect.bottom - 24}px`;
    this.pill.style.left = `${rect.right - 36}px`;
    this.pill.style.opacity = "1";
    this.pill.style.display = "flex";
    this.startFadeTimer();
  }

  /** Hide the indicator immediately. */
  hide(): void {
    this.pill.style.display = "none";
    this.clearFadeTimer();
  }

  /** Update the displayed mode. */
  setMode(hindiActive: boolean): void {
    this.enabled = hindiActive;
    this.pill.textContent = hindiActive ? "हि" : "EN";
    this.pill.className = `indicator-pill ${hindiActive ? "active" : "inactive"}`;
    this.pill.style.opacity = "1";
    this.pill.style.display = "flex";
    this.startFadeTimer();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  destroy(): void {
    this.clearFadeTimer();
    this.host.remove();
  }

  private startFadeTimer(): void {
    this.clearFadeTimer();
    this.fadeTimer = setTimeout(() => {
      this.pill.style.opacity = "0";
    }, 2000);
  }

  private clearFadeTimer(): void {
    if (this.fadeTimer) {
      clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
    }
  }

  private getStyles(): string {
    return `
      .indicator-pill {
        display: none;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 20px;
        border-radius: 10px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 11px;
        font-weight: 700;
        color: white;
        transition: opacity 0.3s ease;
        user-select: none;
        pointer-events: none;
      }
      .indicator-pill.active {
        background: #4CAF50;
      }
      .indicator-pill.inactive {
        background: #9E9E9E;
      }
    `;
  }
}
