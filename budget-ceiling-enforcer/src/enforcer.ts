import {
  AgentBudgetState,
  BudgetConfig,
  BudgetPeriod,
  BudgetThreshold,
  ConfigureInput,
  EnforceCheckInput,
  EnforceCheckResult,
  EnforcementAction,
  SpendRecord,
} from "./types.js";

const DEFAULT_CEILING = parseFloat(process.env.DEFAULT_CEILING ?? "10.00");
const DEFAULT_PERIOD: BudgetPeriod = (process.env.DEFAULT_PERIOD as BudgetPeriod) ?? "daily";

const DEFAULT_THRESHOLDS: BudgetThreshold[] = [
  { percent: 50, action: "ALERT" },
  { percent: 80, action: "THROTTLE" },
  { percent: 95, action: "PAUSE" },
  { percent: 100, action: "KILL" },
];

const agentStates = new Map<string, AgentBudgetState>();

function getPeriodMs(period: BudgetPeriod): number {
  switch (period) {
    case "daily": return 24 * 60 * 60 * 1000;
    case "weekly": return 7 * 24 * 60 * 60 * 1000;
    case "monthly": return 30 * 24 * 60 * 60 * 1000;
  }
}

function getPeriodStart(period: BudgetPeriod): number {
  const now = new Date();
  switch (period) {
    case "daily":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    case "weekly": {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      return new Date(now.getFullYear(), now.getMonth(), diff).getTime();
    }
    case "monthly":
      return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  }
}

function getOrCreateState(agentId: string): AgentBudgetState {
  let state = agentStates.get(agentId);
  const period = state?.config.period ?? DEFAULT_PERIOD;
  const periodStart = getPeriodStart(period);

  if (state && state.periodStart === periodStart) {
    return state;
  }

  if (state && state.periodStart !== periodStart) {
    // Period rolled over — reset spend
    state.spendHistory = [];
    state.totalSpend = 0;
    state.periodStart = periodStart;
    state.enforcementState = "NONE";
    state.throttleLevel = 0;
    return state;
  }

  // New agent — create default config
  const newState: AgentBudgetState = {
    config: {
      agentId,
      ceiling: DEFAULT_CEILING,
      period: DEFAULT_PERIOD,
      thresholds: [...DEFAULT_THRESHOLDS],
    },
    spendHistory: [],
    totalSpend: 0,
    periodStart,
    enforcementState: "NONE",
    throttleLevel: 0,
  };
  agentStates.set(agentId, newState);
  return newState;
}

export function configureBudget(input: ConfigureInput): { configured: true; config: BudgetConfig } {
  const state = getOrCreateState(input.agentId);
  state.config.ceiling = input.ceiling;
  if (input.period) state.config.period = input.period;
  if (input.thresholds) state.config.thresholds = input.thresholds;
  if (input.webhookUrl !== undefined) state.config.webhookUrl = input.webhookUrl;
  if (input.dryRun !== undefined) state.config.dryRun = input.dryRun;

  // Reset period start for new config
  state.periodStart = getPeriodStart(state.config.period);

  return { configured: true, config: state.config };
}

export function checkBudget(input: EnforceCheckInput): EnforceCheckResult {
  const state = getOrCreateState(input.agentId);
  const { config } = state;
  const now = Date.now();

  // Add spend if provided
  if (input.currentSpend && input.currentSpend > 0) {
    const record: SpendRecord = {
      amount: input.currentSpend,
      action: input.action ?? "unspecified",
      timestamp: now,
    };
    state.spendHistory.push(record);
    state.totalSpend += input.currentSpend;
  }

  const percentUsed = config.ceiling > 0 ? (state.totalSpend / config.ceiling) * 100 : 0;

  // Determine enforcement action from thresholds (highest matching)
  let enforcementAction: EnforcementAction | "NONE" = "NONE";
  const sortedThresholds = [...config.thresholds].sort((a, b) => b.percent - a.percent);
  for (const threshold of sortedThresholds) {
    if (percentUsed >= threshold.percent) {
      enforcementAction = threshold.action;
      break;
    }
  }

  state.enforcementState = enforcementAction;

  // Calculate throttle delay (exponential backoff)
  let throttleDelayMs = 0;
  if (enforcementAction === "THROTTLE") {
    state.throttleLevel = Math.min(state.throttleLevel + 1, 8);
    throttleDelayMs = Math.min(1000 * Math.pow(2, state.throttleLevel - 1), 256_000);
  } else if (enforcementAction === "NONE" || enforcementAction === "ALERT") {
    state.throttleLevel = 0;
  }

  // Project spend based on current rate
  const periodMs = getPeriodMs(config.period);
  const elapsed = now - state.periodStart;
  const rate = elapsed > 0 ? state.totalSpend / elapsed : 0;
  const projectedSpend = rate * periodMs;

  // Time until exhaustion
  let timeUntilExhaustion = "N/A";
  if (rate > 0 && state.totalSpend < config.ceiling) {
    const remaining = config.ceiling - state.totalSpend;
    const msRemaining = remaining / rate;
    const hours = Math.floor(msRemaining / 3_600_000);
    const minutes = Math.floor((msRemaining % 3_600_000) / 60_000);
    timeUntilExhaustion = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  } else if (state.totalSpend >= config.ceiling) {
    timeUntilExhaustion = "EXHAUSTED";
  }

  // Budget status
  let budgetStatus: "ok" | "warning" | "critical" | "exceeded";
  if (percentUsed >= 100) budgetStatus = "exceeded";
  else if (percentUsed >= 80) budgetStatus = "critical";
  else if (percentUsed >= 50) budgetStatus = "warning";
  else budgetStatus = "ok";

  // Recommendation
  let recommendation: string;
  switch (enforcementAction) {
    case "KILL":
      recommendation = "Budget exceeded. Agent should be terminated immediately. Increase ceiling or wait for period reset.";
      break;
    case "PAUSE":
      recommendation = "Budget nearly exhausted. Agent operations paused. Resume after period reset or ceiling increase.";
      break;
    case "THROTTLE":
      recommendation = `Budget usage high. Requests throttled with ${throttleDelayMs}ms delay. Reduce operation frequency.`;
      break;
    case "ALERT":
      recommendation = "Budget usage at 50%+. Monitor spend closely. Consider reducing non-essential operations.";
      break;
    default:
      recommendation = "Budget within normal range. No action required.";
  }

  const isDryRun = config.dryRun ?? false;
  const enforced = !isDryRun && enforcementAction !== "NONE" && enforcementAction !== "ALERT";

  // Fire webhook asynchronously if configured and action triggered
  if (config.webhookUrl && enforcementAction !== "NONE") {
    fireWebhook(config.webhookUrl, {
      agentId: input.agentId,
      enforcementAction,
      percentUsed: Math.round(percentUsed * 100) / 100,
      currentSpend: state.totalSpend,
      ceiling: config.ceiling,
      dryRun: isDryRun,
      timestamp: new Date().toISOString(),
    }).catch(() => {});
  }

  return {
    agentId: input.agentId,
    currentSpend: Math.round(state.totalSpend * 1_000_000) / 1_000_000,
    ceiling: config.ceiling,
    period: config.period,
    percentUsed: Math.round(percentUsed * 100) / 100,
    projectedSpend: Math.round(projectedSpend * 100) / 100,
    timeUntilExhaustion,
    enforcementAction,
    enforced,
    dryRun: isDryRun,
    recommendation,
    throttleDelayMs,
    budgetStatus,
  };
}

async function fireWebhook(url: string, payload: Record<string, unknown>, attempt = 1): Promise<void> {
  const MAX_RETRIES = 3;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "budget-ceiling-enforcer", ...payload }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok && attempt < MAX_RETRIES) {
      const delay = 1000 * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
      return fireWebhook(url, payload, attempt + 1);
    }
  } catch {
    if (attempt < MAX_RETRIES) {
      const delay = 1000 * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
      return fireWebhook(url, payload, attempt + 1);
    }
  }
}
