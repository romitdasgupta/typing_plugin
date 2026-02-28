import type { PredictedWord } from "../shared/types";

/**
 * Compressed trie dictionary for Hindi word prediction.
 *
 * Stores words in a prefix trie for efficient prefix-based lookup.
 * Designed for lazy loading: the binary data is fetched on first use
 * and deserialized into an in-memory trie.
 *
 * Binary format (from build-dictionary.ts):
 * - Header: 4 bytes magic ("HTDT"), 4 bytes version, 4 bytes node count
 * - Nodes: each node has a character (UTF-16), frequency (uint16),
 *   isTerminal flag, child count, and child offsets
 */

interface DictTrieNode {
  children: Map<string, DictTrieNode>;
  isTerminal: boolean;
  frequency: number;
}

export class Dictionary {
  private root: DictTrieNode;
  private loaded = false;

  constructor() {
    this.root = this.createNode();
  }

  /**
   * Load dictionary from a binary file URL.
   * In extension context: chrome.runtime.getURL('data/hindi/dictionary.bin')
   */
  async loadFromUrl(url: string): Promise<void> {
    try {
      const response = await fetch(url);
      const buffer = await response.arrayBuffer();
      this.deserialize(buffer);
      this.loaded = true;
    } catch (e) {
      console.warn("Failed to load dictionary:", e);
    }
  }

  /**
   * Load dictionary from a plain text word list (one word per line,
   * optionally with frequency: "word\tfrequency").
   * Used for testing and as a fallback.
   */
  loadFromWordList(text: string): void {
    const lines = text.trim().split("\n");
    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split("\t");
      const word = parts[0].trim();
      const frequency = parts.length > 1 ? parseInt(parts[1]) : lines.length - i;
      if (word) {
        this.insert(word, frequency);
      }
    }
    this.loaded = true;
  }

  /**
   * Insert a word into the trie with a frequency score.
   */
  insert(word: string, frequency: number): void {
    let node = this.root;
    for (const ch of word) {
      if (!node.children.has(ch)) {
        node.children.set(ch, this.createNode());
      }
      node = node.children.get(ch)!;
    }
    node.isTerminal = true;
    node.frequency = frequency;
  }

  /**
   * Predict words starting with the given Devanagari prefix.
   * Returns results sorted by frequency (highest first).
   */
  predict(prefix: string, maxResults: number = 5): PredictedWord[] {
    if (!this.loaded || !prefix) return [];

    // Walk to the prefix node
    let node = this.root;
    for (const ch of prefix) {
      const child = node.children.get(ch);
      if (!child) return [];
      node = child;
    }

    // Collect all words under this prefix
    const results: PredictedWord[] = [];
    this.collectWords(node, prefix, prefix, results);

    // Sort by frequency (higher = more common)
    results.sort((a, b) => b.rank - a.rank);

    return results.slice(0, maxResults);
  }

  /**
   * Check if a word exists in the dictionary.
   */
  has(word: string): boolean {
    let node = this.root;
    for (const ch of word) {
      const child = node.children.get(ch);
      if (!child) return false;
      node = child;
    }
    return node.isTerminal;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Get the total number of words in the dictionary.
   */
  size(): number {
    let count = 0;
    const stack: DictTrieNode[] = [this.root];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (node.isTerminal) count++;
      for (const child of node.children.values()) {
        stack.push(child);
      }
    }
    return count;
  }

  private collectWords(
    node: DictTrieNode,
    currentWord: string,
    matchedPrefix: string,
    results: PredictedWord[]
  ): void {
    if (node.isTerminal) {
      results.push({
        word: currentWord,
        rank: node.frequency,
        matchedPrefix,
      });
    }

    // Limit depth to prevent excessive recursion
    if (currentWord.length - matchedPrefix.length > 10) return;
    // Limit total results collected before sorting
    if (results.length > 100) return;

    for (const [ch, child] of node.children) {
      this.collectWords(child, currentWord + ch, matchedPrefix, results);
    }
  }

  /**
   * Deserialize from binary format.
   *
   * Format:
   * [4 bytes magic "HTDT"]
   * [4 bytes version (1)]
   * [4 bytes total word count]
   * [remaining: newline-separated "word\tfrequency" in UTF-8]
   *
   * We use a simple text-in-binary format for v1. A more compact
   * format (serialized trie nodes) can be implemented in v2.
   */
  private deserialize(buffer: ArrayBuffer): void {
    const decoder = new TextDecoder("utf-8");
    const bytes = new Uint8Array(buffer);

    // Check magic header
    const magic = decoder.decode(bytes.slice(0, 4));
    if (magic !== "HTDT") {
      // Fallback: treat entire buffer as plain text word list
      const text = decoder.decode(buffer);
      this.loadFromWordList(text);
      return;
    }

    // Skip header (12 bytes: magic + version + count)
    const text = decoder.decode(bytes.slice(12));
    this.loadFromWordList(text);
  }

  private createNode(): DictTrieNode {
    return {
      children: new Map(),
      isTerminal: false,
      frequency: 0,
    };
  }

  /**
   * Serialize to binary format for the build script.
   */
  serialize(): ArrayBuffer {
    const words: string[] = [];
    this.collectAllWords(this.root, "", words);

    const header = new ArrayBuffer(12);
    const headerView = new DataView(header);
    // Magic: "HTDT"
    const encoder = new TextEncoder();
    const magicBytes = encoder.encode("HTDT");
    new Uint8Array(header).set(magicBytes, 0);
    // Version
    headerView.setUint32(4, 1, true);
    // Word count
    headerView.setUint32(8, words.length, true);

    // Body
    const body = encoder.encode(words.join("\n"));

    // Combine
    const result = new ArrayBuffer(12 + body.length);
    new Uint8Array(result).set(new Uint8Array(header), 0);
    new Uint8Array(result).set(body, 12);

    return result;
  }

  private collectAllWords(
    node: DictTrieNode,
    prefix: string,
    words: string[]
  ): void {
    if (node.isTerminal) {
      words.push(`${prefix}\t${node.frequency}`);
    }
    for (const [ch, child] of node.children) {
      this.collectAllWords(child, prefix + ch, words);
    }
  }
}
