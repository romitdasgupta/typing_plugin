import type { ExtensionMessage } from "../shared/message-protocol";
import { TextInjector } from "./text-injector";
import { CANDIDATE_STRIP_Z_INDEX } from "../shared/constants";

/**
 * Voice input UI and controller for the content script.
 *
 * Shows a small mic button near the active text field.
 * On click: sends VOICE_START to service worker → offscreen doc → SpeechRecognition.
 * On result: injects transcript directly into the field (already Devanagari from speech API).
 */
export class VoiceInput {
  private host: HTMLDivElement;
  private shadow: ShadowRoot;
  private button: HTMLButtonElement;
  private injector: TextInjector;
  private activeField: HTMLElement | null = null;
  private listening = false;

  constructor() {
    this.injector = new TextInjector();

    // Create Shadow DOM host
    this.host = document.createElement("div");
    this.host.id = "hindi-typing-voice";
    this.host.style.position = "fixed";
    this.host.style.zIndex = String(CANDIDATE_STRIP_Z_INDEX - 1);
    this.host.style.pointerEvents = "none";
    this.host.style.top = "0";
    this.host.style.left = "0";
    this.host.style.width = "0";
    this.host.style.height = "0";

    this.shadow = this.host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = this.getStyles();
    this.shadow.appendChild(style);

    this.button = document.createElement("button");
    this.button.className = "mic-button";
    this.button.setAttribute("aria-label", "Voice input (Hindi)");
    this.button.textContent = "🎤";
    this.button.style.display = "none";
    this.button.style.pointerEvents = "auto";

    this.button.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleListening();
    });

    this.shadow.appendChild(this.button);
    document.body.appendChild(this.host);

    // Listen for voice results from the service worker
    chrome.runtime.onMessage.addListener(this.handleMessage);
  }

  /** Show the mic button near a text field. */
  showNear(field: HTMLElement): void {
    this.activeField = field;

    const rect = field.getBoundingClientRect();
    this.button.style.position = "fixed";
    this.button.style.top = `${rect.top + 4}px`;
    this.button.style.left = `${rect.right + 4}px`;

    // If button would go off-screen, place inside the field's right edge
    if (rect.right + 40 > window.innerWidth) {
      this.button.style.left = `${rect.right - 36}px`;
    }

    this.button.style.display = "flex";
  }

  /** Hide the mic button. */
  hide(): void {
    this.button.style.display = "none";
    if (this.listening) {
      this.stopListening();
    }
  }

  /** Clean up. */
  destroy(): void {
    chrome.runtime.onMessage.removeListener(this.handleMessage);
    if (this.listening) {
      this.stopListening();
    }
    this.host.remove();
  }

  private toggleListening(): void {
    if (this.listening) {
      this.stopListening();
    } else {
      this.startListening();
    }
  }

  private startListening(): void {
    this.listening = true;
    this.button.classList.add("listening");

    chrome.runtime.sendMessage({
      type: "VOICE_START",
      lang: "hi-IN",
    } satisfies ExtensionMessage);
  }

  private stopListening(): void {
    this.listening = false;
    this.button.classList.remove("listening");

    chrome.runtime.sendMessage({
      type: "VOICE_STOP",
    } satisfies ExtensionMessage);
  }

  private handleMessage = (message: ExtensionMessage): void => {
    if (message.type === "VOICE_RESULT") {
      if (message.isFinal && this.activeField) {
        this.injector.insert(this.activeField, message.transcript);
        this.stopListening();
      }
    } else if (message.type === "VOICE_ERROR") {
      console.warn("Voice input error:", message.error);
      this.stopListening();
    }
  };

  private getStyles(): string {
    return `
      .mic-button {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: none;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.95);
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
        cursor: pointer;
        font-size: 14px;
        padding: 0;
        transition: background 0.15s, transform 0.15s;
      }

      .mic-button:hover {
        background: #f0f0f0;
        transform: scale(1.1);
      }

      .mic-button.listening {
        background: #ef4444;
        animation: pulse 1.5s ease-in-out infinite;
      }

      @keyframes pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
        50% { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
      }

      @media (prefers-color-scheme: dark) {
        .mic-button {
          background: rgba(60, 60, 60, 0.95);
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
        }
        .mic-button:hover {
          background: #505050;
        }
      }
    `;
  }
}
