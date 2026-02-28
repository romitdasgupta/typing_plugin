import { FieldInterceptor } from "./field-interceptor";
import { CompositionManager } from "./composition-manager";
import { CandidateStrip } from "./candidate-strip";
import { DEFAULT_PREFERENCES } from "../shared/constants";
import type { ExtensionMessage } from "../shared/message-protocol";
import type { TransliterationRules, UserPreferences } from "../shared/types";
import hindiRules from "../../data/hindi/transliteration-rules.json";

/**
 * Content script entry point.
 *
 * Initializes the transliteration system in the current tab:
 * 1. Loads preferences from the service worker
 * 2. Creates the transliteration engine with Hindi rules
 * 3. Sets up field interception, composition, and candidate UI
 * 4. Listens for toggle messages from the service worker
 */
async function init(): Promise<void> {
  // Load preferences
  const prefs = await getPreferences();
  if (!prefs.enabled) {
    // Still set up listener for future enable
    listenForToggle(null, null, null);
    return;
  }

  setupTransliteration(prefs);
}

function setupTransliteration(prefs: UserPreferences): void {
  const rules: TransliterationRules = {
    vowels: hindiRules.vowels,
    consonants: hindiRules.consonants,
    nuqta_consonants: hindiRules.nuqta_consonants,
    conjuncts: hindiRules.conjuncts,
    special: hindiRules.special,
    halant: hindiRules.halant,
  };

  // Create candidate strip UI
  const candidateStrip = new CandidateStrip();

  // Create composition manager
  const compositionManager = new CompositionManager(
    rules,
    {
      onCandidatesUpdate: (candidates, selectedIndex) => {
        candidateStrip.update(candidates, selectedIndex);
        if (candidates.length > 0) {
          const field = fieldInterceptor.getActiveField();
          if (field) {
            candidateStrip.show(field);
          }
        }
      },
      onCompositionEnd: () => {
        candidateStrip.hide();
      },
      onComposingChange: (composing) => {
        fieldInterceptor.setComposing(composing);
      },
    },
    prefs.maxCandidates
  );

  // Set up candidate selection via click
  candidateStrip.onSelect((index) => {
    const field = fieldInterceptor.getActiveField();
    if (field) {
      compositionManager.handleAction({ type: "select", index }, field);
    }
  });

  // Create field interceptor
  const fieldInterceptor = new FieldInterceptor({
    onKeyAction: (action, field) => {
      compositionManager.handleAction(action, field);
    },
    onFieldFocus: (_field) => {
      // Could initialize per-field state here if needed
    },
    onFieldBlur: () => {
      candidateStrip.hide();
    },
  });

  fieldInterceptor.start();

  // Listen for toggle messages
  listenForToggle(fieldInterceptor, candidateStrip, compositionManager);
}

function listenForToggle(
  interceptor: FieldInterceptor | null,
  strip: CandidateStrip | null,
  _manager: CompositionManager | null
): void {
  chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
    if (message.type === "TOGGLE_TRANSLITERATION") {
      if (message.enabled && !interceptor) {
        // Re-initialize with default prefs
        setupTransliteration(DEFAULT_PREFERENCES);
      } else if (interceptor) {
        interceptor.setEnabled(message.enabled ?? true);
        if (!message.enabled) {
          strip?.hide();
        }
      }
    }
  });
}

async function getPreferences(): Promise<UserPreferences> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { type: "PREFS_REQUEST" } satisfies ExtensionMessage,
        (response) => {
          if (chrome.runtime.lastError || !response?.prefs) {
            resolve(DEFAULT_PREFERENCES);
          } else {
            resolve({ ...DEFAULT_PREFERENCES, ...response.prefs });
          }
        }
      );
    } catch {
      resolve(DEFAULT_PREFERENCES);
    }
  });
}

// Initialize
init();
