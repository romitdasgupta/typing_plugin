import { DEFAULT_PREFERENCES } from "../shared/constants";
import type { ExtensionMessage } from "../shared/message-protocol";
import type { UserPreferences } from "../shared/types";
import { LLMClient } from "./llm-client";

const llmClient = new LLMClient();

let currentPrefs: UserPreferences = { ...DEFAULT_PREFERENCES };

/** Load preferences from storage on startup. */
async function loadPrefs(): Promise<void> {
  const result = await chrome.storage.local.get("prefs");
  if (result.prefs) {
    currentPrefs = { ...DEFAULT_PREFERENCES, ...result.prefs };
  }
}

/** Save preferences to storage. */
async function savePrefs(prefs: Partial<UserPreferences>): Promise<void> {
  currentPrefs = { ...currentPrefs, ...prefs };
  await chrome.storage.local.set({ prefs: currentPrefs });
}

/** Toggle transliteration on/off and update badge. */
async function toggleTransliteration(enabled?: boolean): Promise<void> {
  const newEnabled = enabled !== undefined ? enabled : !currentPrefs.enabled;
  await savePrefs({ enabled: newEnabled });
  updateBadge(newEnabled);

  // Notify all content scripts
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  for (const tab of tabs) {
    if (tab.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: "TOGGLE_TRANSLITERATION",
          enabled: newEnabled,
        } satisfies ExtensionMessage);
      } catch {
        // Tab may not have content script — ignore
      }
    }
  }
}

/** Update the extension badge to reflect enabled/disabled state. */
function updateBadge(enabled: boolean): void {
  chrome.action.setBadgeText({ text: enabled ? "हि" : "" });
  chrome.action.setBadgeBackgroundColor({
    color: enabled ? "#4CAF50" : "#9E9E9E",
  });
}

/** Create or get the offscreen document for voice input. */
async function ensureOffscreenDocument(): Promise<void> {
  // @ts-expect-error -- listDocuments exists at runtime but types lag behind
  const existing = await chrome.offscreen.listDocuments?.().catch(() => []);

  if (existing && existing.length > 0) return;

  try {
    await chrome.offscreen.createDocument({
      url: "src/offscreen/speech.html",
      reasons: [chrome.offscreen.Reason.USER_MEDIA],
      justification: "Voice input requires microphone access via Web Speech API",
    });
  } catch {
    // Document may already exist
  }
}

async function handleLLMPredict(
  message: Extract<ExtensionMessage, { type: "LLM_PREDICT" }>
): Promise<ExtensionMessage> {
  if (!currentPrefs.llmEnabled || !currentPrefs.llmEndpoint) {
    console.log("[Hindi Typing] LLM_PREDICT skipped — llmEnabled:", currentPrefs.llmEnabled, "endpoint:", currentPrefs.llmEndpoint || "(empty)");
    return { type: "LLM_PREDICT_ERROR", error: "LLM not configured" };
  }

  console.log("[Hindi Typing] LLM_PREDICT →", {
    endpoint: currentPrefs.llmEndpoint,
    model: currentPrefs.llmModel,
    context: message.sentenceContext,
    partial: message.partialWord,
  });

  try {
    const predictions = await llmClient.predictNextWords(
      {
        endpoint: currentPrefs.llmEndpoint,
        apiKey: currentPrefs.llmApiKey,
        model: currentPrefs.llmModel,
        maxSuggestions: currentPrefs.llmMaxSuggestions,
      },
      message.sentenceContext,
      message.partialWord
    );
    console.log("[Hindi Typing] LLM_PREDICT ← predictions:", predictions);
    return { type: "LLM_PREDICT_RESULT", predictions };
  } catch (err) {
    console.error("[Hindi Typing] LLM_PREDICT failed:", err);
    return { type: "LLM_PREDICT_ERROR", error: "LLM request failed" };
  }
}

// --- Event Listeners ---

// Handle keyboard shortcut command
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-transliteration") {
    toggleTransliteration();
  }
});

// Handle messages from content scripts, popup, and offscreen document
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    switch (message.type) {
      case "TOGGLE_TRANSLITERATION":
        toggleTransliteration(message.enabled);
        sendResponse({ ok: true });
        break;

      case "PREFS_REQUEST":
        sendResponse({ type: "PREFS_RESPONSE", prefs: currentPrefs });
        break;

      case "PREFS_UPDATE":
        savePrefs(message.prefs).then(() => {
          sendResponse({ ok: true });
        });
        return true; // async response

      case "VOICE_START":
        ensureOffscreenDocument().then(() => {
          // Forward to offscreen document
          chrome.runtime.sendMessage(message);
          sendResponse({ ok: true });
        });
        return true;

      case "VOICE_STOP":
        chrome.runtime.sendMessage(message);
        sendResponse({ ok: true });
        break;

      case "VOICE_RESULT":
      case "VOICE_ERROR":
        // Forward from offscreen doc to the requesting tab
        forwardToActiveTab(message);
        break;

      case "STATUS_REQUEST":
        sendResponse({
          type: "STATUS_RESPONSE",
          enabled: currentPrefs.enabled,
          language: currentPrefs.language,
        });
        break;

      case "LLM_PREDICT":
        handleLLMPredict(message).then((result) => {
          sendResponse(result);
        });
        return true; // async response
    }

    return false;
  }
);

/** Forward a message to the currently active tab's content script. */
async function forwardToActiveTab(message: ExtensionMessage): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    try {
      await chrome.tabs.sendMessage(tab.id, message);
    } catch {
      // Tab may not have content script
    }
  }
}

// Initialize on install/startup
chrome.runtime.onInstalled.addListener(async () => {
  await loadPrefs();
  updateBadge(currentPrefs.enabled);
});

chrome.runtime.onStartup.addListener(async () => {
  await loadPrefs();
  updateBadge(currentPrefs.enabled);
});

// Load prefs immediately
loadPrefs().then(() => updateBadge(currentPrefs.enabled));
