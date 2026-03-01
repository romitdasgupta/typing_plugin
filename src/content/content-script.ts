import { FieldInterceptor } from "./field-interceptor";
import { CompositionManager } from "./composition-manager";
import { CandidateStrip } from "./candidate-strip";
import { StatusIndicator } from "./status-indicator";
import { DEFAULT_PREFERENCES } from "../shared/constants";
import type { ExtensionMessage } from "../shared/message-protocol";
import type { TransliterationRules, UserPreferences } from "../shared/types";
import hindiRules from "../../data/hindi/transliteration-rules.json";

let currentInterceptor: FieldInterceptor | null = null;
let currentStrip: CandidateStrip | null = null;
let currentIndicator: StatusIndicator | null = null;

function teardown(): void {
  currentInterceptor?.stop();
  currentStrip?.destroy();
  currentIndicator?.destroy();
  currentInterceptor = null;
  currentStrip = null;
  currentIndicator = null;
}

function setupTransliteration(prefs: UserPreferences): void {
  teardown();

  const rules: TransliterationRules = {
    vowels: hindiRules.vowels,
    consonants: hindiRules.consonants,
    nuqta_consonants: hindiRules.nuqta_consonants,
    conjuncts: hindiRules.conjuncts,
    special: hindiRules.special,
    halant: hindiRules.halant,
  };

  const candidateStrip = new CandidateStrip();
  const statusIndicator = new StatusIndicator();
  statusIndicator.setMode(prefs.enabled);

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

  candidateStrip.onSelect((index) => {
    const field = fieldInterceptor.getActiveField();
    if (field) {
      compositionManager.handleAction({ type: "select", index }, field);
    }
  });

  const fieldInterceptor = new FieldInterceptor({
    onKeyAction: (action, field) => {
      compositionManager.handleAction(action, field);
    },
    onFieldFocus: (field) => {
      statusIndicator.show(field);
    },
    onFieldBlur: () => {
      candidateStrip.hide();
      statusIndicator.hide();
    },
  });

  fieldInterceptor.start();

  currentInterceptor = fieldInterceptor;
  currentStrip = candidateStrip;
  currentIndicator = statusIndicator;
}

function handleToggle(enabled: boolean): void {
  if (enabled) {
    if (!currentInterceptor) {
      setupTransliteration(DEFAULT_PREFERENCES);
    } else {
      currentInterceptor.setEnabled(true);
      currentIndicator?.setMode(true);
    }
  } else if (currentInterceptor) {
    currentInterceptor.setEnabled(false);
    currentIndicator?.setMode(false);
    currentStrip?.hide();
  }
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  if (message.type === "TOGGLE_TRANSLITERATION") {
    handleToggle(message.enabled ?? true);
  }
});

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

async function init(): Promise<void> {
  const prefs = await getPreferences();
  if (!prefs.enabled) return;
  setupTransliteration(prefs);
}

init();
