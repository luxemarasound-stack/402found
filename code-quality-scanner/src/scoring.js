/**
 * Scoring engine — converts issue list into 0-100 quality score
 * and a PASS/FAIL production readiness verdict.
 */

const SEVERITY_WEIGHTS = {
  CRITICAL: 20,
  HIGH: 10,
  MEDIUM: 4,
  LOW: 1,
};

export function computeScore(issues) {
  let penalty = 0;
  let hasCritical = false;

  for (const issue of issues) {
    penalty += SEVERITY_WEIGHTS[issue.severity] ?? 0;
    if (issue.severity === "CRITICAL") hasCritical = true;
  }

  // Score: start at 100, deduct penalties, floor at 0
  const score = Math.max(0, Math.min(100, 100 - penalty));

  // FAIL if score < 60 or any CRITICAL issue exists
  const productionReady = score >= 60 && !hasCritical ? "PASS" : "FAIL";

  return { score, productionReady };
}
