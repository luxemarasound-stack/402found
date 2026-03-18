export type AgentStatus = "active" | "paused" | "archived";

export interface AgentRecord {
  id: string;
  name: string;
  description: string;
  owner: string;
  purpose: string;
  status: AgentStatus;
  url?: string;
  healthEndpoint?: string;
  dependencies: string[];
  permissions: string[];
  tags: string[];
  version?: string;
  gitCommit?: string;
  deployedAt: string;
  updatedAt: string;
  lastHealthCheck?: string;
  lastHealthStatus?: "healthy" | "unhealthy" | "unknown";
}

export interface RegisterInput {
  name: string;
  description: string;
  owner: string;
  purpose: string;
  url?: string;
  healthEndpoint?: string;
  dependencies?: string[];
  permissions?: string[];
  tags?: string[];
  version?: string;
  gitCommit?: string;
}

export interface UpdateInput {
  agentId: string;
  name?: string;
  description?: string;
  owner?: string;
  purpose?: string;
  status?: AgentStatus;
  url?: string;
  healthEndpoint?: string;
  dependencies?: string[];
  permissions?: string[];
  tags?: string[];
  version?: string;
  gitCommit?: string;
}

export interface QueryInput {
  agentId?: string;
  owner?: string;
  status?: AgentStatus;
  tag?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface QueryResult {
  agents: AgentRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface DashboardResult {
  totalAgents: number;
  active: number;
  paused: number;
  archived: number;
  healthySummary: { healthy: number; unhealthy: number; unknown: number };
  staleAgents: AgentRecord[];
  recentRegistrations: AgentRecord[];
}

export interface DependencyNode {
  agentId: string;
  name: string;
  dependsOn: string[];
  dependedOnBy: string[];
}

export interface ComplianceRecord {
  id: string;
  name: string;
  owner: string;
  status: AgentStatus;
  permissions: string[];
  lastHealthCheck?: string;
  lastHealthStatus?: string;
  deployedAt: string;
  daysSinceUpdate: number;
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
