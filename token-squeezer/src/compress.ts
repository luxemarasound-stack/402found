import { CompressResult } from "./types.js";

// ~1.3 tokens per word is a reliable average across GPT/Claude tokenizers
const TOKENS_PER_WORD = 1.3;

function estimateTokens(text: string): number {
  return Math.ceil(text.split(/\s+/).filter(Boolean).length * TOKENS_PER_WORD);
}

// Split on sentence boundaries while preserving code blocks as atomic units
function splitSegments(text: string): string[] {
  const segments: string[] = [];
  const codeBlockRe = /```[\s\S]*?```/g;
  let lastIndex = 0;

  for (const match of text.matchAll(codeBlockRe)) {
    const before = text.slice(lastIndex, match.index);
    segments.push(...splitSentences(before));
    segments.push(match[0]);
    lastIndex = match.index! + match[0].length;
  }

  segments.push(...splitSentences(text.slice(lastIndex)));
  return segments.filter((s) => s.trim().length > 0);
}

function splitSentences(text: string): string[] {
  // Split on period/question/exclamation followed by space or newline,
  // or on double-newline (paragraph breaks)
  return text
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Build word frequency map, ignoring stop words
function buildFrequencyMap(segments: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  const stops = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought",
    "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
    "as", "into", "through", "during", "before", "after", "above", "below",
    "between", "out", "off", "over", "under", "again", "further", "then",
    "once", "here", "there", "when", "where", "why", "how", "all", "each",
    "every", "both", "few", "more", "most", "other", "some", "such", "no",
    "nor", "not", "only", "own", "same", "so", "than", "too", "very",
    "just", "because", "but", "and", "or", "if", "while", "this", "that",
    "these", "those", "it", "its", "i", "me", "my", "we", "our", "you",
    "your", "he", "him", "his", "she", "her", "they", "them", "their",
    "what", "which", "who", "whom",
  ]);

  for (const seg of segments) {
    const words = seg.toLowerCase().match(/[a-z]{3,}/g) ?? [];
    for (const w of words) {
      if (!stops.has(w)) freq.set(w, (freq.get(w) ?? 0) + 1);
    }
  }
  return freq;
}

// Score a segment: higher = more information-dense
function scoreSegment(
  seg: string,
  index: number,
  total: number,
  freq: Map<string, number>,
  maxFreq: number
): number {
  let score = 0;

  // Word frequency score — sum of normalized TF for each content word
  const words = seg.toLowerCase().match(/[a-z]{3,}/g) ?? [];
  if (words.length > 0) {
    const tfSum = words.reduce((sum, w) => sum + (freq.get(w) ?? 0), 0);
    score += (tfSum / words.length / maxFreq) * 10;
  }

  // Position bias — first and last 10% of segments carry framing context
  const relPos = index / Math.max(total - 1, 1);
  if (relPos < 0.1 || relPos > 0.9) score += 3;

  // Length sweet spot — very short segments are low-signal
  const wordCount = seg.split(/\s+/).length;
  if (wordCount >= 8 && wordCount <= 60) score += 2;
  if (wordCount < 4) score -= 2;

  // Code blocks are high-value — agents need them intact
  if (seg.startsWith("```")) score += 5;

  // Structural markers signal key information
  if (/^#{1,4}\s/.test(seg)) score += 3;
  if (/^[-*]\s/.test(seg)) score += 1;
  if (/\b(must|required|important|error|warning|note)\b/i.test(seg)) score += 2;
  if (/\b(returns?|outputs?|inputs?|params?|config)\b/i.test(seg)) score += 1;

  return score;
}

export function compress(text: string, targetTokens: number): CompressResult {
  const originalTokens = estimateTokens(text);

  // Already under budget — return as-is
  if (originalTokens <= targetTokens) {
    return {
      compressed: text,
      original_tokens: originalTokens,
      compressed_tokens: originalTokens,
      savings_pct: 0,
    };
  }

  const segments = splitSegments(text);
  const freq = buildFrequencyMap(segments);
  const maxFreq = Math.max(...freq.values(), 1);

  // Score and rank every segment
  const scored = segments
    .map((seg, i) => ({
      seg,
      index: i,
      score: scoreSegment(seg, i, segments.length, freq, maxFreq),
      tokens: estimateTokens(seg),
    }))
    .sort((a, b) => b.score - a.score);

  // Greedily select top-scoring segments until we fill the token budget
  const selected: { seg: string; index: number }[] = [];
  let tokenBudget = targetTokens;

  for (const item of scored) {
    if (tokenBudget <= 0) break;
    if (item.tokens <= tokenBudget) {
      selected.push({ seg: item.seg, index: item.index });
      tokenBudget -= item.tokens;
    }
  }

  // Restore original order so the output reads coherently
  selected.sort((a, b) => a.index - b.index);

  const compressed = selected.map((s) => s.seg).join("\n\n");
  const compressedTokens = estimateTokens(compressed);

  return {
    compressed,
    original_tokens: originalTokens,
    compressed_tokens: compressedTokens,
    savings_pct: Math.round(((originalTokens - compressedTokens) / originalTokens) * 100),
  };
}
