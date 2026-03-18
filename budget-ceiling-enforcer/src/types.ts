export type BudgetPeriod = "daily" | "weekly" | "monthly";
export type EnforcementAction = "THROTTLE" | "PAUSE" | "ALERT" | "KILL";

export interface BudgetThreshold {
  percent: number;
  action: EnforcementAction;
}

export interface BudgetConfig {
  agentId: string;
  ceiling: number;
  period: BudgetPeriod;
  thresholds: BudgetThreshold[];
  webhookUrl?: string;
  dryRun?: boolean;
}

export interface SpendRecord {
  amount: number;
  action: string;
  timestamp: number;
}

export interface AgentBudgetState {
  config: BudgetConfig;
  spendHistory: SpendRecord[];
  totalSpend: number;
  periodStart: number;
  enforcementState: EnforcementAction | "NONE";
  throttleLevel: number;
}

export interface EnforceCheckInput {
  agentId: string;
  currentSpend?: number;
  action?: string;
}

export interface ConfigureInput {
  agentId: string;
  ceiling: number;
  period?: BudgetPeriod;
  thresholds?: BudgetThreshold[];
  webhookUrl?: string;
  dryRun?: boolean;
}

export interface EnforceCheckResult {
  agentId: string;
  currentSpend: number;
  ceiling: number;
  period: BudgetPeriod;
  percentUsed: number;
  projectedSpend: number;
  timeUntilExhaustion: string;
  enforcementAction: EnforcementAction | "NONE";
  enforced: boolean;
  dryRun: boolean;
  recommendation: string;
  throttleDelayMs: number;
  budgetStatus: "ok" | "warning" | "critical" | "exceeded";
}

export interface PaymentRequirement {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  asset: string;
  payTo: string;
  resource: string;
  description: string;
  mimeType: string;
  maxTimeoutSeconds: number;
  outputSchema: {
    input: Record<string, unknown>;
    output: Record<string, unknown>;
  };
}
