import { TrustVerificationInput, TrustVerificationResult } from "./types.js";

// Tokenize a string into normalized words
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

// Jaccard similarity between two sets
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

// High-risk action patterns
const HIGH_RISK_PATTERNS = [
  /\b(?:delete|drop|truncate|destroy|remove)\s+(?:all|database|table|records?|files?|data)\b/i,
  /\b(?:transfer|send|wire|move)\s+(?:funds?|money|tokens?|crypto|balance)\b/i,
  /\b(?:modify|change|update|grant|revoke)\s+(?:permissions?|access|roles?|privileges?)\b/i,
  /\b(?:escalate|elevate)\s+(?:privileges?|access|permissions?)\b/i,
  /\b(?:disable|turn\s+off|stop)\s+(?:logging|audit|monitoring|alerts?|security)\b/i,
  /\b(?:execute|run|eval)\s+(?:arbitrary|raw|unvalidated|unsanitized)\b/i,
  /\b(?:expose|leak|exfiltrate|dump)\s+(?:data|credentials?|secrets?|keys?|tokens?)\b/i,
  /\b(?:bypass|circumvent|skip|ignore)\s+(?:auth|authentication|authorization|validation|checks?)\b/i,
];

// Goal drift keywords — actions that suggest the agent has drifted from its goal
const DRIFT_KEYWORDS = new Set([
  "unrelated", "instead", "actually", "forget", "ignore", "override",
  "different", "changed", "new goal", "pivot", "switch",
]);

export function verifyAgentTrust(input: TrustVerificationInput): TrustVerificationResult {
  const violations: string[] = [];
  let trustScore = 1.0;

  // 1. Goal alignment — Jaccard similarity between action and goal
  const actionTokens = tokenize(input.proposedAction);
  const goalTokens = tokenize(input.originalGoal);
  const goalAlignmentScore = Math.round(jaccard(actionTokens, goalTokens) * 100) / 100;

  if (goalAlignmentScore < 0.1) {
    violations.push(`Proposed action has very low alignment with original goal (${goalAlignmentScore})`);
    trustScore -= 0.4;
  } else if (goalAlignmentScore < 0.25) {
    violations.push(`Proposed action has low alignment with original goal (${goalAlignmentScore})`);
    trustScore -= 0.2;
  }

  // 2. Check for drift keywords in the proposed action
  const actionLower = input.proposedAction.toLowerCase();
  for (const keyword of DRIFT_KEYWORDS) {
    if (actionLower.includes(keyword)) {
      violations.push(`Goal drift indicator detected: "${keyword}"`);
      trustScore -= 0.15;
      break;
    }
  }

  // 3. Spend limit enforcement
  if (input.spendLimit !== undefined && input.proposedSpend !== undefined) {
    if (input.proposedSpend > input.spendLimit) {
      violations.push(
        `Proposed spend ($${input.proposedSpend.toFixed(2)}) exceeds limit ($${input.spendLimit.toFixed(2)})`
      );
      trustScore -= 0.3;
    } else if (input.proposedSpend > input.spendLimit * 0.8) {
      violations.push(
        `Proposed spend ($${input.proposedSpend.toFixed(2)}) is near limit ($${input.spendLimit.toFixed(2)})`
      );
      trustScore -= 0.1;
    }
  }

  // 4. High-risk action patterns
  for (const pattern of HIGH_RISK_PATTERNS) {
    if (pattern.test(input.proposedAction)) {
      violations.push(`High-risk action detected: ${input.proposedAction.match(pattern)?.[0]}`);
      trustScore -= 0.3;
      break;
    }
  }

  // 5. Self-delegation check
  if (input.requestingAgentId === input.targetAgentId) {
    violations.push("Self-delegation detected — agent is requesting action on itself");
    trustScore -= 0.15;
  }

  // Clamp trust score
  trustScore = Math.round(Math.max(0, Math.min(1, trustScore)) * 100) / 100;

  // Determine recommendation
  let recommendation: "approve" | "deny" | "escalate";
  if (trustScore >= 0.7 && violations.length === 0) {
    recommendation = "approve";
  } else if (trustScore < 0.4) {
    recommendation = "deny";
  } else {
    recommendation = "escalate";
  }

  return {
    authorized: recommendation === "approve",
    trustScore,
    goalAlignmentScore,
    violations,
    recommendation,
  };
}
