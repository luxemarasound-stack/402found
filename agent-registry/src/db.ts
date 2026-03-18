import Database from "better-sqlite3";
import { AgentRecord, AgentStatus } from "./types.js";
import { randomUUID } from "node:crypto";

const DB_PATH = process.env.DB_PATH ?? "./registry.db";

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    migrate(db);
  }
  return db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      owner TEXT NOT NULL,
      purpose TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      url TEXT,
      health_endpoint TEXT,
      dependencies TEXT NOT NULL DEFAULT '[]',
      permissions TEXT NOT NULL DEFAULT '[]',
      tags TEXT NOT NULL DEFAULT '[]',
      version TEXT,
      git_commit TEXT,
      deployed_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_health_check TEXT,
      last_health_status TEXT DEFAULT 'unknown'
    );

    CREATE INDEX IF NOT EXISTS idx_agents_owner ON agents(owner);
    CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
    CREATE INDEX IF NOT EXISTS idx_agents_name ON agents(name);
  `);
}

function rowToAgent(row: any): AgentRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    owner: row.owner,
    purpose: row.purpose,
    status: row.status as AgentStatus,
    url: row.url ?? undefined,
    healthEndpoint: row.health_endpoint ?? undefined,
    dependencies: JSON.parse(row.dependencies),
    permissions: JSON.parse(row.permissions),
    tags: JSON.parse(row.tags),
    version: row.version ?? undefined,
    gitCommit: row.git_commit ?? undefined,
    deployedAt: row.deployed_at,
    updatedAt: row.updated_at,
    lastHealthCheck: row.last_health_check ?? undefined,
    lastHealthStatus: row.last_health_status ?? undefined,
  };
}

export function registerAgent(input: {
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
}): AgentRecord {
  const d = getDb();
  const id = `agent_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const now = new Date().toISOString();

  d.prepare(`
    INSERT INTO agents (id, name, description, owner, purpose, status, url, health_endpoint,
      dependencies, permissions, tags, version, git_commit, deployed_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.name,
    input.description,
    input.owner,
    input.purpose,
    input.url ?? null,
    input.healthEndpoint ?? null,
    JSON.stringify(input.dependencies ?? []),
    JSON.stringify(input.permissions ?? []),
    JSON.stringify(input.tags ?? []),
    input.version ?? null,
    input.gitCommit ?? null,
    now,
    now
  );

  return getAgent(id)!;
}

export function getAgent(id: string): AgentRecord | null {
  const row = getDb().prepare("SELECT * FROM agents WHERE id = ?").get(id);
  return row ? rowToAgent(row) : null;
}

export function updateAgent(input: {
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
}): AgentRecord | null {
  const existing = getAgent(input.agentId);
  if (!existing) return null;

  const d = getDb();
  const now = new Date().toISOString();

  d.prepare(`
    UPDATE agents SET
      name = ?, description = ?, owner = ?, purpose = ?, status = ?,
      url = ?, health_endpoint = ?, dependencies = ?, permissions = ?,
      tags = ?, version = ?, git_commit = ?, updated_at = ?
    WHERE id = ?
  `).run(
    input.name ?? existing.name,
    input.description ?? existing.description,
    input.owner ?? existing.owner,
    input.purpose ?? existing.purpose,
    input.status ?? existing.status,
    input.url ?? existing.url ?? null,
    input.healthEndpoint ?? existing.healthEndpoint ?? null,
    JSON.stringify(input.dependencies ?? existing.dependencies),
    JSON.stringify(input.permissions ?? existing.permissions),
    JSON.stringify(input.tags ?? existing.tags),
    input.version ?? existing.version ?? null,
    input.gitCommit ?? existing.gitCommit ?? null,
    now,
    input.agentId
  );

  return getAgent(input.agentId);
}

export function deactivateAgent(id: string): AgentRecord | null {
  const d = getDb();
  const now = new Date().toISOString();
  d.prepare("UPDATE agents SET status = 'archived', updated_at = ? WHERE id = ?").run(now, id);
  return getAgent(id);
}

export function queryAgents(input: {
  owner?: string;
  status?: AgentStatus;
  tag?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): { agents: AgentRecord[]; total: number; page: number; pageSize: number; totalPages: number } {
  const d = getDb();
  const conditions: string[] = [];
  const params: any[] = [];

  if (input.owner) { conditions.push("owner = ?"); params.push(input.owner); }
  if (input.status) { conditions.push("status = ?"); params.push(input.status); }
  if (input.tag) { conditions.push("tags LIKE ?"); params.push(`%"${input.tag}"%`); }
  if (input.search) { conditions.push("(name LIKE ? OR description LIKE ? OR purpose LIKE ?)"); params.push(`%${input.search}%`, `%${input.search}%`, `%${input.search}%`); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  const countRow = d.prepare(`SELECT COUNT(*) as cnt FROM agents ${where}`).get(...params) as any;
  const total = countRow.cnt;

  const rows = d.prepare(`SELECT * FROM agents ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset);

  return {
    agents: rows.map(rowToAgent),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export function getDashboard(): {
  totalAgents: number;
  active: number;
  paused: number;
  archived: number;
  healthySummary: { healthy: number; unhealthy: number; unknown: number };
  staleAgents: AgentRecord[];
  recentRegistrations: AgentRecord[];
} {
  const d = getDb();

  const counts = d.prepare(`
    SELECT status, COUNT(*) as cnt FROM agents GROUP BY status
  `).all() as any[];

  let active = 0, paused = 0, archived = 0;
  for (const c of counts) {
    if (c.status === "active") active = c.cnt;
    else if (c.status === "paused") paused = c.cnt;
    else if (c.status === "archived") archived = c.cnt;
  }

  const healthCounts = d.prepare(`
    SELECT last_health_status, COUNT(*) as cnt FROM agents WHERE status = 'active' GROUP BY last_health_status
  `).all() as any[];

  let healthy = 0, unhealthy = 0, unknown = 0;
  for (const h of healthCounts) {
    if (h.last_health_status === "healthy") healthy = h.cnt;
    else if (h.last_health_status === "unhealthy") unhealthy = h.cnt;
    else unknown = h.cnt;
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const staleRows = d.prepare(
    "SELECT * FROM agents WHERE status = 'active' AND updated_at < ? ORDER BY updated_at ASC LIMIT 10"
  ).all(sevenDaysAgo);

  const recentRows = d.prepare(
    "SELECT * FROM agents ORDER BY deployed_at DESC LIMIT 5"
  ).all();

  return {
    totalAgents: active + paused + archived,
    active,
    paused,
    archived,
    healthySummary: { healthy, unhealthy, unknown },
    staleAgents: staleRows.map(rowToAgent),
    recentRegistrations: recentRows.map(rowToAgent),
  };
}

export function getDependencyGraph(): { agentId: string; name: string; dependsOn: string[]; dependedOnBy: string[] }[] {
  const d = getDb();
  const rows = d.prepare("SELECT id, name, dependencies FROM agents WHERE status != 'archived'").all() as any[];

  const agents = rows.map((r) => ({
    agentId: r.id,
    name: r.name,
    dependsOn: JSON.parse(r.dependencies) as string[],
    dependedOnBy: [] as string[],
  }));

  // Build reverse dependency map
  for (const agent of agents) {
    for (const dep of agent.dependsOn) {
      const target = agents.find((a) => a.agentId === dep || a.name === dep);
      if (target) target.dependedOnBy.push(agent.agentId);
    }
  }

  return agents;
}

export function getComplianceReport(): {
  id: string;
  name: string;
  owner: string;
  status: AgentStatus;
  permissions: string[];
  lastHealthCheck?: string;
  lastHealthStatus?: string;
  deployedAt: string;
  daysSinceUpdate: number;
}[] {
  const d = getDb();
  const rows = d.prepare("SELECT * FROM agents ORDER BY owner, name").all();
  const now = Date.now();

  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    owner: r.owner,
    status: r.status,
    permissions: JSON.parse(r.permissions),
    lastHealthCheck: r.last_health_check ?? undefined,
    lastHealthStatus: r.last_health_status ?? undefined,
    deployedAt: r.deployed_at,
    daysSinceUpdate: Math.floor((now - new Date(r.updated_at).getTime()) / (24 * 60 * 60 * 1000)),
  }));
}

export function recordHealthCheck(agentId: string, status: "healthy" | "unhealthy"): void {
  const d = getDb();
  const now = new Date().toISOString();
  d.prepare("UPDATE agents SET last_health_check = ?, last_health_status = ?, updated_at = ? WHERE id = ?")
    .run(now, status, now, agentId);
}

export function exportAgents(format: "json" | "csv"): string {
  const d = getDb();
  const rows = d.prepare("SELECT * FROM agents ORDER BY owner, name").all();
  const agents = rows.map(rowToAgent);

  if (format === "json") return JSON.stringify(agents, null, 2);

  // CSV
  const headers = ["id", "name", "owner", "status", "purpose", "url", "version", "deployedAt", "updatedAt", "tags", "permissions", "dependencies"];
  const lines = [headers.join(",")];
  for (const a of agents) {
    lines.push([
      a.id, `"${a.name}"`, `"${a.owner}"`, a.status, `"${a.purpose}"`,
      a.url ?? "", a.version ?? "", a.deployedAt, a.updatedAt,
      `"${a.tags.join(";")}"`, `"${a.permissions.join(";")}"`, `"${a.dependencies.join(";")}"`,
    ].join(","));
  }
  return lines.join("\n");
}
