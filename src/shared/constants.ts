/** Devanagari Unicode block range */
export const DEVANAGARI_START = 0x0900;
export const DEVANAGARI_END = 0x097f;

/** Common Devanagari characters */
export const HALANT = "\u094D"; // ्
export const NUKTA = "\u093C"; // ़
export const CHANDRABINDU = "\u0901"; // ँ
export const ANUSVARA = "\u0902"; // ं
export const VISARGA = "\u0903"; // ः
export const DANDA = "\u0964"; // ।
export const DOUBLE_DANDA = "\u0965"; // ॥

/** Zero-width characters used in Devanagari rendering */
export const ZWJ = "\u200D"; // Zero Width Joiner
export const ZWNJ = "\u200C"; // Zero Width Non-Joiner

/** Keys that should pass through without interception */
export const PASSTHROUGH_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Delete",
  "Insert",
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F7",
  "F8",
  "F9",
  "F10",
  "F11",
  "F12",
  "CapsLock",
  "NumLock",
  "ScrollLock",
  "PrintScreen",
  "Pause",
  "ContextMenu",
]);

/** Keys that commit current composition before passing through */
export const COMMIT_KEYS = new Set(["Enter", "Tab"]);

/** Roman characters that the transliteration engine handles */
export const ROMAN_CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Maximum number of candidates to show in the strip */
export const MAX_CANDIDATES = 9;

/** Default user preferences */
export const DEFAULT_PREFERENCES = {
  enabled: true,
  language: "hindi",
  mode: "casual" as const,
  maxCandidates: 5,
  voiceEnabled: true,
  theme: "auto" as const,
  showNumberKeys: true,
  llmEnabled: false,
  llmEndpoint: "",
  llmApiKey: "",
  llmModel: "",
  llmMaxSuggestions: 3,
};

/** CSS z-index for the candidate strip overlay */
export const CANDIDATE_STRIP_Z_INDEX = 2147483647;
