# Hindi Typing — Devanagari Transliteration Chrome Extension

Type in Hindi (Devanagari) anywhere on the web using Roman keystrokes. Real-time transliteration with an inline candidate strip, predictive word completion, and voice input — entirely client-side.

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

### Voice Input

Click the microphone button that appears near the active text field to speak in Hindi. The speech is recognized using Chrome's built-in Web Speech API with `lang="hi-IN"` and inserted directly as Devanagari.

### Popup Controls

Click the extension icon in the toolbar to access settings:

- **Toggle switch** — enable/disable transliteration
- **Mode** — Casual (relaxed matching, case-insensitive) or ITRANS (strict standard mapping)
- **Max Candidates** — number of alternatives shown in the strip (3, 5, 7, or 9)
- **Voice Input** — enable/disable the microphone button

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
│   │   └── service-worker.ts  # Toggle, prefs, offscreen doc
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
    └── content/
        └── composition-manager.test.ts
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

## License

MIT
