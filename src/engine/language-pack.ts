import type { LanguagePack, TransliterationRules } from "../shared/types";
import hindiRulesJson from "../../data/hindi/transliteration-rules.json";

/**
 * Hindi language pack.
 *
 * Loads transliteration rules from the bundled JSON data.
 * In the extension context, rules are bundled at build time.
 * For testing, they're imported directly.
 */
export class HindiLanguagePack implements LanguagePack {
  readonly id = "hindi";
  readonly name = "हिन्दी (Hindi)";
  readonly script = "Devanagari";
  readonly speechLang = "hi-IN";
  readonly halant = "्";

  async loadRules(): Promise<TransliterationRules> {
    return {
      vowels: hindiRulesJson.vowels,
      consonants: hindiRulesJson.consonants,
      nuqta_consonants: hindiRulesJson.nuqta_consonants,
      conjuncts: hindiRulesJson.conjuncts,
      special: hindiRulesJson.special,
      halant: hindiRulesJson.halant,
    };
  }
}

/** Registry of available language packs */
const languagePacks: Map<string, LanguagePack> = new Map();

export function registerLanguagePack(pack: LanguagePack): void {
  languagePacks.set(pack.id, pack);
}

export function getLanguagePack(id: string): LanguagePack | undefined {
  return languagePacks.get(id);
}

export function getAvailableLanguages(): { id: string; name: string }[] {
  return Array.from(languagePacks.values()).map((p) => ({
    id: p.id,
    name: p.name,
  }));
}

// Auto-register Hindi
registerLanguagePack(new HindiLanguagePack());
