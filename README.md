# 402Found — Micro-utilities for the Agent Economy

> Pay-per-use MCP servers for AI agents. No subscriptions. No API keys. Just x402 micropayments.

[![x402](https://img.shields.io/badge/payment-x402-blue)](https://x402.org)
[![MCP](https://img.shields.io/badge/protocol-MCP-green)](https://modelcontextprotocol.io)
[![A2A](https://img.shields.io/badge/protocol-A2A-purple)](https://a2aprotocol.ai)
[![18 Tools](https://img.shields.io/badge/tools-18-orange)](https://github.com/luxemarasound-stack/402found)
[![MIT License](https://img.shields.io/badge/license-MIT-brightgreen)](LICENSE)

---

## Table of Contents

- [What is 402Found?](#what-is-402found)
- [Quick Start](#quick-start)
- [The Fleet (18 Tools)](#the-fleet-18-tools)
  - [Security & Safety](#security--safety)
  - [Cost & Budget Control](#cost--budget-control)
  - [Agent Reliability](#agent-reliability)
  - [Code & Output Quality](#code--output-quality)
  - [Agent Identity & Registry](#agent-identity--registry)
- [How Payments Work](#how-payments-work)
- [Live Endpoints](#live-endpoints)
- [Directories](#directories)
- [Built For](#built-for)
- [Contributing](#contributing)
- [License](#license)

---

## What is 402Found?

402Found is a fleet of 18 remote MCP servers built for the agent economy. Each server solves one specific problem agents face in production — from cost runaway to prompt injection to PII leaks — and charges a fraction of a cent per use via the [x402 payment protocol](https://x402.org).

**No signup. No monthly bill.** Agents call the tool, pay for what they use, and move on.

Key properties:
- **Streamable-HTTP transport** — works with any MCP-compatible client
- **x402 micropayments** — sub-cent pricing, pay only for what you use
- **A2A compatible** — agent cards hosted at `card-registry.402found.dev`
- **Stateless** — no session state, no API keys to rotate
- **Production-ready** — deployed, monitored, and live at `https://{tool}.402found.dev/mcp`

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

Add multiple tools at once:

```json
{
  "mcpServers": {
    "pii-scrubber": {
      "type": "streamable-http",
      "url": "https://pii-scrubber.402found.dev/mcp"
    },
    "budget-ceiling-enforcer": {
      "type": "streamable-http",
      "url": "https://budget-ceiling-enforcer.402found.dev/mcp"
    },
    "prompt-injection-detector": {
      "type": "streamable-http",
      "url": "https://prompt-injection-detector.402found.dev/mcp"
    },
    "loop-gate": {
      "type": "streamable-http",
      "url": "https://loop-gate.402found.dev/mcp"
    }
  }
}
```

> All servers use **streamable-http** transport and are live at `https://{tool-name}.402found.dev/mcp`.
> Requests without a valid x402 payment header return **HTTP 402 Payment Required**.

---

## The Fleet (18 Tools)

### Security & Safety

| Tool | What it does | Price | Endpoint |
|------|-------------|-------|----------|
| [pii-scrubber](https://smithery.ai/server/found402/pii-scrubber) | Strips SSNs, emails, API keys, phone numbers, addresses, credit cards, and IPs from text. GDPR/HIPAA aligned. | `$0.005/req` | [live](https://pii-scrubber.402found.dev/mcp) |
| [data-sentinel](https://smithery.ai/server/found402/data-sentinel) | Deep second-pass scan for sensitive data that slipped through PII scrubbing. Catches JWTs, keys, connection strings, and internal IPs. | `$0.003/req` | [live](https://data-sentinel.402found.dev/mcp) |
| [prompt-injection-detector](https://smithery.ai/server/found402/prompt-injection-detector) | Scans agent input for prompt injection attacks — instruction overrides, jailbreaks, role-play manipulation, system prompt leakage, and hidden instructions. | `$0.003/req` | [live](https://prompt-injection-detector.402found.dev/mcp) |
| [permission-guard](https://smithery.ai/server/found402/permission-guard) | Checks if an agent's requested action exceeds its defined scope. Detects privilege escalation and flags dangerous operations. | `$0.002/req` | [live](https://permission-guard.402found.dev/mcp) |
| [hallucination-detector](https://smithery.ai/server/found402/hallucination-detector) | Scores AI output for likely hallucinated facts. Detects fabricated precision, invented citations, temporal impossibilities, and overconfident absolutes. | `$0.003/req` | [live](https://hallucination-detector.402found.dev/mcp) |

### Cost & Budget Control

| Tool | What it does | Price | Endpoint |
|------|-------------|-------|----------|
| [budget-ceiling-enforcer](https://smithery.ai/server/found402/budget-ceiling-enforcer) | Prevents runaway cloud costs. Enforces hard budget limits with configurable actions: throttle, pause, alert, or kill. Spend projection and webhook alerts included. | `$0.02/check` | [live](https://budget-ceiling-enforcer.402found.dev/mcp) |
| [agent-cost-meter](https://smithery.ai/server/found402/agent-cost-meter) | Tracks cumulative agent session spend against budget ceilings. Calculates cost from token usage and API calls, returns budget status with recommendations. | `$0.002/req` | [live](https://agent-cost-meter.402found.dev/mcp) |

### Agent Reliability

| Tool | What it does | Price | Endpoint |
|------|-------------|-------|----------|
| [loop-gate](https://smithery.ai/server/found402/loop-gate) | Detects and breaks recursive agent loops using Bloom-filter detection. Paid reset to resume a halted loop. | `$0.005/reset` | [live](https://loop-gate.402found.dev/mcp) |
| [rate-limit-manager](https://smithery.ai/server/found402/rate-limit-manager) | Manages agent request rate limiting with sliding window and exponential backoff. Prevents rate limit errors when calling external APIs. | `$0.001/req` | [live](https://rate-limit-manager.402found.dev/mcp) |
| [performance-baseline-tracker](https://smithery.ai/server/found402/performance-baseline-tracker) | Captures and monitors AI agent output quality over time. Baseline snapshots, multi-metric drift detection, semantic similarity scoring, and trend analysis. | `$0.10/compare` | [live](https://performance-baseline-tracker.402found.dev/mcp) |

### Code & Output Quality

| Tool | What it does | Price | Endpoint |
|------|-------------|-------|----------|
| [code-quality-scanner](https://smithery.ai/server/found402/code-quality-scanner) | Detects vibe-code anti-patterns in AI agent code before production deployment. AST-powered analysis for Python, JavaScript, and LLM prompts. | `$0.05/scan` | [live](https://code-quality-scanner.402found.dev/mcp) |
| [token-squeezer](https://smithery.ai/server/found402/token-squeezer) | Compresses text into LLM-optimized Reasoning Maps. Saves 80%+ on context window token costs. | `$0.001/req` | [live](https://token-squeezer.402found.dev/mcp) |
| [format-converter](https://smithery.ai/server/found402/format-converter) | Converts between JSON, CSV, XML, YAML, Markdown, HTML, and TOML. Handles nested JSON flattening. Zero external dependencies. | `$0.001/conv` | [live](https://format-converter.402found.dev/mcp) |

### Agent Identity & Registry

| Tool | What it does | Price | Endpoint |
|------|-------------|-------|----------|
| [agent-registry](https://smithery.ai/server/found402/agent-registry) | Central inventory of all deployed AI agents. Register, query, monitor health, generate compliance reports, export CSV/JSON, and visualize dependency graphs. | `$0.001/query` | [live](https://agent-registry.402found.dev/mcp) |
| [card-registry](https://smithery.ai/server/found402/card-registry) | Hosts agent-card.json files at permanent public URLs. Discoverable by any A2A-compatible agent. | `$0.001/mo` | [live](https://card-registry.402found.dev/mcp) |
| [the-prospector](https://smithery.ai/server/found402/the-prospector) | Generates valid A2A agent cards for any website from stable structured sources. Never scrapes. | `$0.01/card` | [live](https://the-prospector.402found.dev/mcp) |
| [multi-agent-trust-verifier](https://smithery.ai/server/found402/multi-agent-trust-verifier) | Verifies trust between agents by checking goal alignment, spend limits, and action scope. Detects goal drift and hijack attempts. OWASP ASI01 coverage. | `$0.004/req` | [live](https://multi-agent-trust-verifier.402found.dev/mcp) |
| [agent-audit-trail](https://smithery.ai/server/found402/agent-audit-trail) | Creates tamper-evident, HMAC-signed audit log entries for agent actions. Returns signed receipts the caller stores for compliance. | `$0.001/log` | [live](https://agent-audit-trail.402found.dev/mcp) |

---

## How Payments Work

402Found uses the [x402 micropayment protocol](https://x402.org). When an agent calls a tool:

1. **Without a payment header** — receives `HTTP 402 Payment Required` with payment details
2. **Agent attaches a valid x402 payment header** — request is processed
3. **Cost is deducted** at the per-request rate shown above

No wallets to set up manually — x402-compatible agent frameworks handle this automatically.

**Resources:**
- [x402 Protocol Docs](https://x402.org)
- [Coinbase x402 SDK](https://github.com/coinbase/x402)

---

## Live Endpoints

All 18 tools are live. The base URL pattern is:

```
https://{tool-name}.402found.dev/mcp
```

| Tool | Endpoint |
|------|----------|
| pii-scrubber | https://pii-scrubber.402found.dev/mcp |
| data-sentinel | https://data-sentinel.402found.dev/mcp |
| prompt-injection-detector | https://prompt-injection-detector.402found.dev/mcp |
| permission-guard | https://permission-guard.402found.dev/mcp |
| hallucination-detector | https://hallucination-detector.402found.dev/mcp |
| budget-ceiling-enforcer | https://budget-ceiling-enforcer.402found.dev/mcp |
| agent-cost-meter | https://agent-cost-meter.402found.dev/mcp |
| loop-gate | https://loop-gate.402found.dev/mcp |
| rate-limit-manager | https://rate-limit-manager.402found.dev/mcp |
| performance-baseline-tracker | https://performance-baseline-tracker.402found.dev/mcp |
| code-quality-scanner | https://code-quality-scanner.402found.dev/mcp |
| token-squeezer | https://token-squeezer.402found.dev/mcp |
| format-converter | https://format-converter.402found.dev/mcp |
| agent-registry | https://agent-registry.402found.dev/mcp |
| card-registry | https://card-registry.402found.dev/mcp |
| the-prospector | https://the-prospector.402found.dev/mcp |
| multi-agent-trust-verifier | https://multi-agent-trust-verifier.402found.dev/mcp |
| agent-audit-trail | https://agent-audit-trail.402found.dev/mcp |

---

## Directories

Find 402Found tools on every major MCP registry:

| Directory | Link |
|-----------|------|
| [Smithery.ai](https://smithery.ai) | [All 18 tools under found402](https://smithery.ai/servers?q=found402) |
| [MCP.so](https://mcp.so) | [All 18 tools listed](https://mcp.so/servers?search=402found) |
| [Cursor Directory](https://cursor.directory) | [All 18 tools listed](https://cursor.directory/mcp) |
| [Glama.ai](https://glama.ai) | [Registered](https://glama.ai/mcp/servers) |

---

## Built For

- AI agent developers building with Claude, GPT-4, Gemini, or open models
- Teams running multi-agent pipelines in production
- Anyone who has watched an agent loop forever, leak PII, or run up a $200 cloud bill overnight
- Developers exploring the [A2A protocol](https://a2aprotocol.ai) and agent interoperability

---

## Contributing

Contributions, issues, and feature requests are welcome. If you have an idea for a new micro-utility that fits the pay-per-use model:

1. Open an issue describing the tool and its use case
2. Follow the existing folder structure (one folder per tool, matching the slug)
3. Include a README.md in the tool folder with pricing and endpoint info
4. Submit a pull request

---

## License

MIT — use freely, build on top, contributions welcome.

402Found is part of the [Luxemara](https://luxemara.com) ecosystem.
