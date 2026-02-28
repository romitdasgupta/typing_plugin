/**
 * Offscreen document for Web Speech API.
 *
 * Runs SpeechRecognition with lang="hi-IN" in a hidden DOM context.
 * Communicates with the service worker via chrome.runtime messages.
 *
 * Message flow:
 *   Content script → Service worker → This offscreen doc
 *   This offscreen doc → Service worker → Content script
 */

import type { ExtensionMessage } from "../shared/message-protocol";

// Use vendor-prefixed SpeechRecognition for broader compatibility
const SpeechRecognitionCtor =
  (window as unknown as Record<string, unknown>).SpeechRecognition ||
  (window as unknown as Record<string, unknown>).webkitSpeechRecognition;

let recognition: unknown = null;
let isListening = false;

function startRecognition(lang: string): void {
  if (!SpeechRecognitionCtor) {
    sendError("SpeechRecognition API not available in this browser");
    return;
  }

  if (isListening) {
    stopRecognition();
  }

  recognition = new (SpeechRecognitionCtor as new () => unknown)();

  const rec = recognition as unknown as {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
    maxAlternatives: number;
    start(): void;
    stop(): void;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: { error: string }) => void) | null;
    onend: (() => void) | null;
  };

  rec.lang = lang || "hi-IN";
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  rec.onresult = (event: SpeechRecognitionEvent) => {
    const last = event.results[event.results.length - 1];
    const transcript = last[0].transcript;
    const isFinal = last.isFinal;

    sendResult(transcript, isFinal);

    if (isFinal) {
      isListening = false;
    }
  };

  rec.onerror = (event: { error: string }) => {
    // "no-speech" and "aborted" are not real errors
    if (event.error !== "no-speech" && event.error !== "aborted") {
      sendError(event.error);
    }
    isListening = false;
  };

  rec.onend = () => {
    isListening = false;
  };

  try {
    rec.start();
    isListening = true;
  } catch (e) {
    sendError(String(e));
  }
}

function stopRecognition(): void {
  if (recognition && isListening) {
    try {
      (recognition as unknown as { stop(): void }).stop();
    } catch {
      // Already stopped
    }
    isListening = false;
  }
}

function sendResult(transcript: string, isFinal: boolean): void {
  chrome.runtime.sendMessage({
    type: "VOICE_RESULT",
    transcript,
    isFinal,
  } satisfies ExtensionMessage);
}

function sendError(error: string): void {
  chrome.runtime.sendMessage({
    type: "VOICE_ERROR",
    error,
  } satisfies ExtensionMessage);
}

// Listen for messages from the service worker
chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  switch (message.type) {
    case "VOICE_START":
      startRecognition(message.lang);
      break;
    case "VOICE_STOP":
      stopRecognition();
      break;
  }
});

// Type declarations for SpeechRecognition events
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
