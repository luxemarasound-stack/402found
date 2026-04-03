# 402Found.dev — Project Status

**Last updated:** 2026-04-02

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
| Website (index.html, dashboard.html) | Cloud Run (four02found-site) | Live — SSL cert pending |
| DNS (*.402found.dev) | Cloudflare → ghs.googlehosted.com | Live |
| DNS (402found.dev) | Cloudflare CNAME → ghs.googlehosted.com | Live — proxy OFF until cert issued |
| Redirects (.com, .io → .dev) | nginx in Cloud Run container | Live |
| Old fly.io deployment | fly.io (402found-site) | Can be decommissioned once Cloud Run cert is live |

---

## Session Log — April 1-2, 2026 (continued)

### April 1 — Website Improvements (deployed to fly.io):
- [x] Inline SVG favicon, OG tags, JSON-LD, status dots, PII demo, code snippet, about section
- [x] robots.txt + sitemap.xml
- [x] Fixed all stale *.fly.dev URLs → *.402found.dev
- [x] All 18 agents in agent-card.json and llms.txt
- [x] Payment env vars deployed to all 18 agents via Cloud Shell
- [x] code-quality-scanner redeployed with payment gate middleware
- [x] Launch post drafts in LAUNCH-POSTS.md

### April 2 — CORS, Landing Pages, Cloud Run Migration:
- [x] CORS headers added to all 18 agents (deployed to Cloud Run)
- [x] HTML landing pages added to all 17 Express agents (deployed to Cloud Run)
- [x] code-quality-scanner CORS updated (deployed to Cloud Run)
- [x] Website migrated from fly.io to Cloud Run (four02found-site)
- [x] Domain mapping created: 402found.dev → four02found-site
- [x] Cloudflare DNS updated: CNAME → ghs.googlehosted.com
- [x] gcloud SDK installed locally (at $LOCALAPPDATA/Google/Cloud SDK/)
- [x] SSL cert provisioning — LIVE! (verified 2026-04-02)
- [ ] Turn Cloudflare proxy back ON (orange cloud) — cert is live, safe to do now
- [x] Fixed missing DNS for multi-agent-trust-verifier in Cloudflare
- [x] Recovered code-quality-scanner source from Cloud Run build archive (committed)

### April 2 — Stripe Prepaid Credits (in progress):
- [x] Design spec written: `docs/superpowers/specs/2026-04-02-stripe-prepaid-credits-design.md`
- [x] Implementation plan written: `docs/superpowers/plans/2026-04-02-stripe-prepaid-credits.md`
- [x] Firestore database created (Native mode, us-east1)
- [x] Shared `@402found/payment-gate` package built (`packages/payment-gate/`)
- [x] All 18 services migrated to shared payment-gate package
- [x] `credits-api` service built (Stripe Checkout + Firestore + frontend)
- [x] pii-scrubber deployed with dual payment (x402 + Stripe credits) — VERIFIED
- [ ] Deploy remaining 17 services (batch 1 of 4 in progress — data-sentinel, prompt-injection-detector, permission-guard, agent-audit-trail)
- [ ] Deploy credits-api to Cloud Run — BLOCKED: Stripe account setup not complete
- [ ] Configure Stripe webhook
- [ ] Test end-to-end Stripe credit purchase flow
- [ ] Update website with credits link
- [ ] Update STATUS.md final

---

## REMAINING STEPS (Marii)

### 0. Set up Stripe account (BLOCKING)
- [ ] Complete Stripe setup at stripe.com (tied to luxemarasound@gmail.com)
- [ ] Get API keys from Dashboard > Developers > API keys
- [ ] Need: `STRIPE_SECRET_KEY` (sk_test_... for testing, sk_live_... for production)
- [ ] Webhook secret will come after deployment (step below)

### 1. Turn on Cloudflare proxy (SSL cert is live!)
Go to Cloudflare DNS for 402found.dev and turn the proxy ON (orange cloud) for the root domain CNAME.

### 2. Test e2e payment flow
1. POST to any agent endpoint → should get HTTP 402 with price + wallet
2. Send USDC on Base to the wallet
3. Retry with tx hash in X-Payment-Tx header → should get result

### 3. Post launch content
Copy from LAUNCH-POSTS.md:
1. Twitter/X thread first
2. Hacker News Show HN (Tues-Thurs, 9am ET)
3. Reddit r/LocalLLaMA and r/cryptocurrency same day

### 4. Submit to Google Search Console
Verify 402found.dev so it gets indexed.

### 5. Decommission fly.io
Once Cloud Run is confirmed working, shut down the fly.io app to stop billing.

---

## Key Files

| File | Purpose |
|------|---------|
| PROJECT_RULES.md | Mandatory checklist for every new agent service |
| WEBSITE-IMPROVEMENTS.md | Detailed website improvement roadmap |
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
| packages/payment-gate/ | Shared payment middleware — x402 + Stripe credits |
| credits-api/ | Stripe prepaid credits service (Checkout, webhook, API keys) |
| docs/superpowers/specs/ | Design spec for Stripe credits |
| docs/superpowers/plans/ | Implementation plan for Stripe credits |

---

## Important Notes

- **Trust Verifier naming mismatch:** Website says "trust-verifier" but Cloud Run service is "multi-agent-trust-verifier"
- **HMAC secret** is stored only in deploy-env-vars.sh (gitignored). Do not commit this file.
- **Cold starts:** Agents take ~3s on first request (Cloud Run min-instances=0). Consider min-instances=1 for high-traffic agents later.
- **Revenue math:** At current prices ($0.001-$0.10/req), need thousands of requests for $200/month. Marketing + discoverability is the bottleneck, not tech.
- **gcloud local:** Installed at `$LOCALAPPDATA/Google/Cloud SDK/`. Use `export PATH="$LOCALAPPDATA/Google/Cloud SDK/google-cloud-sdk/bin:$PATH"` before gcloud commands.

---

## Blockers
- **Stripe account setup** — Marii needs to complete Stripe setup and provide API keys before credits-api can be deployed
- **17 service deploys remaining** — batch deploys in progress, will resume next session
