# 402Found.dev — Project Status

**Last updated:** 2026-03-20

---

## Overview

402Found.dev is an x402 micropayment agent marketplace — 18 specialized AI agent microservices, pay-as-you-go with USDC on Base. Revenue infrastructure for the LUXEMARA sovereignty mission.

**Wallet:** `0x856401af27a1D59a473a2A8BD92Af3ccAa830376`
**GitHub:** `luxemarasound-stack/402found` (private)
**Local:** `C:\Users\simpl\projects\402found`

---

## Fleet — 18 Agents (All Live on Cloud Run)

### Security & Data Protection
| Agent | Price | What It Does |
|-------|-------|--------------|
| PII Scrubber | $0.005/req | Strips SSN, email, keys, phone, addresses, credit cards, IPs |
| Data Sentinel | $0.003/req | Second-pass scan for JWTs, keys, connection strings |
| Prompt Injection Detector | $0.003/req | Detects injection attacks, jailbreaks, role-play manipulation |
| Permission Guard | $0.002/req | Checks privilege escalation and scope overrides |
| Agent Audit Trail | $0.001/log | HMAC-signed audit logs for compliance |

### Agent Management & Governance
| Agent | Price | What It Does |
|-------|-------|--------------|
| Trust Verifier | $0.004/req | Verifies agent goal alignment, spend limits, scope |
| Rate Limit Manager | $0.001/req | Sliding window + exponential backoff for external APIs |
| Loop-Gate | $0.005/reset | Detects and breaks recursive agent loops |
| Agent Cost Meter | $0.002/req | Tracks session spend against budget ceilings |
| Budget Ceiling Enforcer | $0.02/check | Prevents runaway costs — throttle/pause/alert/kill |
| Agent Registry | $0.001/query | Central inventory, health monitoring, compliance reports |

### Performance & Quality
| Agent | Price | What It Does |
|-------|-------|--------------|
| Code Quality Scanner | $0.05/scan | AST-powered analysis (Python, JS, LLM prompts) |
| Hallucination Detector | $0.003/req | Scores AI output for fabricated facts |
| Performance Baseline Tracker | $0.10/compare | Baseline snapshots, drift detection, trend analysis |

### Data & Integration Tools
| Agent | Price | What It Does |
|-------|-------|--------------|
| Token Squeezer | $0.001/req | Compresses text to Reasoning Maps (80%+ token savings) |
| Format Converter | $0.001/conv | JSON, CSV, XML, YAML, Markdown, HTML, TOML conversions |
| Card Registry | $0.001/mo | Hosts agent-card.json at permanent public URLs |
| The Prospector | $0.01/card | Generates valid A2A agent cards from structured sources |

---

## Infrastructure

| Component | Platform | Status |
|-----------|----------|--------|
| 18 agent services | Google Cloud Run (us-east1, luxemara-tools) | Live |
| Landing page (index.html) | fly.io (402found-site) | Live but needs migration |
| Dashboard (dashboard.html) | fly.io (402found-site) | Live but needs migration |
| DNS (*.402found.dev) | Cloudflare → ghs.googlehosted.com | Live |
| Redirects (.com, .io → .dev) | nginx on fly.io | Live |

---

## What's Been Done (Git History)

1. Initial fleet deployed (~15 agents)
2. Migrated all agents from fly.io → Google Cloud Run
3. Added Code Quality Scanner
4. Set up clean 402found.dev subdomains via Cloudflare
5. Added nginx redirects for .com and .io → .dev
6. Fixed redirect loop (made .dev the default server block)
7. Added Budget Ceiling Enforcer
8. Added Agent Registry
9. Added Performance Baseline Tracker
10. Fixed browser "dangerous site" warnings (replaced clickable links with copy-to-clipboard)
11. Created WEBSITE-IMPROVEMENTS.md roadmap

---

## What's Next

### PRIORITY 0 — Migrate Landing Page (DO THIS FIRST)
- [ ] Move index.html + dashboard.html from fly.io to Google Cloud Run
- [ ] Update Cloudflare DNS to point root domain to Cloud Run
- [ ] Decommission fly.io entirely (single platform = simpler billing)

### PRIORITY 1 — Trust Signals (High Impact, Low Effort)
- [ ] Add favicon (402 icon or logo)
- [ ] Add contact/support email in footer
- [ ] Add Terms of Service / Privacy Policy (minimal 1-pager)
- [ ] Add GitHub links (if repos go public)

### PRIORITY 2 — Social Proof & Status
- [ ] Live status indicators per agent (green/red dots from /health)
- [ ] Request counter per agent or total
- [ ] Uptime badge
- [ ] Response time display (~200ms)

### PRIORITY 3 — Content & Documentation
- [ ] About section (mission, LUXEMARA connection)
- [ ] API docs links per agent (auto-generate from OpenAPI)
- [ ] "Try It" interactive demo (PII Scrubber is most intuitive)
- [ ] Integration code snippet (3-line curl/fetch example)

### PRIORITY 4 — Design Polish
- [ ] Logo (replace text-only "402Found" with SVG mark)
- [ ] Make Dashboard link more prominent
- [ ] "Integrate" section between Fleet and How It Works
- [ ] Mobile nav improvements

### PRIORITY 5 — SEO & Discovery
- [ ] Open Graph meta tags
- [ ] Structured data (JSON-LD Schema.org)
- [ ] /robots.txt and /sitemap.xml
- [ ] Google Search Console submission

### PRIORITY 6 — Per-Agent Polish
- [ ] Add root `/` HTML route to each Cloud Run service (health status page)
- [ ] Google Safe Browsing appeal if flagged

---

## Key Files

| File | Purpose |
|------|---------|
| PROJECT_RULES.md | Mandatory checklist for every new agent service |
| WEBSITE-IMPROVEMENTS.md | Detailed website improvement roadmap |
| index.html | Main landing page (18 agent cards, how it works) |
| dashboard.html | Fleet health dashboard (real-time status) |
| 402 Fleet.xlsx | Fleet tracking spreadsheet |
| nginx.conf | Redirect config for .com/.io → .dev |

---

## Blockers
- **Landing page migration** — still on fly.io, needs to move to Cloud Run for single-platform simplicity
