import type {
  Candidate,
  TransliterationResult,
  TransliterationRules,
  TrieNode,
} from "../shared/types";

/** Create an empty trie node */
function createNode(): TrieNode {
  return {
    children: new Map(),
    value: null,
    type: null,
    isVowel: false,
  };
}

/**
 * Trie-based transliteration engine.
 *
 * Processes Roman input character-by-character, walking a trie built from
 * transliteration rules. Returns Devanagari candidates at each step.
 *
 * Key behaviors:
 * - Longest match first: "ksh" → क्ष, not क+श+ह
 * - Consonant + vowel → matra form: k+a → क (inherent), k+aa → का
 * - Consonant + consonant → halant joining: k+k → क्क
 * - Inherent 'a' is implicit after consonants (schwa)
 */
export class Transliterator {
  private root: TrieNode;
  private vowelMatras: Map<string, string>;
  private vowelIndependent: Map<string, string>;
  private consonantSet: Set<string>;
  private halant: string;

  constructor(rules: TransliterationRules) {
    this.root = createNode();
    this.vowelMatras = new Map();
    this.vowelIndependent = new Map();
    this.consonantSet = new Set();
    this.halant = rules.halant;

    this.buildTrie(rules);
  }

  private buildTrie(rules: TransliterationRules): void {
    // Insert vowels (independent forms)
    for (const [roman, deva] of Object.entries(rules.vowels.independent)) {
      this.insertRule(roman, deva, "vowel", true);
      this.vowelIndependent.set(roman, deva);
    }

    // Build matra map
    for (const [roman, matra] of Object.entries(rules.vowels.matra)) {
      this.vowelMatras.set(roman, matra);
    }

    // Insert consonants
    for (const [roman, deva] of Object.entries(rules.consonants)) {
      this.insertRule(roman, deva, "consonant", false);
      this.consonantSet.add(deva);
    }

    // Insert nuqta consonants
    for (const [roman, deva] of Object.entries(rules.nuqta_consonants)) {
      this.insertRule(roman, deva, "consonant", false);
      this.consonantSet.add(deva);
    }

    // Insert conjuncts
    for (const [roman, deva] of Object.entries(rules.conjuncts)) {
      this.insertRule(roman, deva, "conjunct", false);
    }

    // Insert special characters
    for (const [roman, deva] of Object.entries(rules.special)) {
      this.insertRule(roman, deva, "special", false);
    }
  }

  private insertRule(
    roman: string,
    devanagari: string,
    type: "vowel" | "consonant" | "conjunct" | "special",
    isVowel: boolean
  ): void {
    let node = this.root;
    for (const ch of roman) {
      if (!node.children.has(ch)) {
        node.children.set(ch, createNode());
      }
      node = node.children.get(ch)!;
    }
    node.value = devanagari;
    node.type = type;
    node.isVowel = isVowel;
  }

  /**
   * Check if a Devanagari character is a consonant.
   */
  isConsonant(deva: string): boolean {
    if (this.consonantSet.has(deva)) return true;
    // Check Unicode range for Devanagari consonants (क-ह: 0x0915-0x0939)
    const code = deva.charCodeAt(0);
    return code >= 0x0915 && code <= 0x0939;
  }

  /**
   * Get the matra form of a vowel for use after a consonant.
   */
  getMatra(vowelRoman: string): string | undefined {
    return this.vowelMatras.get(vowelRoman);
  }

  /**
   * Process a Roman input buffer and return transliteration candidates.
   *
   * This implements greedy longest-match: it walks the trie as far as
   * possible, then returns the match and any remaining input.
   */
  process(buffer: string): TransliterationResult {
    if (!buffer) {
      return {
        candidates: [],
        topCandidate: "",
        isPartial: false,
        consumed: "",
        remaining: "",
      };
    }

    const candidates: Candidate[] = [];
    let pos = 0;
    let result = "";
    let lastConsonant: string | null = null;

    while (pos < buffer.length) {
      const { match, consumed, node } = this.longestMatch(buffer, pos);

      if (match && node) {
        if (node.isVowel && lastConsonant !== null) {
          // Vowel after consonant → use matra form
          const matra = this.vowelMatras.get(consumed);
          if (matra !== undefined) {
            result += matra;
          }
          // matra "" means inherent 'a' — no explicit matra needed
          lastConsonant = null;
        } else if (
          node.type === "consonant" ||
          node.type === "conjunct"
        ) {
          if (lastConsonant !== null) {
            // Consonant after consonant → insert halant
            result += this.halant;
          }
          result += match;
          lastConsonant = match;
        } else {
          // Vowel (independent) or special
          if (lastConsonant !== null && node.isVowel) {
            const matra = this.vowelMatras.get(consumed);
            if (matra !== undefined) {
              result += matra;
            }
            lastConsonant = null;
          } else {
            result += match;
            lastConsonant = null;
          }
        }
        pos += consumed.length;
      } else {
        // No match — character passes through unchanged
        result += buffer[pos];
        lastConsonant = null;
        pos++;
      }
    }

    // Build candidates from the full buffer
    candidates.push(
      ...this.buildCandidates(buffer)
    );

    // If no candidates were generated, use the result itself
    if (candidates.length === 0 && result) {
      candidates.push({
        text: result,
        roman: buffer,
        type: "consonant",
        frequency: 0,
      });
    }

    return {
      candidates,
      topCandidate: result,
      isPartial: this.hasPartialMatch(buffer),
      consumed: buffer,
      remaining: "",
    };
  }

  /**
   * Process input incrementally — designed for keystroke-by-keystroke use.
   *
   * Takes the current buffer and returns:
   * - The Devanagari output so far
   * - Whether the buffer still has a partial match in the trie
   * - Candidates for the current position
   */
  processIncremental(
    buffer: string,
    previousOutput: string,
    lastConsonantOutput: string | null
  ): {
    output: string;
    pending: string;
    candidates: Candidate[];
    isPartial: boolean;
    lastConsonant: string | null;
  } {
    if (!buffer) {
      return {
        output: previousOutput,
        pending: "",
        candidates: [],
        isPartial: false,
        lastConsonant: lastConsonantOutput,
      };
    }

    let output = previousOutput;
    let pending = "";
    let lastCons = lastConsonantOutput;
    let pos = 0;

    while (pos < buffer.length) {
      const remaining = buffer.slice(pos);

      // Check if remaining is a partial match (could become longer match)
      if (this.hasPartialMatch(remaining) && pos < buffer.length) {
        // Try for a complete match first
        const { match, consumed, node } = this.longestMatch(buffer, pos);

        if (match && node && consumed.length === remaining.length) {
          // Full remaining buffer matches — but could extend further
          pending = remaining;
          break;
        } else if (match && node) {
          // Partial buffer matches completely, consume it
          const result = this.applyMatch(match, node, consumed, lastCons);
          output += result.text;
          lastCons = result.lastConsonant;
          pos += consumed.length;
        } else {
          // Partial match only — hold in pending
          pending = remaining;
          break;
        }
      } else {
        // No partial match — try complete match
        const { match, consumed, node } = this.longestMatch(buffer, pos);
        if (match && node) {
          const result = this.applyMatch(match, node, consumed, lastCons);
          output += result.text;
          lastCons = result.lastConsonant;
          pos += consumed.length;
        } else {
          output += buffer[pos];
          lastCons = null;
          pos++;
        }
      }
    }

    const candidates = this.buildCandidates(pending || buffer.slice(pos));

    return {
      output,
      pending,
      candidates,
      isPartial: pending.length > 0,
      lastConsonant: lastCons,
    };
  }

  private applyMatch(
    match: string,
    node: TrieNode,
    consumed: string,
    lastConsonant: string | null
  ): { text: string; lastConsonant: string | null } {
    let text = "";
    let newLastConsonant: string | null = lastConsonant;

    if (node.isVowel && lastConsonant !== null) {
      const matra = this.vowelMatras.get(consumed);
      if (matra !== undefined) {
        text = matra;
      }
      newLastConsonant = null;
    } else if (node.type === "consonant" || node.type === "conjunct") {
      if (lastConsonant !== null) {
        text = this.halant + match;
      } else {
        text = match;
      }
      newLastConsonant = match;
    } else {
      text = match;
      newLastConsonant = null;
    }

    return { text, lastConsonant: newLastConsonant };
  }

  /**
   * Find the longest match in the trie starting at position `pos` in the buffer.
   */
  private longestMatch(
    buffer: string,
    pos: number
  ): { match: string | null; consumed: string; node: TrieNode | null } {
    let node = this.root;
    let lastMatch: string | null = null;
    let lastMatchLen = 0;
    let lastNode: TrieNode | null = null;

    for (let i = pos; i < buffer.length; i++) {
      const ch = buffer[i];
      const child = node.children.get(ch);
      if (!child) break;

      node = child;
      if (node.value !== null) {
        lastMatch = node.value;
        lastMatchLen = i - pos + 1;
        lastNode = node;
      }
    }

    return {
      match: lastMatch,
      consumed: buffer.slice(pos, pos + lastMatchLen),
      node: lastNode,
    };
  }

  /**
   * Check if there is any partial match in the trie for the given buffer.
   * Returns true if the buffer could potentially lead to a longer match.
   */
  hasPartialMatch(buffer: string): boolean {
    let node = this.root;
    for (const ch of buffer) {
      const child = node.children.get(ch);
      if (!child) return false;
      node = child;
    }
    // It's partial if the node has children (could match more)
    return node.children.size > 0;
  }

  /**
   * Build candidate list for the current pending buffer.
   * Returns all possible completions from the current trie position.
   */
  buildCandidates(buffer: string): Candidate[] {
    if (!buffer) return [];

    const candidates: Candidate[] = [];

    // Walk to the node for the current buffer
    let node = this.root;
    for (const ch of buffer) {
      const child = node.children.get(ch);
      if (!child) return candidates;
      node = child;
    }

    // If current node is terminal, add it as a candidate
    if (node.value !== null) {
      candidates.push({
        text: node.value,
        roman: buffer,
        type: node.type || "consonant",
        frequency: 100,
      });
    }

    // Add child completions (one level deep for immediate candidates)
    this.collectCandidates(node, buffer, candidates, 2);

    return candidates;
  }

  /**
   * Recursively collect candidate completions from a trie node.
   */
  private collectCandidates(
    node: TrieNode,
    prefix: string,
    candidates: Candidate[],
    maxDepth: number
  ): void {
    if (maxDepth <= 0) return;

    for (const [ch, child] of node.children) {
      if (child.value !== null) {
        candidates.push({
          text: child.value,
          roman: prefix + ch,
          type: child.type || "consonant",
          frequency: 50,
        });
      }
      this.collectCandidates(child, prefix + ch, candidates, maxDepth - 1);
    }
  }

  /**
   * Get all rules as a flat map (for debugging/testing).
   */
  getAllRules(): Map<string, string> {
    const rules = new Map<string, string>();
    this.collectRules(this.root, "", rules);
    return rules;
  }

  private collectRules(
    node: TrieNode,
    prefix: string,
    rules: Map<string, string>
  ): void {
    if (node.value !== null) {
      rules.set(prefix, node.value);
    }
    for (const [ch, child] of node.children) {
      this.collectRules(child, prefix + ch, rules);
    }
  }
}
