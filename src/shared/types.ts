/** A single transliteration candidate */
export interface Candidate {
  /** Devanagari text */
  text: string;
  /** The Roman input that produced this candidate */
  roman: string;
  /** Whether this is from a conjunct/special rule */
  type: "vowel" | "consonant" | "conjunct" | "special";
  /** Frequency score (higher = more common), 0 if unknown */
  frequency: number;
}

/** A predicted word from the dictionary */
export interface PredictedWord {
  /** Full Devanagari word */
  word: string;
  /** Frequency rank (lower = more common) */
  rank: number;
  /** The prefix that matched */
  matchedPrefix: string;
}

/** Composition state machine states */
export type CompositionStatus = "IDLE" | "COMPOSING";

/** Full state of the composition manager */
export interface CompositionState {
  status: CompositionStatus;
  /** Accumulated Roman keystrokes in current composition */
  romanBuffer: string;
  /** Current Devanagari preview for the buffer */
  devanagariPreview: string;
  /** Available candidates for current buffer */
  candidates: Candidate[];
  /** Currently selected candidate index (0-based) */
  selectedIndex: number;
  /** Already committed Devanagari text in current word */
  committedText: string;
  /** Whether transliteration is enabled */
  enabled: boolean;
}

/** Result from the transliteration engine */
export interface TransliterationResult {
  /** Ordered list of candidates */
  candidates: Candidate[];
  /** Top-ranked candidate */
  topCandidate: string;
  /** Whether the buffer is a partial match (more chars may refine) */
  isPartial: boolean;
  /** Consumed portion of the input */
  consumed: string;
  /** Remaining unconsumed input */
  remaining: string;
}

/** Language pack interface — implement for each supported language */
export interface LanguagePack {
  /** Language identifier (e.g., "hindi") */
  id: string;
  /** Display name */
  name: string;
  /** Script name (e.g., "Devanagari") */
  script: string;
  /** BCP 47 language tag for speech recognition */
  speechLang: string;
  /** Halant/virama character for this script */
  halant: string;
  /** Load and return transliteration rules */
  loadRules(): Promise<TransliterationRules>;
}

/** Parsed transliteration rules from JSON */
export interface TransliterationRules {
  vowels: {
    independent: Record<string, string>;
    matra: Record<string, string>;
  };
  consonants: Record<string, string>;
  nuqta_consonants: Record<string, string>;
  conjuncts: Record<string, string>;
  special: Record<string, string>;
  halant: string;
}

/** User preferences stored in chrome.storage.local */
export interface UserPreferences {
  enabled: boolean;
  language: string;
  mode: "casual" | "itrans";
  maxCandidates: number;
  voiceEnabled: boolean;
  theme: "auto" | "light" | "dark";
  showNumberKeys: boolean;
  /** Whether LLM-powered suggestions are enabled */
  llmEnabled: boolean;
  /** OpenAI-compatible API endpoint URL */
  llmEndpoint: string;
  /** API key for the LLM endpoint */
  llmApiKey: string;
  /** Model name (e.g., "llama3", "gpt-4o-mini") */
  llmModel: string;
  /** Max number of LLM suggestions to show */
  llmMaxSuggestions: number;
}

/** Trie node for the transliteration engine */
export interface TrieNode {
  children: Map<string, TrieNode>;
  /** If this node is terminal, the Devanagari output */
  value: string | null;
  /** Type of mapping */
  type: "vowel" | "consonant" | "conjunct" | "special" | null;
  /** Whether this is a vowel (affects matra handling) */
  isVowel: boolean;
}
