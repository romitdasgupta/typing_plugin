# LLM-Powered Context-Aware Suggestions

## Goal

Use previously typed and accepted text (full sentence context) to refine next-word suggestions by calling a user-configured LLM via any OpenAI-compatible endpoint.

## Architecture

### Data Flow

```
[User commits word] → CompositionManager tracks sentenceHistory[]
        ↓
Content script sends LLM_PREDICT → Service Worker
        ↓
Service Worker checks LRU cache → hit? return cached
        ↓ miss
Service Worker calls OpenAI-compatible endpoint (POST /v1/chat/completions)
        ↓
Parse JSON array of predicted words → cache result → return to content script
        ↓
CandidateStrip renders predictions in a separate second row
```

### Trigger Strategy

1. **After word commit**: When user presses Space/Enter/number-select to accept a word, immediately request predictions for the next word (partialWord = "").
2. **Debounced on typing**: While composing, debounce 300ms after each keystroke, then request predictions filtered by the current partial Devanagari word.

### Why Service Worker Proxy

Content scripts are bound by the page's Content Security Policy (CSP). Sites like GitHub and Gmail block arbitrary fetch requests. The service worker is exempt from page CSP, so all LLM API calls go through it.

## New Types

### UserPreferences additions

```typescript
llmEnabled: boolean;        // default: false
llmEndpoint: string;        // default: "" — e.g. "http://localhost:11434/v1/chat/completions"
llmApiKey: string;          // default: "" — stored in chrome.storage.local
llmModel: string;           // default: "" — e.g. "llama3", "gpt-4o-mini"
llmMaxSuggestions: number;  // default: 3
```

### Message Protocol additions

```typescript
interface LLMPredictRequest {
  type: "LLM_PREDICT";
  sentenceContext: string[];  // previously committed words
  partialWord: string;        // current partial Devanagari (may be "")
}

interface LLMPredictResponse {
  type: "LLM_PREDICT_RESULT";
  predictions: string[];
}

interface LLMPredictError {
  type: "LLM_PREDICT_ERROR";
  error: string;
}
```

## Service Worker: LLM Client

New file: `src/background/llm-client.ts`

- `predictNextWords(config, sentenceContext, partialWord)` — builds prompt, calls endpoint, parses response
- LRU cache: key = `last3Words|partialWord`, max 100 entries, 5-minute TTL
- AbortController for request cancellation when a newer request arrives
- Prompt format:

```
You are a Hindi typing assistant. Given the Hindi text typed so far, predict the most likely next words.

Sentence so far: "नमस्ते दोस्तों"
Partial word being typed: "आ"

Return ONLY a JSON array of 3-5 predicted Hindi words, most likely first.
Example: ["आपका", "आज", "आप"]
```

## Content Script Changes

### CompositionManager

- New field: `sentenceHistory: string[]` — accumulated committed words for current field
- On commit: push committed word to `sentenceHistory`, call `callbacks.onWordCommitted(sentenceHistory, "")`
- On field change / field blur: reset `sentenceHistory`
- On typing (debounced): call `callbacks.onPartialUpdate(sentenceHistory, partialDevanagari)`

### CandidateStrip

- New method: `updatePredictions(predictions: string[])` — renders a second row below transliteration candidates
- Predictions are click-only (no number-key selection), visually distinguished with a `✦` prefix
- Loading state: pulsing dot while waiting for LLM response
- If LLM is disabled or no predictions: second row is hidden entirely

### content-script.ts

- Wire up new callbacks from CompositionManager
- Debounce logic (300ms) for partial-word LLM requests
- Send/receive LLM_PREDICT messages to/from service worker
- Pass predictions to CandidateStrip

## Popup UI

New "AI Suggestions" section in popup.html:

- Toggle: Enable AI Suggestions (off by default)
- Text input: Endpoint URL
- Text input: API Key (type=password, masked)
- Text input: Model name
- Dropdown: Max suggestions (3/4/5)

## UI Layout

```
┌──────────────────────────────────────┐
│ 1 नम   2 नमस्   3 नाम   4 नमक      │  ← transliteration candidates (existing)
├──────────────────────────────────────┤
│ ✦ नमस्ते   स्कार   मस्कार           │  ← LLM predictions (new, click-only)
└──────────────────────────────────────┘
```

## Caching

LRU cache in service worker memory:
- Key: `JSON.stringify(sentenceContext.slice(-3)) + "|" + partialWord`
- Max entries: 100
- TTL: 5 minutes
- No persistence (predictions are ephemeral)

## Files to Create/Modify

| File | Change |
|------|--------|
| `src/shared/types.ts` | Add LLM fields to `UserPreferences` |
| `src/shared/message-protocol.ts` | Add LLM message types |
| `src/shared/constants.ts` | Add LLM default prefs |
| `src/background/service-worker.ts` | Add LLM_PREDICT handler |
| `src/background/llm-client.ts` | **New** — OpenAI-compatible client + LRU cache |
| `src/content/composition-manager.ts` | Track sentenceHistory, new callbacks |
| `src/content/candidate-strip.ts` | Add prediction row |
| `src/content/content-script.ts` | Wire up LLM flow + debouncing |
| `src/popup/popup.html` | Add AI Suggestions settings section |
| `src/popup/popup.ts` | Add LLM settings handlers |

## Tests

| File | What it tests |
|------|---------------|
| `tests/background/llm-client.test.ts` | **New** — LRU cache (insert/evict/TTL), prompt building, response parsing, error handling, request cancellation |
| `tests/content/composition-manager.test.ts` | **Extend** — sentenceHistory tracking (push on commit, reset on field change), onWordCommitted callback firing |
| `tests/content/candidate-strip.test.ts` | **New** — prediction row rendering, click handler, loading state, hide when empty |
| `tests/integration/llm-suggestions.test.ts` | **New** — end-to-end flow with mocked service worker: type words → commit → predictions appear → click prediction → committed |

## No New Dependencies

Uses native `fetch()` for API calls. No npm packages added.
