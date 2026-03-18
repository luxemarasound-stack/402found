# 402Found — Micro-utilities for the Agent Economy

> Pay-per-use MCP servers for AI agents. No subscriptions. No API keys. Just x402 micropayments.

[![x402](https://img.shields.io/badge/payment-x402-blue)](https://x402.org)
[![MCP](https://img.shields.io/badge/protocol-MCP-green)](https://modelcontextprotocol.io)
[![A2A](https://img.shields.io/badge/protocol-A2A-purple)](https://a2aprotocol.ai)

---

## What is 402Found?

402Found is a fleet of 18 remote MCP servers built for the agent economy. Each server solves one specific problem agents face in production — from cost runaway to prompt injection to PII leaks — and charges a fraction of a cent per use via the [x402 payment protocol](https://x402.org).

No signup. No monthly bill. Agents call the tool, pay for what they use, and move on.

---

## Quick Start

Add any tool to your MCP client config:

```json
{
  "mcpServers": {
    "pii-scrubber": {
      "type": "streamable-http",
      "url": "https://pii-scrubber.402found.dev/mcp"
    }
  }
}
```

All servers use **streamable-http transport** and are live at `https://{tool-name}.402found.dev/mcp`.

Requests without a valid x402 payment header return **HTTP 402 Payment Required**.

---

## The Fleet (18 Tools)

### Security & Safety

| Tool | What it does | Price |
|------|-------------|-------|
| [pii-scrubber](./pii-scrubber) | Strips SSNs, emails, API keys, phone numbers, addresses, credit cards, and IPs from text. GDPR/HIPAA aligned. | $0.005/req |
| [data-sentinel](./data-sentinel) | Deep second-pass scan for sensitive data that slipped through PII scrubbing. Catches JWTs, keys, connection strings, and internal IPs. | $0.003/req |
| [prompt-injection-detector](./prompt-injection-detector) | Scans agent input for prompt injection attacks — instruction overrides, jailbreaks, role-play manipulation, system prompt leakage, and hidden instructions. | $0.003/req |
| [permission-guard](./permission-guard) | Checks if an agent's requested action exceeds its defined scope. Detects privilege escalation and flags dangerous operations. | $0.002/req |
| [hallucination-detector](./hallucination-detector) | Scores AI output for likely hallucinated facts. Detects fabricated precision, invented citations, temporal impossibilities, and overconfident absolutes. | $0.003/req |

### Cost & Budget Control

| Tool | What it does | Price |
|------|-------------|-------|
| [budget-ceiling-enforcer](./budget-ceiling-enforcer) | Prevents runaway cloud costs. Enforces hard budget limits with configurable actions: throttle, pause, alert, or kill. Spend projection and webhook alerts included. | $0.02/check |
| [agent-cost-meter](./agent-cost-meter) | Tracks cumulative agent session spend against budget ceilings. Calculates cost from token usage and API calls, returns budget status with recommendations. | $0.002/req |

### Agent Reliability

| Tool | What it does | Price |
|------|-------------|-------|
| [loop-gate](./loop-gate) | Detects and breaks recursive agent loops using Bloom-filter detection. Paid reset to resume a halted loop. | $0.005/reset |
| [rate-limit-manager](./rate-limit-manager) | Manages agent request rate limiting with sliding window and exponential backoff. Prevents rate limit errors when calling external APIs. | $0.001/req |
| [performance-baseline-tracker](./performance-baseline-tracker) | Captures and monitors AI agent output quality over time. Baseline snapshots, multi-metric drift detection, semantic similarity scoring, and trend analysis. | $0.10/compare |

### Code & Output Quality

| Tool | What it does | Price |
|------|-------------|-------|
| [code-quality-scanner](./code-quality-scanner) | Detects vibe-code anti-patterns in AI agent code before production deployment. AST-powered analysis for Python, JavaScript, and LLM prompts. | $0.05/scan |
| [token-squeezer](./token-squeezer) | Compresses text into LLM-optimized Reasoning Maps. Saves 80%+ on context window token costs. | $0.001/req |
| [format-converter](./format-converter) | Converts between JSON, CSV, XML, YAML, Markdown, HTML, and TOML. Handles nested JSON flattening. Zero external dependencies. | $0.001/conv |

### Agent Identity & Registry

| Tool | What it does | Price |
|------|-------------|-------|
| [agent-registry](./agent-registry) | Central inventory of all deployed AI agents. Register, query, monitor health, generate compliance reports, export CSV/JSON, and visualize dependency graphs. | $0.001/query |
| [card-registry](./card-registry) | Hosts agent-card.json files at permanent public URLs. Discoverable by any A2A-compatible agent. | $0.001/mo |
| [the-prospector](./the-prospector) | Generates valid A2A agent cards for any website from stable structured sources. Never scrapes. | $0.01/card |
| [multi-agent-trust-verifier](./multi-agent-trust-verifier) | Verifies trust between agents by checking goal alignment, spend limits, and action scope. Detects goal drift and hijack attempts. OWASP ASI01 coverage. | $0.004/req |
| [agent-audit-trail](./agent-audit-trail) | Creates tamper-evident, HMAC-signed audit log entries for agent actions. Returns signed receipts the caller stores for compliance. | $0.001/log |

---

## How Payments Work

402Found uses the [x402 micropayment protocol](https://x402.org). When an agent calls a tool:

1. Without a payment header — receives **HTTP 402 Payment Required** with payment details
2. Agent attaches a valid x402 payment header — request is processed
3. Cost is deducted at the per-request rate shown above

No wallets to set up manually — x402-compatible agent frameworks handle this automatically.

---

## Directories

Find 402Found tools on:

- [Smithery](https://smithery.ai/servers/found402) — all 18 tools registered under `found402`
- [MCP.so](https://mcp.so) — all 18 tools submitted
- [Cursor Directory](https://cursor.directory) — all 18 tools listed
- [Glama.ai](https://glama.ai) — registered

---

## Built For

- AI agent developers building with Claude, GPT-4, Gemini, or open models
- Teams running multi-agent pipelines in production
- Anyone who has watched an agent loop forever, leak PII, or run up a $200 cloud bill overnight

---

## License

MIT — use freely, build on top, contributions welcome.

---

*402Found is part of the [Luxemara](https://luxemara.com) ecosystem.*
