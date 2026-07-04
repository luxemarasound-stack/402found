# 402Found.dev — Project Status

**Last updated:** 2026-07-03

---

## Session Log — July 3, 2026 (Security audit + payment bug fix)

- **Dependency security:** GitHub Dependabot flagged 494 open alerts (2 critical, 84 high) — collapsed to ~12 shared vulnerable transitive packages across all 18 service dirs. Fixed via `npm audit fix`, pushed (`21d3dab`). 17/19 dirs clean; `credits-api` + `packages/payment-gate` down to 1 moderate each (needs a `@google-cloud/firestore` 7→8 major bump — not urgent, do it carefully since it's the payment code).
- **Secrets/PII:** full sweep (current files + entire git history) came back clean. Safe to make the repo public whenever — bonus: public repos get free GitHub secret/code scanning, which isn't available on the Free plan for private repos.
- **Found + fixed a real bug:** the Apr 7 commit `f6167f2` (labeled "add trust bar and social proof header") actually **deleted all 517 lines of `index.html`** — the real site only existed locally and was deployed straight to Cloudflare Pages via `wrangler`, bypassing git entirely. Restored it (`ac8e0e2`).
- **Payment bug (why Stripe wasn't collecting):** the "AI Trust Check"/"AI Guardian" Stripe Payment Links were swapped and stale-priced vs. the site copy (Trust Check advertised $2.99 one-time, actually charged $9.99/month; Guardian advertised $9/month, actually charged $3.33 one-time). Decision: scrap that consumer Stripe section entirely — this was always meant to be agent-to-agent x402 micropayments, not a card-based human subscription. Removed from `index.html` + its CSS, pushed.
- **Weekly automated security-check routine** created (runs Mondays 9am Central, scans all repos under the GitHub account, only reports what changed): https://claude.ai/code/routines/trig_01GkCrFyasaitG2VvPFZsYkg
- **Deploy blocker found:** double-clicking `deploy.bat` looked like it ran but didn't actually push anything — wrangler's Cloudflare login token expired **2026-05-23** (over a month stale), so it's been silently failing auth (`Failed to fetch auth token: 400`) instead of deploying. Confirmed live site still serves old Stripe content even with cache bypassed.
- **Monetization thread started:** Marii asked "how do we make money on this" — installed the official Cloudflare Claude Code plugin (`cloudflare@cloudflare` marketplace) to audit real traffic/usage on 402found.dev, since the core open question is whether any agents are actually discovering/calling these services, not whether the payment mechanism works. Cloudflare OAuth login (`mcp.cloudflare.com`) is currently failing — confirmed there's an **active Cloudflare incident** as of 2026-07-03 ("Network Performance in North America," Pages listed degraded) that's the likely cause. Retry the auth flow once the incident clears; this may also explain any future flaky `deploy.bat` runs beyond the expired-login issue below.
- **Discovery diagnosis (the real "how do we make money" answer so far):** searched Smithery + the major x402 directories — **402Found is not listed on x402-list.com (86 services) or Agentic.Market/Coinbase (1,511 services)**, the two biggest agent-discovery surfaces in the x402 ecosystem. Registration "on the MCP sites" back in April (Smithery, per Marii's memory) doesn't cover x402-specific discovery at all — different ecosystem/registry. This is likely the actual reason for zero/unknown traffic: the services work, they're just invisible to agents searching where agents actually search.
  - Checked why Agentic.Market's *automatic* Bazaar indexing won't pick us up: `packages/payment-gate` verifies `X-Payment-Tx` transactions directly/custom, not routed through Coinbase's CDP facilitator + Bazaar extension. Getting auto-listed there means a real integration project (reroute payment verification through their facilitator) — not urgent, bigger lift.
  - **Cheap immediate win identified:** x402-list.com takes a simple form/API submission (service name, base URL, website, email, category, description, endpoint paths) — no code changes needed, our domain already qualifies (real domain, valid 402 responses).
  - Also worth checking later: gold-402 (24K Labs curated directory) and x402.direct — not yet investigated.
- **Submitted to x402-list.com:** Marii approved, submitted all 18 services. Only **`agent-audit-trail` went through** (HTTP 201, pending review, submission_id `6ba61f37-eebf-4e8b-81e4-5a8d4dd032f5`) — x402-list.com enforces **1 submission per email per 7 days**, so the other 17 got HTTP 429. Tracking state committed at `.marketplace-submissions/x402-list-state.json`. Set up a **weekly auto-submit routine** (Wednesdays 10am Central, submits the next pending service, verifies the endpoint is alive first, updates + pushes the state file automatically): https://claude.ai/code/routines/trig_01Gr65Hm3A61nQcc6jnMjGeG — all 18 done by ~mid-October at this rate.
- **Found + fixed the conversion-killer bug:** the website's own "Integrate in 30 Seconds" code snippet advertised `POST /scrub` on pii-scrubber — **that endpoint doesn't exist, returns 404.** Real, correctly-implemented, x402-spec-compliant endpoint is `POST /mcp` (MCP/JSON-RPC body + `X-Payment-Tx` header). Fixed the snippet to show the real working example, pushed (`eb338b6`). Backend was always fine — only the marketing copy was wrong.
- Marii is multitasking for the LUXEMARA album release — working the open items in order, one at a time, low-key pace.
- **Marii ran `wrangler login` herself (fresh token, expires 2026-07-04T17:31Z) and `deploy.bat` — deploy succeeded** (521 files, https://03ecade1.402found-dev.pages.dev, promoted to production). **Confirmed live on 402found.dev:** no Stripe section, no broken snippet, correct `/mcp` example all showing. Items #1 and #3 both done.
- **Reminder for later (Marii flagged this, don't forget):** while logging into Cloudflare she noticed something about being able to "have agents stored there" — likely Cloudflare's Agents SDK / Durable Objects platform (the newly-installed Cloudflare plugin has `agents-sdk` and `build-agent` skills for exactly this). Worth a dedicated conversation later — not yet explored.
- **Next / open (in order):**
  1. ~~Fix the broken `/scrub` code snippet~~ ✅ done, pushed `eb338b6`
  2. ~~Run `wrangler login` + deploy~~ ✅ done — confirmed live on 402found.dev
  3. Retry Cloudflare **plugin** OAuth login (separate from wrangler's own login — `mcp.cloudflare.com` still shows unauthenticated) once the Cloudflare incident fully clears, then run the traffic/usage audit to see if there's been any real usage historically
  4. Decide when to flip the repo to public
  5. Firestore major-version bump for the last moderate vuln in `credits-api`/`packages/payment-gate` — test against live Stripe/Firestore code before applying
  6. GitHub secret scanning still not enabled (blocked on GitHub Free plan limits for private repos — resolves itself if repo goes public)
  7. Longer-term: consider whether the Coinbase CDP facilitator integration (for Agentic.Market auto-listing) is worth the build effort once there's a baseline of real traffic to compare against
  8. Consider submitting to gold-402 and x402.direct too (not yet investigated) once x402-list.com queue is moving
  9. Follow up with Marii on the Cloudflare "agents stored there" thing she noticed (see reminder above)

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
| Website (index.html, dashboard.html) | **Cloudflare Pages** (402found-dev.pages.dev) | **LIVE — 28 files deployed 2026-04-07** |
| DNS (*.402found.dev) | Cloudflare → ghs.googlehosted.com | Live |
| DNS (402found.dev) | **Cloudflare CNAME → 402found-dev.pages.dev** | **Live — migrated from Google/Firebase host** |
| Stripe payments (AI Trust Check, AI Guardian) | Cloudflare Pages site | **LIVE — $3.33 one-time / $9.99/month** |
| Redirects (.com, .io → .dev) | nginx in Cloud Run container | Live |
| Wrangler deploy script | Local — `C:\Users\simpl\projects\402found\deploy.bat` | ✅ LIVE — double-click to deploy in ~3 sec |
| GitHub → Cloudflare Pages CI/CD | N/A | Not set up — using wrangler CLI instead (simpler) |
| Old fly.io deployment | fly.io (402found-site) | Can be decommissioned |

---

## Session Log — April 7, 2026 (Session 2)

### April 7 (Session 2) — Meta Business Suite, HeyGen, Social Strategy

#### ✅ Meta Business Suite — April 17 Eclipse Launch Posts Scheduled
- Navigated Content Calendar to week of April 12–18 (Good Friday / Solar Eclipse window)
- Scheduled TWO posts for Fri April 17:
  - **Facebook: 7:00 AM** (peak Facebook follower time per MBS data)
  - **Instagram: 10:00 AM** (peak Instagram follower time per MBS data)
- Post copy: Eclipse launch caption with all 3 singles (ONE BEAT ONE LOVE, SOVEREIGN, iRECEIVE), frequencies, "link in bio"
- SOVEREIGN artwork (600×600) attached to both posts ✅
- ⚠️ **3 manual edits still needed before April 17:**
  1. Remove `#GoodFriday` → replace with `#EclipseSeason2026` (Good Friday was April 3, not April 17)
  2. Remove "is in 60622" location tag (got attached accidentally)
  3. Add opening line at top of post body: *"The eclipse changes everything. Not just the sky — YOU. 🌑✨"*
  - To fix: Planner → click Fri 17 block → "..." → Edit post

#### ✅ Instagram Inbox Audit
- Reviewed 4 unread Instagram comments
- Found @cornerofcreators "Send us this 🔥" comment (4 weeks old) on the "What if the sounds you make instinctively are ancient words" post
- Audited their account: 48.6K followers, only 8 following, AI art niche — NOT aligned with LUXEMARA audience
- Decision: Skip. Generic feature account, likely pay-to-play. Not worth pursuing.
- Educated on Instagram's no-native-repost mechanic and how to evaluate "send us this" comments going forward

#### ✅ HeyGen — Avatar & First Video Complete
- Avatar "Marii_J" confirmed set up: sacred geometry / golden light / meditative aesthetic ✅
- Voice "Marii_j_voice" confirmed ✅
- Avatar IV model confirmed ✅
- **First test video generated successfully**
- 🔑 Key discovery: Spell name phonetically as **"Mahdi Jay"** in scripts for correct AI pronunciation
- $25 credits loaded
- ⚠️ Watermark removal requires **Creator plan at $29/month** (subscription, not just credits)
- Creator plan also unlocks: Video Agent (AI auto-generates script + video from prompt), unlimited videos, 1080p, brand kit

#### 📋 HeyGen Content Pipeline (queued — 5 videos to batch-generate)
1. "What is 432Hz?" — evergreen education
2. SOVEREIGN origin story
3. iRECEIVE intro — "for when you're blocked"
4. April 17 eclipse teaser
5. "Why I don't make normal music" — brand origin

#### 🤖 Automation Path Identified (for future build)
- **Video Agent**: prompt → full script + video, no manual scripting needed
- **HeyGen API** → Make.com → trigger video generation from spreadsheet/Notion entry
- Goal: zero-spoon content pipeline — update a doc, avatar video posts itself

---

### April 7 — Wrangler Deploy Pipeline COMPLETE:
- [x] Installed wrangler globally: `npm install -g wrangler`
- [x] Authenticated: `wrangler login` → confirmed `luxemarasound@gmail.com`
- [x] Created `.pagesignore` to exclude backend/source files from deploys
- [x] **Test deploy succeeded** — 377 files, 2.83 sec, live at `402found.dev`
- [x] Deploy workflow: open terminal in `C:\Users\simpl\projects\402found` → double-click `deploy.bat` → done

**🚀 HOW TO DEPLOY SITE UPDATES (memorize this):**
1. Edit any file in `C:\Users\simpl\projects\402found` (usually `index.html`)
2. Double-click `deploy.bat` (or run it in terminal)
3. Wait ~3 seconds
4. `402found.dev` is live with your changes ✅

**If wrangler ever stops working** (new machine, token expired):
```
npm install -g wrangler
wrangler login
```
Then deploy normally. One-time fix.

---

### April 7 — Cloudflare Pages Migration & Stripe Launch:
- [x] Migrated website hosting from Cloud Run → **Cloudflare Pages** (direct upload, 28 files deployed)
- [x] 402found.dev is now **LIVE on Cloudflare Pages** at 402found-dev.pages.dev
- [x] DNS updated — Cloudflare CNAME now points to `402found-dev.pages.dev` (was pointing to old Google/Firebase host `ghs.googlehosted.com`)
- [x] **Stripe payment section is LIVE** with correct prices:
  - AI Trust Check: **$3.33 one-time**
  - AI Guardian: **$9.99/month**
- [ ] Wrangler deploy script setup in progress (for easy future deployments without manual upload)
- [ ] GitHub → Cloudflare Pages connection NOT set up — Cloudflare limitation on existing projects; using direct deploy workflow instead

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

### 1. Finish Wrangler deploy script setup
So future site updates can be pushed with a single command instead of manual upload via Cloudflare dashboard.

### 2. Verify DNS propagation for 402found.dev → Cloudflare Pages
Confirm the CNAME to `402found-dev.pages.dev` is resolving correctly everywhere. DNS changes can take up to 24-48h to fully propagate.

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
- **Stripe credits-api deploy** — Still blocked on completing Stripe account setup (API keys needed) before credits-api can go to Cloud Run
- **17 service deploys remaining** — batch deploys in progress, will resume next session
- ~~**Wrangler deploy script**~~ — ✅ RESOLVED 2026-04-07: `deploy.bat` works, authenticated, test deploy confirmed
- ~~**Website hosting migration**~~ — ✅ RESOLVED 2026-04-07: Cloudflare Pages is live
- ~~**Stripe pricing on site**~~ — ✅ RESOLVED 2026-04-07: AI Trust Check $3.33 / AI Guardian $9.99/month live
