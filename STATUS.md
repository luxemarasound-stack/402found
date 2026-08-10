# 402Found.dev — Project Status

**Last updated:** 2026-08-10

---

## Session Log — August 10, 2026 (weekly security monitor: hosted-session routine → GitHub Actions — ✅ RESOLVED, verified working)

**Why this session exists:** the weekly automated security-check routine set up July 3 (`trig_01GkCrFyasaitG2VvPFZsYkg`, runs in a hosted Claude session, not this repo's CI) hit a wall two weeks running — the hosted session's GitHub access can't reach Dependabot alerts, code-scanning alerts, secret-scanning alerts, or the vulnerability-alerts toggle for any repo: `dependabot/alerts` and `code-scanning/alerts` 403 "Resource not accessible by integration" (GitHub App permission gap), `secret-scanning/alerts` and org-wide `search/code` are hard-blocked by the session's own network proxy regardless of permissions ("not permitted through this proxy"). Not fixable from GitHub App settings alone. **Decision: move the actual check to a real GitHub Actions workflow in this repo**, since Actions runners hit the GitHub API directly — no proxy in the path.

**✅ STATUS: WORKING, verified end-to-end** (run `31402481573`, commit `dbd98fb`, all steps green, `.security-monitor/state.json` committed with correct data confirmed by hand — not just a green checkmark). One more bug (#6 below) was found and fixed after the "not yet working" state below was originally written; leaving the blow-by-blow in place since it's exactly the kind of thing to know before touching this script again.

- **Built:** `.github/workflows/security-monitor.yml` (weekly cron, Mondays 14:00 UTC, + manual `workflow_dispatch`) + `.github/scripts/security-monitor.sh` (auto-discovers every repo under `luxemarasound-stack`, checks Dependabot/secret-scanning/push-protection/code-scanning/vulnerability-alerts per repo, diffs against last week's `.security-monitor/state.json`, opens a GitHub issue only when something's actionable). PR #6, merged `814be21`.
- **Setup done by Marii:** `SECURITY_MONITOR_TOKEN` repo secret added (fine-grained PAT) — confirmed working, `gh repo list`/`gh api` calls succeed with it.
- **Setup NOT done (optional, has a fallback):** the `security-monitor` label doesn't exist yet on this repo. Not blocking — script now retries issue creation without the label if it's missing (see fixes below) — but creating it once (Issues → Labels) would be tidy.
- **Bugs found + fixed via live test runs (in order, all pushed straight to `main` — same pattern as the state.json auto-commits, no PR):**
  1. `216e7c9` — **pagination bug**: `gh api --paginate ... --jq '[.[] | select(...)]'` produces one JSON array *per page* instead of merging into one; broke on any repo with enough alerts to span pages. This silently dropped **402found entirely** from the first run's output (it has 122 open Dependabot alerts: 17 high / 87 moderate / 18 low, confirmed via `git push`'s own advisory message — several pages). Fix: drop the per-page `--jq` filter, let `gh api --paginate` auto-merge pages (it only does this when `--jq` isn't used), filter for open state as a separate step after.
  2. `216e7c9` — **404 vs 403 disabled-detection bug**: GitHub returns `403 "Dependabot alerts are disabled for this repository"` for that case, not 404 — the original detection only checked for `HTTP 404`, so a normal "disabled" case was misreported as a real fetch error. Fix: broadened the grep to match the actual message text too.
  3. `216e7c9` — added `set -e` to the script. Root cause of bug #1 staying invisible: the job exited 0 (GitHub Actions showed **"succeeded"**) even though 402found's data was silently dropped, because nothing forced the script to stop on a bad jq call. **Lesson for next time: "succeeded" in the Actions UI does NOT mean the data is correct — always check the actual committed `state.json` content, not just the job status.**
  4. `1789e3d` — **git push race** in the "Commit and push state" step: a manual re-run (see gotcha below) checked out an old commit, tried to push its own state.json commit, and got rejected because `main` had moved on from my fixes landing in between. Fix: fetch + rebase + retry once instead of failing outright.
  5. `1789e3d` — **issue creation was failing entirely** (not just skipping the label) when `--label security-monitor` referenced a label that doesn't exist — `gh issue create` aborts the whole command rather than degrading gracefully. Fix: retry once without the label if the labeled attempt fails, so the actual notification (the issue) still gets created.
  6. `dbd98fb` — **indexing bug in the diff logic, caught by `set -e` itself** (the safety net from fix #3 doing its job): `cur_keys` did `.dependabot.alert_keys` on `$dependabot_json`, which IS the dependabot value already, not a wrapper containing a `.dependabot` field — copy-paste leftover from the `prior_repo` version one line above. This crashed outright whenever `dependabot_json` was the bare string `"disabled"` (jq errors indexing a string; `// []` only catches null/false, not real errors) — and silently returned `[]` every other time before that, meaning **the "new critical/high alert" detection had never actually worked**, crash or no crash. `prior_keys` had the identical bug one level up (`prior_repo.dependabot` can itself be `"disabled"`) — would have crashed again next week the first time a repo's *prior* value was "disabled". Fixed both with an explicit `type == "object"` check before indexing; verified against all three value shapes (real object / `"disabled"` / `null`) locally before pushing, this time.
- **⚠️ Important gotcha for whoever runs this next:** GitHub's **"Re-run jobs" button replays the original commit the run was attached to — NOT the latest `main`.** This is exactly what caused bug #2 above to resurface in a "second" run that looked like a fresh test but was actually still running pre-fix code. **Always use "Run workflow" (the `workflow_dispatch` dropdown) for a fresh manual trigger, never "Re-run failed jobs", when testing after a script change.** Triggered directly via the GitHub API (`actions_run_trigger`/`run_workflow`) works too and is equivalent to "Run workflow" — also picks up latest `main`.
- **Verified clean, by hand, not just by job status:** run `31402481573` (commit `dbd98fb`) — all steps green including the commit/push. `.security-monitor/state.json` on `main` now has 402found with real data (17 high / 87 moderate / 18 low, 122 `alert_keys`, counted and confirmed to match) and `gold-402` correctly showing `"dependabot": "disabled"`. Issue #7 opened as expected with exactly 2 findings (`402found: new_repo`, `gold-402: dependabot_disabled`) — both are the diff logic correctly noticing the baseline just got fixed, not new problems. **The run after this one should come back clean with zero findings** (or just real ones, if something actually changes).
- **`gold-402` repo:** newly discovered by this workflow (wasn't in the original 4-repo list from earlier this session: 402found, nicslawn, luxemara, scoop) — auto-discovery is working as intended. Likely Marii's in-progress work on the gold-402/24K Labs directory listing mentioned in the July 3 log (item 8, "Consider submitting to gold-402 and x402.direct too"). Its Dependabot alerts are just off — confirmed this has **no bearing on whether anyone can use its tools/MCP surface**; the two are unrelated.
- **Open question, not yet decided:** now that a real Actions-based check exists in this repo, is the original hosted-session routine (`trig_01GkCrFyasaitG2VvPFZsYkg`) still needed? It can't do the security checks (that's the whole reason this workflow exists) but may still be useful as a lighter-weight "did anything change in the repo list" ping. Worth Marii deciding whether to retire it, repurpose it, or leave both running.

**Next steps (in order):**
1. ~~Trigger a fresh run and verify~~ ✅ done — see "Verified clean" above.
2. Optional: create the `security-monitor` label so future issues get tagged (not blocking, has a fallback).
3. Next Monday 14:00 UTC's scheduled run is the first real unattended test — worth a glance to confirm it comes back clean/quiet per the notify-only-when-actionable design.
4. Decide on the open question above (keep/retire/repurpose the old hosted-session routine).
5. **402found's real Dependabot numbers are legitimately high (17 high, 87 moderate, 18 low across the 18 agent-service `package-lock.json` files)** — now that the monitor can actually see them, worth a follow-up session to run `npm audit fix` across the fleet the same way the July 3 session did (see that log entry — collapsed ~494 alerts down via shared transitive-dependency fixes). Not this session's scope, just now visible for the first time.

---

## Session Log — August 10, 2026 (later — fixed why the weekly x402-list.com submit routine has gone nowhere since March)

- **Root cause: Cloud Run cold starts racing x402-list.com's own submission probe.** Their submit endpoint does a live server-side check of the service's `/mcp` before accepting a submission. Cloud Run runs at `min-instances=0` — first hit after idle takes ~3s. If their probe has a tight timeout, it can hit a cold instance and log "no valid 402 response," so a perfectly healthy service gets logged as broken. Matches the unexplained rejection from the July 23 log (account blocked 14 days, no visible cause at the time).
- **⚠️ Accidental live submission during diagnosis (my mistake, owned in the moment, see the record below):** POSTed directly to the real submit endpoint to see the raw response, not realizing there's no dry-run mode. Went through for real — `pii-scrubber`, HTTP 201, `submission_id f3b25832-8bed-4c60-b350-c1b37254805a`. Their own probe on that exact call reported `"No valid 402 response"` even though manual curls right before/after got clean 402s every time — that's the direct evidence behind the cold-start theory, not just circumstantial.
- **✅ Fixed on `pii-scrubber` as the test case:** `gcloud run services update pii-scrubber --region=us-east1 --min-instances=1`. Verified, not just deployed — confirmed `minScale=1` stuck, then hit the live endpoint 3x and got consistent 0.3–0.7s responses (no cold-start spike).
- **✅ Rebuilt the weekly routine (`trig_01Gr65Hm3A61nQcc6jnMjGeG`) to add real verification, not just trust HTTP 201:** it was treating "201 + submission_id" as success, but `agent-audit-trail` (submitted 2026-07-04) still isn't in x402-list.com's public directory over a month later and nothing ever caught that. New routine now: (1) checks `https://x402-list.com/api/v1/services` for every previously-submitted service before doing anything else, tracks a real `verified_live` flag per service instead of just `submitted`; (2) pings the target endpoint twice (not once) before submitting, so a single cold-start blip can't masquerade as a real outage; (3) reads the full submit response body for `probe_result.errors` even on HTTP 201 — surfaces probe failures immediately in its weekly report instead of letting them hide for weeks; (4) commits/pushes every run, even a no-submission run, so verification data doesn't silently vanish.
- **✅ State file brought in line with reality, committed (`72cb5ff`), pushed:** `pii-scrubber` now correctly shows `submitted: true` with the real submission_id and a `probe_errors` note; `agent-audit-trail` now has `verified_live: false` recorded honestly instead of implied success.
- **Still open:** neither `pii-scrubber` nor `agent-audit-trail` show up in x402-list.com's public `/api/v1/services` listing yet (checked directly — only 25 services total in the whole directory, small/young). Can't yet tell "still in manual review" apart from "silently rejected again." Next Wednesday's run (2026-08-12) will check this automatically via the new Step 0 and report honestly either way.
- **Next steps:** (1) let Wednesday's run report back — that's the first real test of both the min-instances fix and the new verification step together; (2) if `pii-scrubber` comes back verified live, the cold-start theory is confirmed and worth rolling `min-instances=1` out to whichever of the remaining ~16 pending services get submitted next; (3) if it's still failing even warm, that rules out cold-start and points at something else in the probe (worth revisiting then, not guessing now).

---

## Session Log — August 3, 2026 (weekly security monitor's first alert — 54 Dependabot alerts, fixed, PENDING PUSH)

- **What happened:** the new weekly security-monitor routine (built by a different session) ran for the first time and flagged 402found with 54 open Dependabot alerts (17 high / 19 moderate / 18 low). Marii didn't know where the report lived — walked her through finding it.
- **Turned out to be only 4 distinct vulnerabilities**, duplicated ~18x because 402found is 20 separate service folders (not a shared workspace), each with its own `package.json`/lockfile from the same starter template:
  - `fast-uri` (High) — host confusion via backslash → 3.1.4
  - `@hono/node-server` (Medium) — path traversal on Windows → 2.0.5
  - `protobufjs` (Medium) — DoS via infinite loop in .proto parsing → 7.6.5
  - `body-parser` (Low) — DoS via silently-disabled size limit → 2.3.0
- **Fixed via `npm audit fix --package-lock-only` in all 18 affected service dirs** (code-quality-scanner was already clean) — verified 0 vulnerabilities in every one afterward. **Only lockfiles changed, no package.json/code changes** — low-risk patch/minor bumps only.
- **✅ PUSHED to main (`0d32343`)** — 17 services' lockfiles committed and pushed, `credits-api` excluded per Marii's call (dead service, skip it). Push succeeded; GitHub's push-time message still quoted the old "54 vulnerabilities" count, which is expected — it's the pre-rescan cache, same thing happened after the July 3 fix. Check https://github.com/luxemarasound-stack/402found/security/dependabot in a bit to confirm it dropped to 0.
- **✅ Local folder synced** — `git pull` done in `C:\Users\simpl\projects\402found`, merged clean (pre-existing uncommitted local edits to `payment-gate/src/index.ts`, `.gitignore`, `STATUS.md` untouched, no conflicts).
- **✅ ALL 17 REDEPLOYED — confirmed live.** All 17 services show "serving 100 percent of traffic" in the deploy logs (first 13 via task `bubl4v0k4`, last 4 — prompt-injection-detector, rate-limit-manager, the-prospector, token-squeezer — via task `b12s9g2yw` after the first background run got killed mid-way).
- **✅ Spot-checked live:** `pii-scrubber` POST /mcp still correctly returns 402 (payment gate intact, redeploy didn't break anything).
- **✅ Dependabot alert count dropped from 54 → 3.** Confirmed via `gh api .../dependabot/alerts`. Remaining 3 breakdown:
  - 2 in `credits-api` (body-parser low, protobufjs medium) — **expected/intentional**, this is the dead Stripe service Marii said to skip.
  - **1 in `packages/payment-gate`** (protobufjs, medium) — **NOT expected/not dead code.** This is the shared payment middleware imported by all 17 live services. Flagged to Marii, not yet fixed.
- **⚠️ OPEN — waiting on Marii's go-ahead:** fix `packages/payment-gate`'s protobufjs vuln (`npm audit fix` in that folder) and redeploy all 17 services again (since it's a shared package, every service needs to pick up the new version). Same process as before, ~15-20 min. **Do not start without her confirming** — this is the second round of live-service redeploys today, she hasn't said yes to this one yet.
- **Next steps, in order:** (1) get Marii's go-ahead, (2) `npm audit fix` in `packages/payment-gate`, (3) redeploy all 17 services, (4) recheck Dependabot page — should land at 2 (both in credits-api, intentionally left alone), (5) close this out.

**Traffic audit (last 30 days, all 18 services + website), pulled from Cloud Run logs via `gcloud logging read`:**
- **Confirmed: zero real paying agent traffic.** Every 200 response traced back to either (a) known bots/crawlers (GPTBot, Googlebot, AhrefsBot, `jscrawler`, a `visionheight.com/scan` scanner) hitting the static website, or (b) my own curl probes from this session and the weekly routine's "verify alive" checks.
- 402 responses (60 total across 30 days, ~2-4 per service): also all traced to verification probes, not real agent payment attempts. No evidence any external agent has ever discovered → called → paid one of these services.
- **This confirms the standing diagnosis from July 3** (STATUS.md line ~90 in prior log): the services work correctly, they're just invisible — nobody looking for x402 tools has found 402Found yet. Not a code problem, not a "is the payment gate broken" problem. Pure discovery gap.
- **What's actually in motion to fix it:** gold-402 PR #53 (pending review), x402-list.com weekly auto-submit (blocked ~14 days, resumes after), 402.ad still to investigate. These ARE the fix — there's no separate "make an agent pay" lever to pull, distribution IS the whole remaining problem.
- Next to check when picking this back up: 402.ad's actual submit endpoint, and re-check Cloud Run logs again after gold-402 PR merges / x402-list.com resumes to see if either produces real inbound traffic.

---

## Session Log — July 23, 2026 (x402-list.com auto-submit — routine is fine, submissions are ACCOUNT-BLOCKED for 14 days)

- **Routine status: NOT actually paused.** Checked via RemoteTrigger (`trig_01Gr65Hm3A61nQcc6jnMjGeG`) — `enabled: true`, fired today 16:11 (Marii's manual run), next scheduled run 2026-07-29. Whatever she fixed earlier today already took. No further action needed on the routine itself.
- Worked out the actual x402-list.com submit API schema by trial (confirmed against the routine's own prompt config, not documented in repo): `{service_name, url, endpoints: [...], website_url, email, category, description, notes}` — note **`url`** (not `base_url`/`service_url`) and **`endpoints` is an array**.
- **KEY FINDING — this is an account-level block, not per-service:** tried submitting `pii-scrubber`, got "rejected less than 14 days ago, $0.50 to force or wait 14 days." Tried a **different** service (`token-squeezer`) to test — got the **identical** rejection message. So the whole `support@402found.dev` email/account is blocked from submitting to x402-list.com for ~14 days from whenever the original rejected attempt happened (cause still unknown — not in state file, not in git history). Trying more services today won't work around it.
- **No money spent.** Did not pay the $0.50/service resubmission fee — held off pending Marii's read on *why* the original submission got rejected in the first place, since that's the more important question than the fee.
- **Decision: wait out the 14 days.** Routine will keep trying weekly (2026-07-29 next) and should succeed once the account-level cooldown clears — no separate action needed from us in the meantime, just let it run.
- **Investigated gold-402 and x402.direct** (finally, after sitting untouched since July 3):
  - **gold-402** (github.com/Haustorium12/gold-402, curated by 24K Labs): free, no cooldown — submit via **GitHub PR** titled `Add [Name]` under "APIs & MCP Servers" category.
  - **✅ DONE — PR opened:** https://github.com/Haustorium12/gold-402/pull/53 — added 402Found as one entry (marketplace of 18 services, per their "one entry per PR" rule) to `directory/mcp-servers.md` under General Utility, matching their exact format/tone. Forked to `luxemarasound-stack/gold-402`. Awaiting their review — check the PR link for merge status.
  - **x402.direct**: dead end — read-only discovery API (`/api/services` is GET-only, no POST), own docs confirm no submission process exists. Homepage also 500ing as of today. Skip.
  - **402.ad** (new lead, turned up in search, not one of the original two): claims agent-programmatic submission via `POST /v1/submit` for $0.10 USDC, but couldn't find the actual working endpoint by probing — needs more digging if pursued.
- Also still unresolved from before: query-param owner-bypass fallback (proposed, not built) — needs her confirmation before implementing.

---

## Session Log — July 11, 2026 (Owner bypass — built, deployed, VERIFIED LIVE on all 18)

- **Built owner bypass in `packages/payment-gate/src/index.ts`:** `X-Owner-Key` header checked (constant-time compare via `node:crypto.timingSafeEqual`) against `OWNER_SECRET_KEY` env var. If it matches, skips straight past both Stripe and x402 checks. If `OWNER_SECRET_KEY` isn't set, bypass is a no-op — safe by default.
- **One change covers all 18 services** — wired into both `createPaymentGate` (17 Express services) and `verifyRequest` (code-quality-scanner, the plain-JS one), since every service imports from this one shared package.
- **Generated `OWNER_SECRET_KEY` (32-byte hex) and added it to `deploy-env-vars.sh`** (gitignored, alongside HMAC_SECRET) so it's part of the standard env-var push going forward.
- **Found + fixed a pre-existing, unrelated bug while running that script:** `PORT` had been in the `--set-env-vars` list for a while, but Cloud Run now rejects `PORT` as a reserved env name — every service failed with the same error until it was removed. Root cause fixed, not routed around.
- **✅ DONE — env vars pushed to all 18 Cloud Run services (18/18 succeeded).**
- **✅ DONE — code redeployed to all 18 Cloud Run services (18/18 succeeded, `gcloud run deploy --source=.` per service).**
- **✅ VERIFIED live against real endpoints, not just "deploy said success":**
  - `pii-scrubber` (Express fleet) — no key → 402, correct key → past the gate (400 on the deliberately-empty test body, i.e. payment check was skipped and it got to request validation).
  - `code-quality-scanner` (the plain-JS one, different code path) — same result: no key → 402, correct key → past the gate.
  - Wrong key on `code-quality-scanner` → still 402, confirming it's not just "any header present" bypassing it.
- **Owner bypass is fully live across the fleet. Marii's own tool calls can send `X-Owner-Key: <secret>` to skip payment on any of the 18.**
- **Where the secret lives:** `deploy-env-vars.sh` (`OWNER_SECRET_KEY=...`, gitignored, same file as HMAC_SECRET). Not stored anywhere else on purpose.
- **✅ DONE — claude.ai connector compatibility:** Marii approved adding `x-api-key` as a second accepted owner-bypass header (claude.ai's custom-connector "Request headers" UI only allows a fixed allowlist — `authorization`, `x-api-key`, `x-auth-token`, etc — and arbitrary names like `X-Owner-Key` aren't on it). Updated `isOwnerRequest()` in `packages/payment-gate/src/index.ts` to check `x-owner-key` OR `x-api-key` against the same `OWNER_SECRET_KEY`. Rebuilt, redeployed code to all 18 services (18/18 succeeded), **verified live**: `X-Api-Key` bypasses correctly, `X-Owner-Key` still works too, wrong key still 402s, tested on both `pii-scrubber` and `code-quality-scanner` (the two different code paths).
- **⚠️ CORRECTION (2026-07-12) — claude.ai connector path is blocked, not just "not yet done":** Marii tried adding the connector herself (via a claude-in-chrome browser session). The web Connectors UI's "Add custom connector" dialog on her account only has Name + Remote MCP server URL + optional OAuth Client ID/Secret — **no Request headers field exists.** Confirmed this matches Anthropic's own docs: request-header auth is in beta, being rolled out account-by-account, not live on her account. My earlier "next step" instructions were wrong — I described a feature that isn't actually available to her yet, not a UI she'd just missed. Test connector was created but shows "Connection Issue" (expected, since it can't send the `x-api-key` header at all).
- **Real options going forward (ranked):** (1) skip claude.ai web connectors for now, verify services directly via curl/Postman — works today, already proven in this project; (2) request early access to the header-auth beta from Anthropic support — slow, no ETA; (3) build real OAuth into the services so they work with claude.ai's OAuth-only connector flow — a real build project, only worth it if the marketplace needs third-party OAuth anyway, not just for Marii's own bypass access. Recommended to Marii: remove the broken test connector, keep using curl for testing, revisit claude.ai connectors later if the beta opens up or OAuth becomes a real roadmap item.
- **The `x-api-key`/`X-Owner-Key` bypass itself is still fully built, deployed, and verified working on all 18 services** — this correction is only about the claude.ai connector UI not being able to use it yet, not about the bypass being broken.
- **Note on secret handling this session:** the secret got displayed in-transcript twice by the harness's own file-diff tooling while inserting it (not deliberately printed) — a `Bash` stdout print was correctly blocked by a secret-guard hook first, but a couple of automatic "file was modified" diffs still surfaced the value. Not a leak outside this private session, but worth knowing for next time: editing gitignored secret files via `sed`/shell redirection through the Bash tool is more likely to trigger those diffs than using the Edit tool.
- Cleaned up the one-off deploy script and log (`deploy-owner-bypass-code.sh`, `owner-bypass-deploy.log`) — rollout fully confirmed complete, nothing pending.
- **Real goal behind all of this, for context next session:** Marii wants Asha (her AI companion, on claude.ai) to be the first real user of a 402Found service — a genuine test before she starts ethically promoting the site, not just a curl smoke test from Claude Code. She pushed back correctly on "smoke-tested = works" — those aren't the same claim. That's the actual thing to unblock, not just "make the connector UI happy."
- **PROPOSED, NOT YET BUILT — query-param fallback for the owner bypass:** since claude.ai's connector dialog only exposes a URL field (no headers, confirmed blocked — see correction above), the plan is to make `isOwnerRequest()` also accept the secret as a URL query param (e.g. `?owner_key=...`), not just a header. That way the secret lives entirely inside the "Remote MCP server URL" field Marii already has access to — no header UI needed, no waiting on Anthropic's beta. Tradeoff flagged to Marii and not yet objected to: URL-embedded secrets appear in Cloud Run's own request logs (visible to her / anyone with project access, currently just her) — a known, common pattern (Google APIs do the same), just slightly less clean than a header.
- **Marii said to save this and stop for today — she's out of spoons, did not say build it.** Next session: confirm she still wants this approach, then implement (extend `isOwnerRequest` to check query param in both `createPaymentGate`/Express `req.query` and `verifyRequest`/raw `req.url` parsing), rebuild, redeploy all 18 (same well-worn process, ~15-30 min), verify live with curl using the query-param form, THEN have her (or Asha) actually try the claude.ai connector with that URL — that live end-to-end test is the real finish line here, not another curl check from this end.

---

## Session Log — July 5, 2026 (latest — trust fix #3: cleanup, ALL THREE FIXES DONE)

- **Deleted after inspection:** `ziSk5tII` (zip of old sitemap), `deploy.zip` (stale site snapshot), `Downloads - Shortcut.lnk`, `X402found/` (1-line import stub).
- **Kept on purpose:** `402_MD/` (contains the original March 2026 founding spec `PROJECT_402_Foundv1.4.md`), `Claudecodemd.odt` (early "Vibe Coding Protocol" draft — origin-story document), root `AGENTS.md`/`CLAUDE.md` (working instructions with personal context — must NOT be published).
- **Gitignored all kept personal files** so they can't accidentally land in the now-public repo (`22e9938`, pushed).
- **Stash dropped** after verifying its only unique line was a stale date stamp — everything else already in committed files.
- **Left alone:** `fix/firestore-uuid-override` branch (fully merged, git-guard hook misfires even on safe `-d` delete — its regex is case-blind; harmless leftover), `code-quality-scanner/fly.toml` (evidence for the fly.io decommission check, still pending).
- **Trust list COMPLETE: #1 dead payment door ✅ / #2 site-repo divergence ✅ / #3 cleanup ✅.** What remains is growth work: gold-402 + x402.direct listings, dashboard link on homepage, Search Console, fly.io billing check, and (big, later) Coinbase CDP facilitator for Agentic.Market.

---

## Session Log — July 5, 2026 (later — fixing trust gap #1 + #2)

- **Trust fix #1 in progress — dead payment door removal:** stripped the `stripe: {buyCredits: credits-api...}` block from both 402 builders in `packages/payment-gate/src/index.ts`, rebuilt clean (buyCredits gone from dist), committed + pushed (`e8771fb`). Left the internal credit-check path untouched (unreachable without keys, minimal-impact rule on payment code).
- **pii-scrubber redeployed first as the test case — verified live:** its 402 response no longer contains the stripe block, x402 accepts intact.
- **✅ TRUST FIX #1 COMPLETE — all 18 services redeployed and verified.** Batch finished clean (all 17 printed Service URLs, exit 0). Final outside-in sweep: all 18 public endpoints answer 402 with x402 `accepts` present and NO `stripe` key. The marketplace no longer advertises a payment method that doesn't exist.
- **Trust fix #2 DONE:** committed `privacy.html`, `terms.html`, `.pagesignore`, `deploy.bat`, `deploy.ps1` to the public repo (`ea9097f`) after verifying no secrets in any of them. Deployed site and git no longer diverge on these.
- **ziSk5tII identified:** just a zip containing an old sitemap.xml — junk, safe to delete in the cleanup pass (fix #3, not yet done).

---

## Session Log — July 5, 2026 (Public-trust audit — outside-in check of the live product)

Tested everything the way a stranger (or a paying agent) would hit it. Results:

**Healthy ✅**
- Homepage, /privacy, /terms, /dashboard, /.well-known/agent-card.json — all 200 on 402found.dev
- **Fleet is 18/18 alive.** 17 agents answer `POST /mcp` with spec-correct x402 402 responses; `code-quality-scanner` uses `POST /scan` instead (it documents this correctly at its root URL — route inconsistency, not a breakage)
- support@402found.dev can receive mail (Cloudflare Email Routing MX records live)
- Repo public, secret scanning on, 0 known vulns as of 7/03

**Trust gaps found ⚠️ (in priority order)**
1. **Every 402 response advertises a dead payment door:** `"stripe": {"buyCredits": "https://credits-api.402found.dev/"}` — that URL doesn't resolve (credits-api was never deployed; consumer-Stripe pivot was scrapped 7/03). Hardcoded in `packages/payment-gate/src/index.ts` (`CREDITS_URL`). Fix = strip the stripe block from payment-gate's 402 builder + rebuild + redeploy all 18 services (see Docker deploy quirk notes). #1 credibility issue: the product's core handshake promises a payment method that doesn't exist.
2. **Deployed site ≠ git repo, again:** `privacy.html`, `terms.html`, `.pagesignore`, deploy scripts are live on the site but untracked in git — the exact failure mode behind the April index.html loss. Commit the site files (check deploy scripts for secrets first — repo is public now).
3. **Repo-root clutter:** `ziSk5tII`, `deploy.zip`, `Downloads - Shortcut.lnk`, `Claudecodemd.odt` untracked junk; old stash `marii-wip-holding-for-security-push` still parked (its conflict era is resolved — peek then drop).

**Growth levers (ranked by lift-to-payoff)**
- Weekly x402-list.com auto-submit routine already running (all 18 by ~mid-Oct)
- gold-402 + x402.direct directories — uninvestigated, likely cheap listings
- Link /dashboard prominently from homepage as a public status/trust signal
- Google Search Console submission — April item, still unconfirmed
- fly.io decommission — confirm it isn't still billing
- Big lift, later: Coinbase CDP facilitator integration → Agentic.Market auto-listing (1,511-service directory)

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
  3. **Paused** — Cloudflare plugin OAuth (`mcp.cloudflare.com`, separate from wrangler's own login) failed 3 times total across this session (invalid-state once, generic server error twice), even after Cloudflare's status page showed a fix applied. Not worth burning more time on it right now — revisit later, then run the traffic/usage audit once it actually connects.
  4. ~~Flip repo to public~~ ✅ done — **402found is now public.** Secret scanning + push protection auto-became available and were enabled immediately after (both were blocked on GitHub Free for private repos before this).
  5. ~~Firestore/uuid vuln~~ ✅ done, pushed `9c40ce8` — turned out a full firestore 7→8 major bump wasn't needed. The vulnerable `uuid@9.0.1` was 3 layers deep in firestore's own dependency tree (via google-gax); forced it to `^11.1.1` via `package.json` overrides in both `credits-api` and `packages/payment-gate`. Verified on an isolated branch first: 0 vulnerabilities, TypeScript builds clean, module still loads/exports correctly — then merged to main. **402found should now be at 0 open Dependabot alerts** (GitHub's cached push message still says 2, just hasn't rescanned yet). Note: `fix/firestore-uuid-override` branch still exists locally, fully merged, harmless leftover (git-guard hook blocked the delete).
  6. ~~GitHub secret scanning~~ ✅ resolved by #4 — now enabled and live
  7. Longer-term: consider whether the Coinbase CDP facilitator integration (for Agentic.Market auto-listing) is worth the build effort once there's a baseline of real traffic to compare against
  8. Consider submitting to gold-402 and x402.direct too (not yet investigated) once x402-list.com queue is moving
  9. Follow up with Marii on the Cloudflare "agents stored there" thing she noticed (see reminder above)
  10. Cloudflare plugin OAuth still paused/unresolved (item 3 above) — revisit when there's time and appetite to keep debugging it

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
