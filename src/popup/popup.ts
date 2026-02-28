import type { ExtensionMessage } from "../shared/message-protocol";
import type { UserPreferences } from "../shared/types";
import { DEFAULT_PREFERENCES } from "../shared/constants";

const toggleEl = document.getElementById("toggle") as HTMLInputElement;
const badgeEl = document.getElementById("badge") as HTMLDivElement;
const statusEl = document.getElementById("status") as HTMLDivElement;
const modeEl = document.getElementById("mode") as HTMLSelectElement;
const maxCandidatesEl = document.getElementById("maxCandidates") as HTMLSelectElement;
const voiceEl = document.getElementById("voice") as HTMLInputElement;

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

// Initialize
loadPrefs();
