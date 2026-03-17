import { DetectionResult, HallucinationSignal } from "./types.js";

// Split text into sentences
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// --- Signal detectors ---
// Each returns signals found in a sentence

// 1. Fabricated precision — suspiciously specific numbers in vague contexts
const PRECISION_RE =
  /\b(?:exactly|precisely|approximately)\s+\d{2,}(?:\.\d+)?%?\b|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/gi;

function checkFabricatedPrecision(sentence: string): HallucinationSignal | null {
  const match = sentence.match(PRECISION_RE);
  if (match) {
    return {
      type: "fabricated_precision",
      text: match[0],
      reason: "Suspiciously precise numeric claim — verify against source data",
    };
  }
  return null;
}

// 2. Invented citations — fake-looking references
const CITATION_RE =
  /(?:(?:according to|cited in|published in|as (?:reported|noted|stated) (?:by|in))\s+)(?:(?:Dr\.|Prof\.|the)\s+)?[A-Z][a-z]+(?:\s+(?:et al\.?|&\s+[A-Z][a-z]+))?(?:,?\s*\(?\d{4}\)?)?/gi;

function checkInventedCitations(sentence: string): HallucinationSignal | null {
  const match = sentence.match(CITATION_RE);
  if (match) {
    return {
      type: "invented_citation",
      text: match[0],
      reason: "Unverifiable citation pattern — confirm source exists",
    };
  }
  return null;
}

// 3. Temporal impossibilities — future dates stated as fact, or anachronisms
const FUTURE_DATE_RE =
  /\bin\s+(20[3-9]\d|2[1-9]\d{2})\b/gi;

function checkTemporalIssues(sentence: string): HallucinationSignal | null {
  const match = sentence.match(FUTURE_DATE_RE);
  if (match) {
    const year = parseInt(match[0].replace(/\D/g, ""), 10);
    if (year > new Date().getFullYear()) {
      return {
        type: "temporal_impossibility",
        text: match[0],
        reason: "References a future date as established fact",
      };
    }
  }
  return null;
}

// 4. Hedged authority — confident framing around vague attribution
const HEDGE_RE =
  /\b(?:it is (?:widely |well )?(?:known|accepted|established|documented|recognized)|studies (?:have )?show(?:n|s)?|research (?:has )?(?:confirmed|proven|demonstrated|indicated)|experts (?:agree|believe|say)|many (?:scientists|researchers|experts|scholars) (?:believe|agree|argue))\b/gi;

function checkHedgedAuthority(sentence: string): HallucinationSignal | null {
  const match = sentence.match(HEDGE_RE);
  if (match) {
    return {
      type: "hedged_authority",
      text: match[0],
      reason: "Vague appeal to authority without specific source — likely filler",
    };
  }
  return null;
}

// 5. Entity confusion — plausible-sounding but potentially wrong proper nouns
const ENTITY_COMBO_RE =
  /\b(?:the\s+)?(?:University|Institute|Department|Ministry|Foundation|Association|Organization|Agency|Bureau|Commission|Council|Committee)\s+(?:of|for)\s+[A-Z][a-zA-Z\s]{2,30}\b/g;

function checkEntityConfusion(sentence: string): HallucinationSignal | null {
  const match = sentence.match(ENTITY_COMBO_RE);
  if (match) {
    return {
      type: "entity_confusion",
      text: match[0],
      reason: "Formal entity name that may be fabricated — verify it exists",
    };
  }
  return null;
}

// 6. Overconfident absolutes
const ABSOLUTE_RE =
  /\b(?:always|never|every single|without exception|in all cases|no one has ever|the only|100%)\b/gi;

function checkAbsolutes(sentence: string): HallucinationSignal | null {
  const match = sentence.match(ABSOLUTE_RE);
  if (match) {
    return {
      type: "overconfident_absolute",
      text: match[0],
      reason: "Absolute claim — real-world facts rarely have zero exceptions",
    };
  }
  return null;
}

const DETECTORS = [
  checkFabricatedPrecision,
  checkInventedCitations,
  checkTemporalIssues,
  checkHedgedAuthority,
  checkEntityConfusion,
  checkAbsolutes,
];

export function detectHallucinations(text: string): DetectionResult {
  const sentences = splitSentences(text);
  const signals: HallucinationSignal[] = [];
  const flaggedSentences = new Set<number>();

  for (let i = 0; i < sentences.length; i++) {
    for (const detect of DETECTORS) {
      const signal = detect(sentences[i]);
      if (signal) {
        signals.push(signal);
        flaggedSentences.add(i);
      }
    }
  }

  // Score: ratio of flagged sentences, weighted by signal severity
  const ratio = sentences.length > 0 ? flaggedSentences.size / sentences.length : 0;
  // Boost score if multiple signal types present
  const uniqueTypes = new Set(signals.map((s) => s.type)).size;
  const diversityBoost = Math.min(uniqueTypes * 0.05, 0.2);
  const raw = Math.min(ratio + diversityBoost, 1.0);
  const score = Math.round(raw * 100) / 100;

  let verdict: "low" | "medium" | "high";
  if (score < 0.2) verdict = "low";
  else if (score < 0.5) verdict = "medium";
  else verdict = "high";

  return {
    score,
    verdict,
    signals,
    sentence_count: sentences.length,
    flagged_count: flaggedSentences.size,
  };
}
