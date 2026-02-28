import type { Candidate } from "../shared/types";

/**
 * Ranks transliteration candidates by priority:
 * 1. Exact match (buffer fully consumed) > partial
 * 2. Higher frequency > lower frequency
 * 3. Shorter Roman input > longer (prefer simpler mappings)
 * 4. Alphabetical by Roman (stable tie-breaker)
 */
export function rankCandidates(
  candidates: Candidate[],
  maxResults: number = 9
): Candidate[] {
  if (candidates.length === 0) return [];

  // Deduplicate by Devanagari text (keep highest frequency version)
  const seen = new Map<string, Candidate>();
  for (const c of candidates) {
    const existing = seen.get(c.text);
    if (!existing || c.frequency > existing.frequency) {
      seen.set(c.text, c);
    }
  }

  const unique = Array.from(seen.values());

  unique.sort((a, b) => {
    // Higher frequency first
    if (a.frequency !== b.frequency) return b.frequency - a.frequency;
    // Shorter roman input first (simpler mapping)
    if (a.roman.length !== b.roman.length) return a.roman.length - b.roman.length;
    // Alphabetical tie-breaker
    return a.roman.localeCompare(b.roman);
  });

  return unique.slice(0, maxResults);
}

/**
 * Merge transliteration candidates with dictionary predictions.
 * First slot is always the current transliteration, remaining are predictions.
 */
export function mergeCandidatesWithPredictions(
  translitCandidates: Candidate[],
  predictions: Candidate[],
  maxResults: number = 9
): Candidate[] {
  const merged: Candidate[] = [];

  // First: top transliteration candidate
  if (translitCandidates.length > 0) {
    merged.push(translitCandidates[0]);
  }

  // Then: word predictions (deduplicated against translit candidates)
  const seen = new Set(merged.map((c) => c.text));
  for (const pred of predictions) {
    if (!seen.has(pred.text)) {
      merged.push(pred);
      seen.add(pred.text);
    }
    if (merged.length >= maxResults) break;
  }

  // Fill remaining with other translit candidates
  for (let i = 1; i < translitCandidates.length && merged.length < maxResults; i++) {
    if (!seen.has(translitCandidates[i].text)) {
      merged.push(translitCandidates[i]);
      seen.add(translitCandidates[i].text);
    }
  }

  return merged;
}
