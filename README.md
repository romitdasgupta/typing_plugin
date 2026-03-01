# Hindi Typing — Devanagari Transliteration Chrome Extension

Type in Hindi (Devanagari) anywhere on the web using Roman keystrokes. Real-time transliteration with an inline candidate strip, predictive word completion, voice input, and optional AI-powered next-word suggestions via any OpenAI-compatible LLM.

Works on WhatsApp Web, Telegram Web, Gmail, Twitter/X, Google Search, and any website with text fields.

## Installation

### From Source (Developer Mode)

```bash
# Clone and install dependencies
git clone <repo-url>
cd typing_plugin
npm install

# Build the seed dictionary
npm run build:dict

# Build the extension
npm run build

# Load in Chrome:
# 1. Open chrome://extensions
# 2. Enable "Developer mode" (top right)
# 3. Click "Load unpacked"
# 4. Select the `dist/` folder
```

### Development Mode (Hot Reload)

```bash
npm run dev
```

This starts a Vite dev server with hot module replacement. Load the `dist/` folder in Chrome as above — changes will auto-reload.

## Usage

### Basic Typing

Once installed, the extension is active on all pages. Focus any text field and start typing in Roman script — Devanagari appears in real-time.

| You type | You get |
|----------|---------|
| `namaste` | नमस्ते |
| `kaam` | काम |
| `paani` | पानी |
| `bharat` | भारत |
| `dhanyavaad` | धन्यवाद |
| `kya haal hai` | क्या हाल है |

### Keyboard Controls

| Key | Action |
|-----|--------|
| **Space** | Commit the top candidate and insert a space |
| **1-9** | Select a specific candidate from the strip |
| **Arrow Up/Down** | Navigate between candidates |
| **Enter** | Commit the current candidate (Enter passes through to the page after committing) |
| **Tab** | Commit the current candidate (Tab passes through after committing) |
| **Backspace** | Remove the last Roman character and re-process |
| **Escape** | Cancel the current composition (discard preview) |
| **Alt+Shift+H** | Toggle transliteration on/off globally |

### Candidate Strip

As you type, a floating candidate strip appears near the cursor showing alternatives:

```
[1]क  [2]ख  [3]क्ष  [4]कै  [5]को
```

- The first candidate is auto-selected (highlighted in blue)
- Press a number key (1-9) to pick a specific candidate
- Use arrow keys to navigate, then Space or Enter to confirm
- The strip auto-hides when you commit, blur the field, or scroll

### AI Suggestions (LLM-Powered)

The extension can optionally use any OpenAI-compatible LLM to predict your next word based on what you've already typed. Predictions appear in a second row below the transliteration candidates, marked with a `✦` icon.

```
┌──────────────────────────────────────┐
│ 1 नम   2 नमस्   3 नाम   4 नमक      │  ← transliteration candidates
├──────────────────────────────────────┤
│ ✦ नमस्ते   स्कार   मस्कार           │  ← AI predictions (click to insert)
└──────────────────────────────────────┘
```

#### Setup

1. Click the extension icon in the toolbar
2. Under **AI Suggestions**, toggle **Enable** on
3. Configure your LLM provider:

| Setting | Description | Example |
|---------|-------------|---------|
| **Endpoint** | Any OpenAI-compatible chat completions URL | `http://localhost:11434/v1/chat/completions` |
| **API Key** | Authentication key (leave blank for local models) | `sk-...` |
| **Model** | Model name to use | `llama3`, `gpt-4o-mini`, `mistral` |
| **Max Suggestions** | Number of predictions to show (3-5) | `3` |

#### Supported LLM Providers

Any service that implements the OpenAI chat completions API format works:

| Provider | Endpoint | API Key Required |
|----------|----------|-----------------|
| **Ollama** (local) | `http://localhost:11434/v1/chat/completions` | No |
| **LM Studio** (local) | `http://localhost:1234/v1/chat/completions` | No |
| **OpenAI** | `https://api.openai.com/v1/chat/completions` | Yes |
| **Groq** | `https://api.groq.com/openai/v1/chat/completions` | Yes |
| **Together AI** | `https://api.together.xyz/v1/chat/completions` | Yes |
| **OpenRouter** | `https://openrouter.ai/api/v1/chat/completions` | Yes |

#### How It Works

- After you commit a word (press Space), the extension sends your full sentence so far to the LLM and asks it to predict the next likely words
- While you type the next word, predictions are refined based on your partial input (debounced at 300ms to avoid excessive API calls)
- Click any prediction to insert it directly — it will be committed with a space and the LLM will immediately predict the next word
- Predictions are cached (last 100 queries, 5-minute TTL) to avoid redundant API calls for repeated contexts
- All API calls go through the extension's service worker, so they work on all websites regardless of Content Security Policy

#### Using with Ollama (Recommended for Local Setup)

[Ollama](https://ollama.com) is the easiest way to run a local LLM:

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull a model (llama3 recommended for Hindi)
ollama pull llama3

# Ollama starts automatically — the endpoint is ready at:
# http://localhost:11434/v1/chat/completions
```

Then in the extension popup:
- **Endpoint**: `http://localhost:11434/v1/chat/completions`
- **API Key**: *(leave blank)*
- **Model**: `llama3`

#### Privacy

- When AI Suggestions are **disabled** (the default), no data leaves your browser — the extension is fully offline
- When **enabled with a local model** (Ollama, LM Studio), your text stays on your machine
- When **enabled with a cloud API** (OpenAI, Groq, etc.), your typed sentence context is sent to that provider's servers — review their privacy policy before use
- API keys are stored in `chrome.storage.local`, which Chrome encrypts at rest using OS-level encryption

### Voice Input

Click the microphone button that appears near the active text field to speak in Hindi. The speech is recognized using Chrome's built-in Web Speech API with `lang="hi-IN"` and inserted directly as Devanagari.

### Popup Controls

Click the extension icon in the toolbar to access settings:

- **Toggle switch** — enable/disable transliteration
- **Mode** — Casual (relaxed matching, case-insensitive) or ITRANS (strict standard mapping)
- **Max Candidates** — number of alternatives shown in the strip (3, 5, 7, or 9)
- **Voice Input** — enable/disable the microphone button
- **AI Suggestions** — enable and configure LLM-powered next-word prediction (see [AI Suggestions](#ai-suggestions-llm-powered) above)

The badge shows "हि" (green) when active, or disappears when disabled.

## Transliteration Reference

### Vowels

| Roman | Devanagari | Roman | Devanagari |
|-------|-----------|-------|-----------|
| `a` | अ | `aa` / `A` | आ |
| `i` | इ | `ee` / `ii` / `I` | ई |
| `u` | उ | `oo` / `uu` / `U` | ऊ |
| `e` | ए | `ai` | ऐ |
| `o` | ओ | `au` / `ou` | औ |
| `ri` | ऋ | | |

After a consonant, vowels become matras: `ka` → क, `kaa` → का, `ki` → कि, `kee` → की

### Consonants

| Roman | Devanagari | Roman | Devanagari | Roman | Devanagari |
|-------|-----------|-------|-----------|-------|-----------|
| `k` | क | `kh` | ख | `g` | ग |
| `gh` | घ | `ch` | च | `chh` | छ |
| `j` | ज | `jh` | झ | `t` | त |
| `th` | थ | `d` | द | `dh` | ध |
| `n` | न | `p` | प | `ph` / `f` | फ |
| `b` | ब | `bh` | भ | `m` | म |
| `y` | य | `r` | र | `l` | ल |
| `v` / `w` | व | `sh` | श | `s` | स |
| `h` | ह | `z` | ज़ | `q` | क़ |

**Retroflex consonants** (use uppercase): `T` → ट, `Th` → ठ, `D` → ड, `Dh` → ढ, `N` → ण

### Conjuncts

| Roman | Devanagari | Example |
|-------|-----------|---------|
| `ksh` / `x` | क्ष | `kshama` → क्षमा |
| `tr` | त्र | `patra` → पत्र |
| `gn` / `gy` | ज्ञ | `gyaan` → ज्ञान |
| `shr` | श्र | `shree` → श्री |

Consecutive consonants are automatically joined with halant (virama): `kt` → क्त, `str` → स्त्र

### Special Characters

| Roman | Devanagari | Name |
|-------|-----------|------|
| `M` / `.n` | ं | Anusvara |
| `H` / `.h` | ः | Visarga |
| `N^` / `.c` | ँ | Chandrabindu |
| `.` | । | Danda |
| `..` | ॥ | Double Danda |
| `Om` | ॐ | Om |

## Project Structure

```
typing_plugin/
├── manifest.json              # Chrome extension manifest (V3)
├── src/
│   ├── engine/                # Transliteration engine (pure logic, no DOM)
│   │   ├── transliterator.ts  # Trie-based state machine
│   │   ├── candidate-ranker.ts
│   │   ├── dictionary.ts      # Prefix trie for word prediction
│   │   └── language-pack.ts   # Hindi loader + registry
│   ├── content/               # Content scripts (injected into pages)
│   │   ├── content-script.ts  # Entry point
│   │   ├── field-interceptor.ts
│   │   ├── composition-manager.ts
│   │   ├── candidate-strip.ts # Shadow DOM floating UI
│   │   ├── text-injector.ts   # execCommand-based insertion
│   │   └── voice-input.ts
│   ├── background/
│   │   ├── service-worker.ts  # Toggle, prefs, offscreen doc, LLM proxy
│   │   └── llm-client.ts     # OpenAI-compatible API client + LRU cache
│   ├── offscreen/
│   │   ├── speech.html
│   │   └── speech.ts          # Web Speech API (hi-IN)
│   ├── popup/
│   │   ├── popup.html
│   │   └── popup.ts
│   └── shared/
│       ├── types.ts
│       ├── constants.ts
│       └── message-protocol.ts
├── data/hindi/
│   ├── transliteration-rules.json
│   ├── conjuncts.json
│   └── dictionary.bin
├── scripts/
│   └── build-dictionary.ts
└── tests/
    ├── engine/
    │   ├── transliterator.test.ts
    │   ├── candidate-ranker.test.ts
    │   └── dictionary.test.ts
    ├── background/
    │   └── llm-client.test.ts
    ├── content/
    │   └── composition-manager.test.ts
    └── integration/
        └── llm-suggestions.test.ts
```

## Development

### Running Tests

```bash
# Run all tests once
npm test

# Watch mode
npm run test:watch
```

### Building the Dictionary

The seed dictionary ships with ~120 common Hindi words. To build from a custom frequency list:

```bash
# With custom word list (tab-separated: word\tfrequency)
npx tsx scripts/build-dictionary.ts path/to/wordlist.txt

# Or regenerate the seed dictionary
npm run build:dict
```

### Type Checking

```bash
npx tsc --noEmit
```

### Adding a New Language

The engine is language-agnostic. To add a new language (e.g., Tamil, Bengali):

1. Create `data/<lang>/transliteration-rules.json` with the same schema as Hindi
2. Create `data/<lang>/conjuncts.json` for script-specific combination rules
3. Build `data/<lang>/dictionary.bin` from a frequency word list
4. Create a new `LanguagePack` class in `src/engine/language-pack.ts`

No engine, UI, or extension code changes needed.

## Technical Notes

- **Text injection** uses `document.execCommand('insertText')` to preserve the browser undo stack and fire native `InputEvent`s that React/Vue/Angular detect
- **Shadow DOM** isolates the candidate strip CSS from host page styles
- **Trie-based engine** processes each keystroke in <1ms with longest-match-first semantics
- **Offscreen document** is used for voice input because `SpeechRecognition` requires a DOM context unavailable in service workers or content scripts
- **LLM calls route through the service worker** to avoid Content Security Policy (CSP) restrictions — content scripts inherit the page's CSP, which blocks arbitrary `fetch()` on sites like Gmail and GitHub. The service worker is exempt from page CSP.
- **LLM response caching** uses an in-memory LRU cache (100 entries, 5-minute TTL) keyed on the last 3 committed words + partial input, so similar typing contexts share cached predictions
- **Request cancellation** via `AbortController` ensures only the latest prediction request completes when typing rapidly

## License

MIT
