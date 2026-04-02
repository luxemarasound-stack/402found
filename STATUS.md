# 402Found.dev — Project Status

**Last updated:** 2026-04-01

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
| Landing page (index.html) | fly.io (402found-site) | Live (needs migration to Cloud Run) |
| Dashboard (dashboard.html) | fly.io (402found-site) | Live (needs migration to Cloud Run) |
| DNS (*.402found.dev) | Cloudflare → ghs.googlehosted.com | Live |
| Redirects (.com, .io → .dev) | nginx on fly.io | Live |

---

## Session Log — April 1, 2026

### DEPLOYED to fly.io (live now at 402found.dev):
- [x] Inline SVG favicon
- [x] Open Graph + Twitter Card meta tags
- [x] JSON-LD structured data (Schema.org WebApplication)
- [x] Live green/red status dots on all 18 agent cards (pings /health)
- [x] Interactive "Try It" PII Scrubber demo
- [x] "Integrate in 30 Seconds" code snippet with copy button
- [x] About 402Found section
- [x] robots.txt + sitemap.xml (added to Dockerfile)
- [x] Fixed all stale *.fly.dev URLs → *.402found.dev in agent-card.json and llms.txt
- [x] Added all 12 missing agents to agent-card.json (was 6, now 18)
- [x] Complete llms.txt rewrite with all 18 agents

### PAYMENT ENV VARS DEPLOYED (April 1, 2026):
- [x] All 18/18 agents updated with correct per-service pricing + real HMAC secret
- [x] format-converter — completed after quota cooldown
- Script was run via Google Cloud Shell (gcloud not installed locally)
- code-quality-scanner: DEPLOYED with payment gate (April 1, 2026) — /health OK, /scan returns 402 correctly

### DRAFTED but NOT YET POSTED:
- [x] `LAUNCH-POSTS.md` — content for HN, Reddit (x2), Twitter/X thread

---

## NEXT STEPS (in priority order)

### Step 1: Enable Payments (Marii — run these commands)
```bash
# 1. Login to Google Cloud
gcloud auth login

# 2. Select the right project
gcloud config set project luxemara-tools

# 3. Navigate to the project
cd /c/Users/simpl/projects/402found

# 4. Run the deployment script
bash deploy-env-vars.sh
```
This sets payment config (wallet, prices, HMAC secret) on all 18 Cloud Run agents.

### Step 2: Test Payments (Marii)
After running the script, test one agent to confirm x402 flow works:
1. Send a POST request to any agent endpoint
2. Should get HTTP 402 back with price + wallet address
3. Send USDC on Base to the wallet
4. Retry with tx hash in X-Payment-Tx header — should get result

### Step 3: Post Launch Content (Marii)
Copy from LAUNCH-POSTS.md:
1. Twitter/X thread first
2. Hacker News Show HN next morning (Tues-Thurs, 9am ET best)
3. Reddit r/LocalLLaMA and r/cryptocurrency same day

### Step 4: Submit to Google Search Console (Marii)
Verify 402found.dev so it gets indexed

### Step 5: CORS Headers (Claude — next session)
Status dots will show "offline" until agents add CORS headers to /health.
Need to add `Access-Control-Allow-Origin: https://402found.dev` to each agent.

### Step 6: Agent Landing Pages (Claude — next session)
Each agent subdomain (e.g., pii-scrubber.402found.dev/) currently returns 404.
Add a root `/` HTML route with agent name, docs, and status.

### Step 7: Migrate Landing Page to Cloud Run (Claude — future)
Move from fly.io to Cloud Run for single-platform billing.

---

## Key Files

| File | Purpose |
|------|---------|
| PROJECT_RULES.md | Mandatory checklist for every new agent service |
| WEBSITE-IMPROVEMENTS.md | Detailed website improvement roadmap (7 items checked off today) |
| STATUS.md | This file — session log and next steps |
| index.html | Main landing page (18 agent cards, demo, snippets) |
| dashboard.html | Fleet health dashboard (real-time status) |
| deploy-env-vars.sh | Payment config script (GITIGNORED — contains HMAC secret) |
| LAUNCH-POSTS.md | Launch post drafts for 4 platforms (GITIGNORED) |
| .well-known/agent-card.json | A2A discovery — all 18 agents with correct URLs |
| llms.txt | LLM-readable site description — all 18 agents |
| robots.txt | Search engine crawling permissions |
| sitemap.xml | Search engine page index |
| nginx.conf | Redirect config for .com/.io → .dev |
| 402 Fleet.xlsx | Fleet tracking spreadsheet |

---

## Important Notes

- **Trust Verifier naming mismatch:** Website says "trust-verifier" but Cloud Run service is "multi-agent-trust-verifier"
- **HMAC secret** is stored only in deploy-env-vars.sh (gitignored). Do not commit this file.
- **Cold starts:** Agents take ~3s on first request (Cloud Run min-instances=0). Consider min-instances=1 for high-traffic agents later.
- **Revenue math:** At current prices ($0.001-$0.10/req), need thousands of requests for $200/month. Marketing + discoverability is the bottleneck, not tech.

---

## Blockers
- ~~code-quality-scanner~~ — RESOLVED: deployed with payment gate, 402 flow verified
- **CORS on /health** — status dots won't work from the browser until agents have CORS headers
- **Landing page on fly.io** — still needs migration to Cloud Run for single billing
