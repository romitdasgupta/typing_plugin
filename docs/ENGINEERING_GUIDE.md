# Hindi Typing Plugin — Engineering Guide

A deep walkthrough of how this Chrome extension works, written for an engineer who will maintain and extend it. Covers architecture, data flow, every module's role, and the non-obvious decisions that make it work on real-world websites.

---

## Table of Contents

1. [What This Is](#1-what-this-is)
2. [Architecture Overview](#2-architecture-overview)
3. [The Engine Layer](#3-the-engine-layer-srcengine)
4. [The Content Script Layer](#4-the-content-script-layer-srccontent)
5. [The Service Worker](#5-the-service-worker-srcbackground)
6. [The Message Protocol](#6-the-message-protocol-srcsharedmessage-protocolts)
7. [The Data Layer](#7-the-data-layer-datahindi)
8. [Build System](#8-build-system)
9. [Lifecycle: What Happens When](#9-lifecycle-what-happens-when)
10. [Key Design Decisions & Gotchas](#10-key-design-decisions--gotchas)
11. [Adding a New Language](#11-adding-a-new-language)
12. [Testing Strategy](#12-testing-strategy)

---

## 1. What This Is

A Chrome Extension (Manifest V3) that intercepts Roman keystrokes in any text field on the web and transliterates them to Hindi (Devanagari) in real-time. It also provides:

- A floating candidate strip for selecting alternate transliterations
- Word prediction via a bundled dictionary
- Voice input via the Web Speech API
- AI-powered next-word suggestions via any OpenAI-compatible LLM

---

## 2. Architecture Overview

The extension runs across **four isolated JavaScript contexts**. This is not a design choice — it's imposed by Chrome's extension architecture:

```
┌──────────────────────────────────────────────────────────────────────┐
│  BROWSER TAB (per-page context)                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Content Script (content-script.ts)                            │  │
│  │  ├── FieldInterceptor — finds text fields, captures keys      │  │
│  │  ├── CompositionManager — state machine, drives transliteration│  │
│  │  ├── CandidateStrip — Shadow DOM floating UI                  │  │
│  │  ├── StatusIndicator — "हि" / "EN" pill                       │  │
│  │  ├── TextInjector — writes Devanagari into the field          │  │
│  │  └── VoiceInput — mic button UI                               │  │
│  └──────────────────────┬─────────────────────────────────────────┘  │
│                         │ chrome.runtime.sendMessage()                │
├─────────────────────────┼────────────────────────────────────────────┤
│  SERVICE WORKER (background/service-worker.ts)                       │
│  ├── Preferences storage (chrome.storage.local)                      │
│  ├── Toggle broadcasting (notifies all tabs)                         │
│  ├── LLMClient — fetch proxy + LRU cache + AbortController          │
│  ├── Offscreen document lifecycle management                         │
│  └── Message routing hub                                             │
├─────────────────────────┼────────────────────────────────────────────┤
│  OFFSCREEN DOCUMENT (offscreen/speech.html)                          │
│  └── SpeechRecognition (hi-IN) — needs a DOM; service worker has none│
├──────────────────────────────────────────────────────────────────────┤
│  POPUP (popup/popup.html)                                            │
│  └── Settings UI — toggle, mode, candidates, voice, LLM config      │
└──────────────────────────────────────────────────────────────────────┘
```

**Why four contexts?** Chrome Manifest V3 forces the background into a service worker (no DOM). Content scripts run in the page's JS context but can't use extension APIs freely. The offscreen document exists solely because `SpeechRecognition` requires a DOM context. The popup is a separate HTML page opened by the toolbar icon. Each communicates via `chrome.runtime.sendMessage()`.

---

## 3. The Engine Layer (`src/engine/`)

This layer is **pure logic, no DOM, no Chrome APIs**. It's independently testable. Four files:

### 3.1 `transliterator.ts` — The Trie-Based State Machine

The heart of the plugin. Converts Roman keystrokes → Devanagari.

**How it works:**

1. **Build phase** — The constructor reads `transliteration-rules.json` and inserts every mapping into a trie. Each node stores: children (a `Map<string, TrieNode>`), a terminal value (the Devanagari output), the type (`vowel`/`consonant`/`conjunct`/`special`), and whether it's a vowel.

2. **Lookup phase** — `longestMatch(buffer, pos)` walks the trie from position `pos`, greedily consuming characters. If the buffer is `"ksh"`, it matches `क्ष` (the conjunct), not `क` + `श` + `ह` individually. This is classic longest-match-first semantics.

3. **Consonant chaining** — The engine tracks `lastConsonant`. When two consonants appear consecutively (e.g., `k` then `t`), a halant (virama: `्`) is inserted between them: `क्त`. This is how Devanagari conjuncts form.

4. **Vowel + matra handling** — Vowels have two forms: independent (`अ`, `आ`) and matra (`ा`, `ि`). When a vowel follows a consonant, the matra form is used: `ka` → `क` (inherent `a`, empty matra), `kaa` → `का` (ा matra). The `vowelMatras` map handles this.

There are two processing modes:

- **`process(buffer)`** — Full reprocessing. Runs the entire buffer through from scratch. Used by `CompositionManager.handleChar()` after every keystroke. Since the trie walk is O(n) where n is the buffer length (typically 3-10 chars), this is <1ms even on slow hardware.

- **`processIncremental(buffer, previousOutput, lastConsonant)`** — Designed for streaming output where you want to emit resolved segments and hold a pending tail. Currently not used by the composition manager (which just calls `process()` and replaces the full preview), but it's there for future optimization.

**`buildCandidates(buffer)`** — Walks the trie to the node matching the current buffer, then collects all terminal children up to 2 levels deep. This generates the alternative candidates shown in the strip. For example, if you've typed `"k"`, it finds `क` (terminal for `k`), plus `ख` (terminal for `kh`), `क्ष` (terminal for `ksh`), etc.

> **Note:** The trie is case-sensitive by design. Uppercase letters map to different characters: `t` → `त` (dental), `T` → `ट` (retroflex). This is how ITRANS distinguishes them. The `ROMAN_CHARS` constant in `constants.ts` includes both `a-z` and `A-Z`.

### 3.2 `candidate-ranker.ts`

Two functions:

- **`rankCandidates(candidates, maxResults)`** — Deduplicates by Devanagari text (keeps highest-frequency version), then sorts by: frequency desc → Roman length asc → alphabetical. Returns top `maxResults`.

- **`mergeCandidatesWithPredictions(translitCandidates, predictions, maxResults)`** — Merges transliteration candidates with dictionary predictions. The top transliteration candidate always stays in position 1. Predictions fill slots 2+, then remaining transliteration candidates fill the rest.

### 3.3 `dictionary.ts` — Prefix Trie for Word Prediction

A separate trie (not shared with the transliterator) that stores complete Hindi words with frequency scores. Used for word completion, not transliteration.

- **Loading**: Can load from a binary file (`dictionary.bin`) or plain text. The binary format is simple: 12-byte header (`"HTDT"` magic + version + word count) followed by tab-separated word\tfrequency lines in UTF-8. It's a "text-in-binary" format — v2 could serialize actual trie nodes.

- **`predict(prefix, maxResults)`**: Walks to the prefix node, collects all terminal descendants (capped at depth 10 / 100 results), sorts by frequency, returns top results.

- **`serialize()`**: Used by the build script to write the `.bin` file.

### 3.4 `language-pack.ts` — Language Abstraction

`LanguagePack` is the interface for adding new scripts. `HindiLanguagePack` implements it, importing `transliteration-rules.json` directly. New languages (Tamil, Bengali, etc.) would add a new class here and new data files — no engine changes needed.

The file auto-registers Hindi via `registerLanguagePack(new HindiLanguagePack())` on import.

---

## 4. The Content Script Layer (`src/content/`)

This is where the rubber meets the road — it's injected into every web page.

### 4.1 `content-script.ts` — The Entry Point

Loaded at `document_idle` in all frames (`manifest.json: "all_frames": true`). On load:

1. Calls `getPreferences()` — sends `PREFS_REQUEST` to the service worker, gets back user settings.
2. If `enabled`, calls `setupTransliteration(prefs)` which wires up all the components:
   - Creates a `CandidateStrip` (shadow DOM)
   - Creates a `StatusIndicator`
   - Creates a `CompositionManager` with callbacks
   - Creates a `FieldInterceptor` and calls `start()`

**The callback wiring is the glue.** Here's the flow when the user types:

```
FieldInterceptor.handleKeyDown
  → calls callbacks.onKeyAction(action, field)
    → CompositionManager.handleAction(action, field)
      → Transliterator.process(buffer)
      → TextInjector.updateComposition(field, preview, prevLength)
      → callbacks.onCandidatesUpdate(candidates, index)
        → CandidateStrip.update(candidates, index)
        → CandidateStrip.show(field)
        → (if LLM enabled) debouncedLLMRequest(...)
```

**LLM integration points:**
- `onCandidatesUpdate`: When candidates update, if LLM is enabled, fires a debounced (500ms) prediction request with the current sentence history + top candidate as partial word.
- `onWordCommitted`: When a word is committed (space pressed), fires an immediate prediction request for the next word (empty partial).
- `onPredictionSelect`: When the user clicks an LLM prediction, calls `compositionManager.insertPrediction(word, field)`, which inserts the word + space and updates sentence history.

**Teardown** — `teardown()` is called before `setupTransliteration()` (to handle re-initialization) and cleans up debounce timers, stops the interceptor, destroys DOM elements.

### 4.2 `field-interceptor.ts` — Keyboard Interception

Responsible for two things: (1) detecting which element is a text field, and (2) intercepting keystrokes in it.

**Field detection (`isTextField`):**
- `<textarea>` → yes
- `<input type="text|search|url|"">` → yes
- `contenteditable="true"` or `contenteditable=""` → yes
- `role="textbox"` or `role="combobox"` → yes (catches Slate, ProseMirror, Notion editors)
- `el.isContentEditable` → yes (catches nested contenteditable)

**Keystroke routing (`handleKeyDown`):**

```
                              ┌─ Ctrl/Cmd/Alt held? → pass through (don't break Ctrl+C, Cmd+V)
                              ├─ ArrowUp/Down while composing? → candidate navigation
                              ├─ PASSTHROUGH_KEYS? → pass through (F-keys, PageUp, etc.)
keydown ─┤                    ├─ Space while composing? → preventDefault, commit + space
                              ├─ Backspace while composing? → preventDefault, remove last char
                              ├─ Escape while composing? → preventDefault, cancel
                              ├─ Enter/Tab while composing? → commit (NO preventDefault → key passes through)
                              ├─ 1-9 while composing? → preventDefault, select candidate
                              ├─ Roman char (a-z, A-Z)? → preventDefault, route to transliteration
                              └─ Period while composing? → preventDefault, route (for danda: ।)
```

The `composing` flag (set by `setComposing()`) is critical. Without it, number keys and space would be intercepted even when the user isn't in the middle of typing Hindi.

**Dynamic field detection** — A `MutationObserver` watches `document.body` for added nodes, checking if any are text fields that already have focus. This handles SPAs (React, Vue) that mount input elements dynamically.

**Focus handling** — `handleFocusOut` uses a 100ms `setTimeout` before declaring blur. This prevents the candidate strip click from stealing focus and causing the composition to reset prematurely.

> **Note:** Enter/Tab don't call `preventDefault()`. This is intentional — when you press Enter in a chat app, you want to both commit the Hindi word AND send the message. The composition manager commits synchronously, then the native Enter event propagates to the page.

### 4.3 `composition-manager.ts` — The State Machine

Two states: `IDLE` and `COMPOSING`.

```
IDLE ──(char typed)──→ COMPOSING
                       │
                       ├── char → append to romanBuffer, reprocess, update preview
                       ├── backspace → remove last char from romanBuffer, reprocess
                       ├── space → commit selected candidate + insert " "
                       ├── select(n) → commit candidate at index n
                       ├── commit → commit selected candidate (Enter)
                       ├── tab → commit selected candidate (Tab)
                       ├── escape → cancel (remove preview)
                       ├── arrowUp/Down → navigate selectedIndex
                       │
                       └──(any commit/cancel)──→ IDLE
```

**The `romanBuffer`** accumulates raw Roman keystrokes. On each keystroke, the *entire* buffer is reprocessed through `Transliterator.process()`. This is what makes backspace work correctly — you're not trying to reverse a Devanagari operation, you're just shortening the Roman input and reprocessing.

**`previewLength`** tracks how many Devanagari characters are currently shown in the text field as a preview. When the preview updates, `TextInjector.updateComposition()` replaces the last `previewLength` characters with the new preview. This is how the user sees the text morph as they type: `k` → `क`, `ka` → `क`, `kaa` → `का`.

**`sentenceHistory`** — An array of committed Devanagari words. Passed to the LLM for context. Reset on field focus/blur (`resetSentenceHistory()`).

### 4.4 `text-injector.ts` — Writing Into the DOM

This is the trickiest part of the extension. Web apps (React, Angular, WhatsApp Web, Gmail) detect text changes via native `InputEvent`s. Simply setting `field.value = ...` or `textContent = ...` will *silently fail* — the framework won't notice.

**Strategy:**

1. **Primary: `document.execCommand('insertText', false, text)`** — Yes, `execCommand` is deprecated, but nothing else does what it does: it fires native `InputEvent`s, preserves the browser's undo stack (Ctrl+Z works), and works with both `<input>`/`<textarea>` and `contenteditable` elements.

2. **Fallback: Direct value manipulation + synthetic `InputEvent`** — For fields where `execCommand` returns `false`. Sets `field.value` directly, calls `setSelectionRange()`, and dispatches a new `InputEvent({ inputType: 'insertText' })`.

**Composition lifecycle:**

The injector fires `CompositionEvent`s (`compositionstart`, `compositionupdate`, `compositionend`) to signal IME-like behavior. This matters for apps that handle IME input specially (e.g., suppressing autocomplete during composition).

- `startComposition(field)` — dispatches `compositionstart`
- `updateComposition(field, text, prevLength)` — dispatches `compositionupdate`, then replaces the previous preview
- `endComposition(field, text, prevLength)` — replaces preview with final text, dispatches `compositionend`
- `cancelComposition(field, prevLength)` — deletes the preview, dispatches `compositionend` with empty data

**`replaceBeforeCursor`** for `<input>`/`<textarea>`: Calls `setSelectionRange(cursorPos - deleteCount, cursorPos)` to select the old preview, then `execCommand('insertText')` to replace it.

**`replaceBeforeCursor`** for `contenteditable`: Uses the Selection API. If the anchor node is a text node, creates a range from `anchorOffset - deleteCount` to `anchorOffset`. Otherwise falls back to `sel.modify('extend', 'backward', 'character')` in a loop.

> **Why `execCommand` over `InputEvent` construction?** Framework compatibility. React's synthetic event system, Vue's `v-model`, and Angular's form controls all look for *native* `input` events that originate from the browser's editing machinery. `execCommand` triggers exactly the right internal browser paths. A manually-constructed `InputEvent` doesn't — React will ignore it on controlled inputs.

### 4.5 `candidate-strip.ts` — The Floating UI

A `<div>` with a **closed Shadow DOM** — so the host page's CSS can't leak in and break the layout. Contains:

- `.candidate-strip` — horizontal flex row of candidate items, each with a number key hint and the Devanagari text
- `.prediction-strip` — second row for LLM predictions, marked with `✦`
- `.prediction-loading` — pulsing `✦` shown while waiting for the LLM response

**Cursor positioning** uses two techniques:

- **`contenteditable`**: `window.getSelection().getRangeAt(0)` → insert a zero-width space `<span>`, measure its `getBoundingClientRect()`, remove it.
- **`<input>`/`<textarea>`**: Mirror-div technique. Creates a hidden `<div>`, copies 20+ CSS properties from the field (`fontFamily`, `fontSize`, `padding`, `lineHeight`, etc.), inserts the text before the cursor, appends a `|` marker `<span>`, and measures the marker's position relative to the field's bounding rect. Accounts for `scrollLeft`/`scrollTop`.

The strip repositions on every `show()` call. Flips above the cursor if it would overflow the viewport bottom. Clamps left to prevent overflow right. Hides on scroll/resize.

**Click handling** — Uses `mousedown` (not `click`) with `preventDefault()` + `stopPropagation()`. The `preventDefault()` is essential: without it, clicking a candidate steals focus from the text field, triggering blur and destroying the composition state.

### 4.6 `status-indicator.ts` — Mode Pill

A small green pill showing `"हि"` (active) or gray `"EN"` (disabled). Appears on field focus or toggle, auto-fades to `opacity: 0` after 2 seconds. Uses Shadow DOM.

### 4.7 `voice-input.ts`

Renders a mic button near the active text field. On click, sends `VOICE_START` to the service worker → offscreen document → `SpeechRecognition(lang: 'hi-IN')`. Results come back as `VOICE_RESULT` messages with `transcript` and `isFinal` flag. Final transcripts are injected via `TextInjector.insert()`.

---

## 5. The Service Worker (`src/background/`)

### 5.1 `service-worker.ts` — Message Router + State

Central hub. Responsibilities:

1. **Preferences** — Loads from `chrome.storage.local` on startup (`onInstalled`, `onStartup`, and immediately). Saves partial updates via `savePrefs()`. Merges with `DEFAULT_PREFERENCES` to handle missing fields (forward compatibility when new prefs are added).

2. **Toggle** — `toggleTransliteration()` saves the new state, updates the badge (`"हि"` green or empty), and broadcasts `TOGGLE_TRANSLITERATION` to *all* tabs. The `chrome.tabs.query` uses `url: ["http://*/*", "https://*/*"]` to skip `chrome://` pages where content scripts don't run.

3. **Keyboard shortcut** — Listens on `chrome.commands.onCommand` for `"toggle-transliteration"` (bound to `Alt+Shift+H`).

4. **LLM proxy** — `handleLLMPredict()` delegates to `LLMClient`. Returns `LLM_PREDICT_RESULT` or `LLM_PREDICT_ERROR`. Uses `return true` in the message listener to enable async `sendResponse`.

5. **Voice routing** — `VOICE_START` → ensures offscreen document exists → forwards message. `VOICE_RESULT` / `VOICE_ERROR` from offscreen → forwards to active tab via `forwardToActiveTab()`.

6. **Offscreen lifecycle** — `ensureOffscreenDocument()` uses `chrome.offscreen.listDocuments()` (type-incompatible, hence `@ts-expect-error`) to check if one already exists before creating. The document is created with `Reason.USER_MEDIA` for microphone access.

> **Why LLM calls go through the service worker** — Content scripts inherit the page's Content Security Policy (CSP). Gmail, GitHub, and many other sites block arbitrary `fetch()` calls via CSP. The service worker is *exempt* from page CSP, so it can call any endpoint. The content script sends a message to the service worker, which makes the actual HTTP request.

### 5.2 `llm-client.ts` — LLM Integration

**Prompt construction** (`buildPrompt`):
```
You are a Hindi typing assistant. Given the Hindi text typed so far, predict the most likely next words.

Sentence so far: "नमस्ते कैसे"
Partial word being typed: "है"

Return ONLY a JSON array of 3 predicted Hindi words, most likely first.
Example: ["आपका", "आज", "आप"]
```

**Response parsing** (`parseResponse`): Extracts the first JSON array from the response text via regex `\[[\s\S]*?\]`, then `JSON.parse`s it. Filters to strings only. Tolerant of surrounding text.

**Caching**: In-memory LRU cache. Key = last 3 committed words (JSON) + `"|"` + partial word. 100 entry max, 5-minute TTL. LRU eviction on insert by delete-then-set on `Map` (exploits insertion order). On read, promotes to end.

**Request cancellation**: Maintains a single `AbortController`. Every new request aborts the previous one. This prevents stale predictions from arriving after the user has typed further.

**URL validation**: Rejects non-http(s) protocols. Warns (console) on non-localhost HTTP endpoints (security: API key in cleartext).

---

## 6. The Message Protocol (`src/shared/message-protocol.ts`)

A discriminated union type `ExtensionMessage` covering all cross-context messages:

| Message | Direction | Purpose |
|---------|-----------|---------|
| `TOGGLE_TRANSLITERATION` | popup/SW → content | Enable/disable |
| `PREFS_REQUEST/RESPONSE` | content/popup → SW | Load preferences |
| `PREFS_UPDATE` | popup → SW | Save preference changes |
| `VOICE_START/STOP` | content → SW → offscreen | Voice lifecycle |
| `VOICE_RESULT/ERROR` | offscreen → SW → content | Speech results |
| `STATUS_REQUEST/RESPONSE` | popup → SW | Check current state |
| `LLM_PREDICT` | content → SW | Request predictions |
| `LLM_PREDICT_RESULT/ERROR` | SW → content | Return predictions |

Every message uses `satisfies ExtensionMessage` at the call site for type safety.

---

## 7. The Data Layer (`data/hindi/`)

### `transliteration-rules.json`

The complete Roman → Devanagari mapping. Sections:

- **`vowels.independent`**: `"a" → "अ"`, `"aa" → "आ"`, etc. (20 entries)
- **`vowels.matra`**: Same keys, but matra forms: `"a" → ""` (inherent), `"aa" → "ा"`, `"i" → "ि"`, etc.
- **`consonants`**: `"k" → "क"`, `"kh" → "ख"`, `"T" → "ट"` (retroflex), etc. (34 entries)
- **`nuqta_consonants`**: Dotted consonants: `"z" → "ज़"`, `"Rr" → "ड़"`, etc.
- **`conjuncts`**: Multi-consonant clusters: `"ksh" → "क्ष"`, `"tr" → "त्र"`, `"gy" → "ज्ञ"`, `"shr" → "श्र"`, `"shri" → "श्री"`
- **`special`**: Anusvara, visarga, chandrabindu, danda, Om, and Devanagari digits

### `dictionary.bin`

Built by `scripts/build-dictionary.ts`. Contains ~120 common Hindi words with frequency scores. The build script can take a custom frequency list (tab-separated) or generate a seed dictionary with hardcoded words.

---

## 8. Build System

**Vite + CRXJS** — `@crxjs/vite-plugin` reads `manifest.json` directly and handles Chrome extension bundling (content scripts, service worker, popup). The offscreen document is added as an extra Rollup input.

**TypeScript** — Strict mode, ES2022 target, bundler module resolution. Type-checks with `@types/chrome` for extension APIs.

**Testing** — Vitest (unit tests) + Playwright (e2e). Vitest runs in Node environment (`test.environment: "node"`), excluding e2e tests. Globals enabled (`test.globals: true`).

```bash
npm run build       # tsc + vite build → dist/
npm run dev         # vite dev server with HMR
npm test            # vitest run (unit tests)
npm run test:watch  # vitest watch mode
npm run test:e2e    # playwright tests
npm run build:dict  # build dictionary.bin
```

---

## 9. Lifecycle: What Happens When

### Extension loads
1. Service worker starts → loads prefs from `chrome.storage.local` → sets badge
2. Content script injected into every page → requests prefs → if enabled, calls `setupTransliteration()`
3. `FieldInterceptor.start()` → listens for `focusin` on the document, observes DOM mutations

### User focuses a text field
1. `FieldInterceptor.handleFocusIn` fires → detects text field → sets `activeField` → attaches `keydown` listener → fires `onFieldFocus` callback
2. `StatusIndicator.show(field)` → positions pill, starts 2s fade timer
3. `CompositionManager.resetSentenceHistory()` — fresh sentence context

### User types `"namaste"`
1. `n` → intercepted → `CompositionManager` transitions to COMPOSING, romanBuffer=`"n"`, transliterator produces `न`, preview inserted, strip shows candidates
2. `a` → romanBuffer=`"na"`, reprocessed → `न` (consonant + inherent `a`, no visible matra), strip updates
3. `m` → romanBuffer=`"nam"`, reprocessed → `नम्` (halant between `न` and `म`), preview updates
4. ...continues for each character...
5. Final buffer `"namaste"` → `नमस्ते`, shown as inline preview

### User presses Space
1. `CompositionManager.commitTopCandidate()` → replaces preview with final `नमस्ते`
2. Inserts a space after
3. Pushes `"नमस्ते"` to `sentenceHistory`
4. If LLM enabled: fires `debouncedLLMRequest(["नमस्ते"], "", strip)` → service worker → LLMClient.predictNextWords → displays predictions

### User toggles off (Alt+Shift+H)
1. `chrome.commands.onCommand` fires in service worker
2. `toggleTransliteration()` → saves `enabled: false`, clears badge, broadcasts to all tabs
3. Content script receives `TOGGLE_TRANSLITERATION` → `handleToggle(false)`:
   - Cancels any active composition (escape)
   - Calls `currentInterceptor.setEnabled(false)` (detaches keydown listener)
   - Updates status indicator to "EN"
   - Hides candidate strip

---

## 10. Key Design Decisions & Gotchas

1. **Full reprocessing on each keystroke** — The `romanBuffer` is reprocessed from scratch every time, not incrementally. This is correct because changing a character mid-buffer can change the meaning of everything after it (e.g., `ksh` is one conjunct, not `k` + `sh`). Performance is irrelevant — trie walks on 3-10 char buffers are nanoseconds.

2. **`mousedown` not `click`** — Candidate strip clicks use `mousedown` with `preventDefault`. Without `preventDefault`, the browser would move focus to the shadow DOM host, triggering `focusout` on the text field, which would destroy the composition.

3. **`setTimeout` in `handleFocusOut`** — 100ms delay to let the focus transfer complete. Without this, clicking a candidate triggers: focusout → composition destroyed → click handler fires on destroyed state.

4. **LLM debounce at 500ms** — Prevents flooding the LLM with requests on every keystroke. The debounce timer resets on each keystroke, so the request only fires 500ms after the user *stops* typing.

5. **Cache key uses last 3 words** — Not the full sentence. This keeps cache keys manageable and avoids cache misses from minor history differences. The tradeoff is that very different sentences sharing the last 3 words will share predictions.

6. **Shadow DOM is `closed`** (candidate strip) — The host page cannot reach into the shadow to override styles. The status indicator uses `open` mode, but that's less critical since it's just a pill.

7. **`host_permissions: ["<all_urls>"]`** — Necessary for the content script to run everywhere AND for the service worker to make LLM API calls to any endpoint the user configures.

---

## 11. Adding a New Language

The engine is deliberately language-agnostic. To add Bengali, for example:

1. Create `data/bengali/transliteration-rules.json` with the same schema (vowels, consonants, conjuncts, special, halant)
2. Create `data/bengali/dictionary.bin` via the build script
3. Add `BengaliLanguagePack` in `language-pack.ts`:
   ```ts
   export class BengaliLanguagePack implements LanguagePack {
     readonly id = "bengali";
     readonly name = "বাংলা (Bengali)";
     readonly script = "Bengali";
     readonly speechLang = "bn-IN";
     readonly halant = "্";
     async loadRules() { /* import bengali rules */ }
   }
   registerLanguagePack(new BengaliLanguagePack());
   ```
4. No changes to the transliterator, composition manager, text injector, or UI needed.

---

## 12. Testing Strategy

| Layer | Test file | Framework | What it covers |
|-------|-----------|-----------|----------------|
| Engine | `tests/engine/transliterator.test.ts` | Vitest | Trie building, character processing, conjuncts, vowel-matra |
| Engine | `tests/engine/candidate-ranker.test.ts` | Vitest | Ranking, dedup, merge with predictions |
| Engine | `tests/engine/dictionary.test.ts` | Vitest | Insert, predict, serialize/deserialize |
| Background | `tests/background/llm-client.test.ts` | Vitest | Prompt building, response parsing, caching, abort |
| Content | `tests/content/composition-manager.test.ts` | Vitest | State transitions, commit, backspace, escape |
| Integration | `tests/integration/llm-suggestions.test.ts` | Vitest | Full flow: content → service worker → LLM → strip |
| E2E | `tests/e2e/*.spec.ts` | Playwright | Extension loading, field detection, transliteration, toggle |

The engine tests are pure unit tests (no mocks needed). Content tests mock `TextInjector` and `chrome.runtime`. LLM tests mock `fetch`. E2E tests load the actual extension in Chrome.

---

The two most important files to understand deeply are `transliterator.ts` (the algorithm) and `content-script.ts` (the wiring). Everything else is either data, plumbing, or UI.
