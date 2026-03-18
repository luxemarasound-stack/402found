import "dotenv/config";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import {
  registerAgent, getAgent, updateAgent, deactivateAgent, queryAgents,
  getDashboard, getDependencyGraph, getComplianceReport, recordHealthCheck, exportAgents,
} from "./db.js";
import { verifyPayment, getPaymentRequirement } from "./payment.js";
import { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { readFileSync } from "node:fs";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

const mcpServer = new McpServer({ name: "agent-registry", version: "1.0.0" });

// --- Tool: register_agent ---
mcpServer.tool(
  "register_agent",
  "Register a new AI agent in the central inventory with metadata, dependencies, permissions, and tags.",
  {
    name: z.string().describe("Agent name"),
    description: z.string().describe("What the agent does"),
    owner: z.string().describe("Owner or creator"),
    purpose: z.string().describe("Use case or purpose"),
    url: z.string().optional().describe("Agent endpoint URL"),
    healthEndpoint: z.string().optional().describe("Health check URL"),
    dependencies: z.array(z.string()).optional().describe("Agent IDs or names this depends on"),
    permissions: z.array(z.string()).optional().describe("Permission scopes"),
    tags: z.array(z.string()).optional().describe("Tags for categorization"),
    version: z.string().optional().describe("Version string"),
    gitCommit: z.string().optional().describe("Git commit hash"),
  },
  async (args) => ({
    content: [{ type: "text" as const, text: JSON.stringify(registerAgent(args)) }],
  })
);

// --- Tool: update_agent ---
mcpServer.tool(
  "update_agent",
  "Update metadata for an existing agent. Any field not provided is left unchanged.",
  {
    agentId: z.string().describe("Agent ID to update"),
    name: z.string().optional(),
    description: z.string().optional(),
    owner: z.string().optional(),
    purpose: z.string().optional(),
    status: z.enum(["active", "paused", "archived"]).optional(),
    url: z.string().optional(),
    healthEndpoint: z.string().optional(),
    dependencies: z.array(z.string()).optional(),
    permissions: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    version: z.string().optional(),
    gitCommit: z.string().optional(),
  },
  async (args) => {
    const result = updateAgent(args);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result ?? { error: "Agent not found" }) }],
    };
  }
);

// --- Tool: deactivate_agent ---
mcpServer.tool(
  "deactivate_agent",
  "Archive/deactivate an agent. Sets status to 'archived'.",
  { agentId: z.string().describe("Agent ID to deactivate") },
  async ({ agentId }) => {
    const result = deactivateAgent(agentId);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result ?? { error: "Agent not found" }) }],
    };
  }
);

// --- Tool: query_agents ---
mcpServer.tool(
  "query_agents",
  "Search and filter agents by owner, status, tag, or partial name. Supports pagination.",
  {
    agentId: z.string().optional().describe("Get a specific agent by ID"),
    owner: z.string().optional().describe("Filter by owner"),
    status: z.enum(["active", "paused", "archived"]).optional().describe("Filter by status"),
    tag: z.string().optional().describe("Filter by tag"),
    search: z.string().optional().describe("Partial name/description match"),
    page: z.number().optional().describe("Page number (default 1)"),
    pageSize: z.number().optional().describe("Results per page (default 20, max 100)"),
  },
  async (args) => {
    if (args.agentId) {
      const agent = getAgent(args.agentId);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(agent ?? { error: "Agent not found" }) }],
      };
    }
    return {
      content: [{ type: "text" as const, text: JSON.stringify(queryAgents(args)) }],
    };
  }
);

// --- Tool: dashboard ---
mcpServer.tool(
  "dashboard",
  "Get fleet-wide status: agent counts by status, health summary, stale agents, and recent registrations.",
  {},
  async () => ({
    content: [{ type: "text" as const, text: JSON.stringify(getDashboard()) }],
  })
);

// --- Tool: dependency_graph ---
mcpServer.tool(
  "dependency_graph",
  "Get the dependency graph of all active agents — who depends on whom.",
  {},
  async () => ({
    content: [{ type: "text" as const, text: JSON.stringify(getDependencyGraph()) }],
  })
);

// --- Tool: compliance_report ---
mcpServer.tool(
  "compliance_report",
  "Generate a compliance report: all agents with permissions, health status, and staleness.",
  {},
  async () => ({
    content: [{ type: "text" as const, text: JSON.stringify(getComplianceReport()) }],
  })
);

// --- Tool: report_health ---
mcpServer.tool(
  "report_health",
  "Record a health check result for an agent.",
  {
    agentId: z.string().describe("Agent ID"),
    status: z.enum(["healthy", "unhealthy"]).describe("Health check result"),
  },
  async ({ agentId, status }) => {
    recordHealthCheck(agentId, status);
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ agentId, healthStatus: status, recorded: true }) }],
    };
  }
);

// --- Tool: export_agents ---
mcpServer.tool(
  "export_agents",
  "Export the full agent registry in JSON or CSV format for compliance teams.",
  {
    format: z.enum(["json", "csv"]).optional().describe("Export format (default: json)"),
  },
  async ({ format }) => ({
    content: [{ type: "text" as const, text: exportAgents(format ?? "json") }],
  })
);

// --- Express app ---
const app = express();
app.use(express.json());

const wellKnownDir = path.resolve(__dirname, "..", ".well-known");
const agentCard = JSON.parse(readFileSync(path.join(wellKnownDir, "agent-card.json"), "utf-8"));
const serverCard = JSON.parse(readFileSync(path.join(wellKnownDir, "mcp", "server-card.json"), "utf-8"));
app.get("/.well-known/mcp", (_req, res) => res.json(serverCard));
app.get("/.well-known/mcp/server-card.json", (_req, res) => res.json(serverCard));
app.get("/.well-known/agent-card.json", (_req, res) => res.json(agentCard));
app.get("/.well-known/x402", (_req, res) => res.json({ version: 1, resources: ["POST /mcp"] }));

app.get("/openapi.json", (_req, res) => {
  res.json({
    openapi: "3.0.0",
    info: {
      title: "Agent Registry",
      version: "1.0.0",
      description: "Central inventory of all deployed AI agents. Register, query, monitor, and export agent metadata. Pay-per-request via x402 (USDC on Base).",
      guidance: "9 MCP tools: register_agent, update_agent, deactivate_agent, query_agents, dashboard, dependency_graph, compliance_report, report_health, export_agents. POST to /mcp with JSON-RPC body. Include X-Payment-Tx header.",
    },
    paths: {
      "/mcp": {
        post: {
          summary: "Agent Registry MCP endpoint",
          description: "Requires x402 payment (0.001 USDC on Base).",
          "x-payment-info": { protocols: ["x402"], pricingMode: "fixed", price: "0.001" },
          parameters: [{ name: "X-Payment-Tx", in: "header", required: true, schema: { type: "string" } }],
        },
      },
    },
  });
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

async function paymentGate(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> {
  const txHash = req.headers["x-payment-tx"] as string | undefined;
  if (!txHash) {
    res.status(402).json({ x402Version: 1, accepts: [getPaymentRequirement()], error: "Payment Required" });
    return;
  }
  const valid = await verifyPayment(txHash);
  if (!valid) {
    res.status(402).json({ x402Version: 1, accepts: [getPaymentRequirement()], error: "Payment verification failed" });
    return;
  }
  next();
}

app.post("/mcp", paymentGate, async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await mcpServer.connect(transport);
  await transport.handleRequest(req as unknown as IncomingMessage, res as unknown as ServerResponse, req.body);
});

app.get("/mcp", (_req, res) => res.status(405).json({ error: "Stateless server — use POST" }));
app.delete("/mcp", (_req, res) => res.status(405).json({ error: "Stateless server — no sessions to close" }));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Agent Registry MCP server running on port ${PORT}`);
  console.log(`Discovery: http://localhost:${PORT}/.well-known/agent-card.json`);
  console.log(`MCP:       http://localhost:${PORT}/mcp`);
});
