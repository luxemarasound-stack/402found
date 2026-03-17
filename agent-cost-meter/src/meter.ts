import { CostCheckInput, CostCheckResult } from "./types.js";

const COST_PER_TOKEN = 0.00001;
const COST_PER_CALL = 0.005;

const sessionCosts = new Map<string, { tokens: number; calls: number; totalCost: number }>();

export function checkAgentCost(input: CostCheckInput): CostCheckResult {
  const budget = parseFloat(process.env.DEFAULT_BUDGET ?? "1.00");
  const tokens = input.tokenCount ?? 0;
  const calls = input.apiCalls ?? 0;
  const incrementalCost = tokens * COST_PER_TOKEN + calls * COST_PER_CALL;

  const existing = sessionCosts.get(input.agentId) ?? { tokens: 0, calls: 0, totalCost: 0 };
  existing.tokens += tokens;
  existing.calls += calls;
  existing.totalCost += incrementalCost;
  sessionCosts.set(input.agentId, existing);

  const ratio = existing.totalCost / budget;
  let budgetStatus: "ok" | "warning" | "exceeded";
  let recommendation: string;

  if (ratio > 1.0) {
    budgetStatus = "exceeded";
    recommendation = `Agent ${input.agentId} has exceeded its $${budget.toFixed(2)} budget by $${(existing.totalCost - budget).toFixed(4)}. Halt non-critical operations immediately.`;
  } else if (ratio >= 0.7) {
    budgetStatus = "warning";
    recommendation = `Agent ${input.agentId} has used ${(ratio * 100).toFixed(1)}% of its $${budget.toFixed(2)} budget. Consider throttling API calls and reducing token usage.`;
  } else {
    budgetStatus = "ok";
    recommendation = `Agent ${input.agentId} is within budget at ${(ratio * 100).toFixed(1)}% utilization. No action needed.`;
  }

  return {
    agentId: input.agentId,
    sessionCost: Math.round(existing.totalCost * 10000) / 10000,
    budgetStatus,
    breakdown: { tokens: existing.tokens, calls: existing.calls },
    recommendation,
  };
}
