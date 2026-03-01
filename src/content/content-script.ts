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
let llmDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const LLM_DEBOUNCE_MS = 500;

function requestLLMPredictions(
  sentenceContext: string[],
  partialWord: string,
  strip: CandidateStrip
): void {
  const message: ExtensionMessage = {
    type: "LLM_PREDICT",
    sentenceContext,
    partialWord,
  };

  strip.showLoading();

  chrome.runtime.sendMessage(message, (response) => {
    if (chrome.runtime.lastError) {
      strip.hidePredictions();
      return;
    }
    if (response?.type === "LLM_PREDICT_RESULT") {
      strip.updatePredictions(response.predictions);
    } else {
      strip.hidePredictions();
    }
  });
}

function debouncedLLMRequest(
  sentenceContext: string[],
  partialWord: string,
  strip: CandidateStrip
): void {
  if (llmDebounceTimer) clearTimeout(llmDebounceTimer);
  llmDebounceTimer = setTimeout(() => {
    requestLLMPredictions(sentenceContext, partialWord, strip);
  }, LLM_DEBOUNCE_MS);
}

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
          if (prefs.llmEnabled) {
            const topCandidate = candidates[0].text;
            debouncedLLMRequest(
              compositionManager.getSentenceHistory(),
              topCandidate,
              candidateStrip
            );
          }
        }
      },
      onCompositionEnd: () => {
        candidateStrip.hide();
        if (llmDebounceTimer) clearTimeout(llmDebounceTimer);
      },
      onComposingChange: (composing) => {
        fieldInterceptor.setComposing(composing);
      },
      onWordCommitted: (sentenceHistory) => {
        if (prefs.llmEnabled) {
          debouncedLLMRequest(sentenceHistory, "", candidateStrip);
        }
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

  candidateStrip.onPredictionSelect((word) => {
    const field = fieldInterceptor.getActiveField();
    if (field) {
      compositionManager.insertPrediction(word, field);
    }
  });

  const fieldInterceptor = new FieldInterceptor({
    onKeyAction: (action, field) => {
      compositionManager.handleAction(action, field);
    },
    onFieldFocus: (field) => {
      statusIndicator.show(field);
      compositionManager.resetSentenceHistory();
    },
    onFieldBlur: () => {
      candidateStrip.hide();
      statusIndicator.hide();
      compositionManager.resetSentenceHistory();
    },
  });

  fieldInterceptor.start();

  currentInterceptor = fieldInterceptor;
  currentStrip = candidateStrip;
  currentIndicator = statusIndicator;
}

async function handleToggle(enabled: boolean): Promise<void> {
  if (enabled) {
    if (!currentInterceptor) {
      const prefs = await getPreferences();
      setupTransliteration(prefs);
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
