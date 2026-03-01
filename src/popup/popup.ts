import type { ExtensionMessage } from "../shared/message-protocol";
import type { UserPreferences } from "../shared/types";
import { DEFAULT_PREFERENCES } from "../shared/constants";

const toggleEl = document.getElementById("toggle") as HTMLInputElement;
const badgeEl = document.getElementById("badge") as HTMLDivElement;
const statusEl = document.getElementById("status") as HTMLDivElement;
const modeEl = document.getElementById("mode") as HTMLSelectElement;
const maxCandidatesEl = document.getElementById("maxCandidates") as HTMLSelectElement;
const voiceEl = document.getElementById("voice") as HTMLInputElement;
const llmEnabledEl = document.getElementById("llmEnabled") as HTMLInputElement;
const llmSettingsEl = document.getElementById("llmSettings") as HTMLDivElement;
const llmEndpointEl = document.getElementById("llmEndpoint") as HTMLInputElement;
const llmApiKeyEl = document.getElementById("llmApiKey") as HTMLInputElement;
const llmModelEl = document.getElementById("llmModel") as HTMLInputElement;
const llmMaxSuggestionsEl = document.getElementById("llmMaxSuggestions") as HTMLSelectElement;
const endpointWarningEl = document.getElementById("endpointWarning") as HTMLDivElement;

let currentPrefs: UserPreferences = { ...DEFAULT_PREFERENCES };

/** Load preferences from the service worker. */
async function loadPrefs(): Promise<void> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "PREFS_REQUEST" } satisfies ExtensionMessage,
      (response) => {
        if (response?.prefs) {
          currentPrefs = { ...DEFAULT_PREFERENCES, ...response.prefs };
        }
        applyPrefsToUI();
        validateEndpointUrl(currentPrefs.llmEndpoint);
        resolve();
      }
    );
  });
}

/** Update UI elements to reflect current preferences. */
function applyPrefsToUI(): void {
  toggleEl.checked = currentPrefs.enabled;
  modeEl.value = currentPrefs.mode;
  maxCandidatesEl.value = String(currentPrefs.maxCandidates);
  voiceEl.checked = currentPrefs.voiceEnabled;
  updateStatusDisplay(currentPrefs.enabled);
  llmEnabledEl.checked = currentPrefs.llmEnabled;
  llmSettingsEl.style.display = currentPrefs.llmEnabled ? "block" : "none";
  llmEndpointEl.value = currentPrefs.llmEndpoint;
  llmApiKeyEl.value = currentPrefs.llmApiKey;
  llmModelEl.value = currentPrefs.llmModel;
  llmMaxSuggestionsEl.value = String(currentPrefs.llmMaxSuggestions);
}

/** Update badge and status text. */
function updateStatusDisplay(enabled: boolean): void {
  badgeEl.classList.toggle("disabled", !enabled);
  statusEl.textContent = enabled ? "Active" : "Disabled";
}

/** Save a preference change. */
function savePref(partial: Partial<UserPreferences>): void {
  currentPrefs = { ...currentPrefs, ...partial };
  chrome.runtime.sendMessage({
    type: "PREFS_UPDATE",
    prefs: partial,
  } satisfies ExtensionMessage);
}

// --- Event listeners ---

toggleEl.addEventListener("change", () => {
  const enabled = toggleEl.checked;
  updateStatusDisplay(enabled);

  chrome.runtime.sendMessage({
    type: "TOGGLE_TRANSLITERATION",
    enabled,
  } satisfies ExtensionMessage);

  savePref({ enabled });
});

modeEl.addEventListener("change", () => {
  savePref({ mode: modeEl.value as "casual" | "itrans" });
});

maxCandidatesEl.addEventListener("change", () => {
  savePref({ maxCandidates: parseInt(maxCandidatesEl.value) });
});

voiceEl.addEventListener("change", () => {
  savePref({ voiceEnabled: voiceEl.checked });
});

llmEnabledEl.addEventListener("change", () => {
  const enabled = llmEnabledEl.checked;
  llmSettingsEl.style.display = enabled ? "block" : "none";
  savePref({ llmEnabled: enabled });
});

llmEndpointEl.addEventListener("change", () => {
  const value = llmEndpointEl.value.trim();
  savePref({ llmEndpoint: value });
  validateEndpointUrl(value);
});

function validateEndpointUrl(url: string): void {
  if (!url) {
    endpointWarningEl.style.display = "none";
    return;
  }
  try {
    const parsed = new URL(url);
    const isLocalhost =
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "::1";
    endpointWarningEl.style.display =
      parsed.protocol === "http:" && !isLocalhost ? "block" : "none";
  } catch {
    endpointWarningEl.style.display = "none";
  }
}

llmApiKeyEl.addEventListener("change", () => {
  savePref({ llmApiKey: llmApiKeyEl.value });
});

llmModelEl.addEventListener("change", () => {
  savePref({ llmModel: llmModelEl.value.trim() });
});

llmMaxSuggestionsEl.addEventListener("change", () => {
  savePref({ llmMaxSuggestions: parseInt(llmMaxSuggestionsEl.value) });
});

// Initialize
loadPrefs();
