# 402Found.dev — Website Improvement Plan

**Last Updated:** March 18, 2026

---

## COMPLETED

### Fix: Browser "Dangerous Site" Warnings
- **Problem:** All 18 agent card links pointed to raw `/.well-known/agent-card.json` endpoints. Browsers flagged these as suspicious (non-HTML response, restrictive CSP headers, no landing page at root `/`).
- **Fix:** Replaced all `<a href>` links with copy-to-clipboard `<span>` elements. Clicking now copies the subdomain to clipboard with visual "Copied!" feedback. No more browser navigation to raw JSON endpoints.
- **File:** `index.html`

---

## TODO — Professional & Trustworthy Appearance

### Priority 1: Trust Signals (High Impact, Low Effort)

- [x] **Add a favicon** — Inline SVG "402" icon added to `<head>`.
- [ ] **Add contact/support email** — Even one line in the footer. Shows a human is behind this. Consider `support@402found.dev` or a simple contact form.
- [ ] **Add Terms of Service / Privacy Policy** — Even a minimal one-pager. Links in footer. Signals legitimacy to both users and browser security scanners.
- [ ] **Add GitHub link** — If any repos are public, link them. Open source = credibility.

### Priority 2: Social Proof & Status (Medium Effort)

- [x] **Live status indicators on each card** — Green/red dot per agent using `/health` endpoint checks on page load.
- [ ] **Request counter** — "X requests processed" per agent or total. Even a simple counter adds legitimacy. Could pull from a lightweight stats endpoint.
- [ ] **Uptime percentage** — "99.9% uptime" badge if accurate. Or aggregate across the fleet.
- [ ] **Response time per agent** — Show "~200ms" next to each price. Helps buyers understand what they're paying for.

### Priority 3: Content & Documentation (Medium-High Effort)

- [x] **About section** — Added About 402Found section before footer.
- [ ] **API documentation links** — Each card should link to docs (could be auto-generated from `/openapi.json` endpoints). Even linking to the OpenAPI spec is better than nothing.
- [x] **"Try It" interactive demo** — Client-side PII Scrubber demo with textarea, button, and live result display.
- [x] **Integration code snippet** — "Integrate in 30 Seconds" section with syntax-highlighted JS example and copy button.

```javascript
// Example snippet to add:
const res = await fetch('https://pii-scrubber.402found.dev/scrub', {
  method: 'POST',
  headers: { 'X-Payment': txHash },
  body: JSON.stringify({ text: 'My SSN is 123-45-6789' })
});
```

### Priority 4: Design Polish (Medium Effort)

- [ ] **Logo** — Replace text-only "402Found" with a proper logo mark. Even a simple SVG icon next to the text. Brands with logos feel established.
- [ ] **Make Dashboard link more prominent** — Currently buried in footer. Consider adding it to a nav bar or as a button near the header.
- [ ] **Add an "Integrate" section** — Between "The Fleet" and "How It Works". Show the developer experience: install, configure wallet, call endpoint.
- [ ] **Mobile nav improvements** — The grid stacks to 1 column which is good, but the header could use tighter spacing on mobile.

### Priority 5: SEO & Discovery (Low Effort, High Value)

- [x] **Add Open Graph meta tags** — OG + Twitter Card meta tags added.
- [x] **Add structured data (JSON-LD)** — Schema.org WebApplication markup with AggregateOffer for 18 agents.
- [x] **Add `/robots.txt`** and **`/sitemap.xml`** — Created and added to Dockerfile.
- [ ] **Submit to Google Search Console** — Ensure the site is indexed properly.

### Priority 6: Infrastructure (Ongoing)

- [ ] **Add root `/` route to each Cloud Run service** — Return a simple HTML page with agent name, description, docs link, and health status. Prevents 404 on subdomain root.
- [ ] **Consider Google Safe Browsing appeal** — If any subdomains are still flagged after fixes, submit a review request at https://safebrowsing.google.com/safebrowsing/report_error/

---

### Priority 0: Migrate Landing Page to Cloud Run (Do First)

- [ ] **Move landing page from fly.io to Cloud Run** — All 18 agents are already on Cloud Run. The landing page (`402found-site`) is the last thing still on fly.io (confirmed: `server: Fly/d7c25123`). Migrate to Cloud Run for consistency, single billing, and to eventually shut down fly.io entirely.
- [ ] **Update Cloudflare DNS** — Point `402found.dev` root to the new Cloud Run service
- [ ] **Verify redirects** — Confirm `402found.com` and `402found.io` still 301 to `402found.dev` after migration
- [ ] **Decommission fly.io** — Once landing page is confirmed on Cloud Run, tear down `402found-site` on fly.io

---

## Architecture Notes

- **Landing page is STILL on fly.io (`402found-site`) — needs migration**
- All 18 agents are on Google Cloud Run (`us-east1`, `luxemara-tools` project)
- Custom subdomains via Cloudflare DNS → `ghs.googlehosted.com`
- `402found.com` and `402found.io` redirect to `402found.dev` (301 via nginx)
- Source: `C:\Users\simpl\projects\402found\index.html`

---

## Deploy Updated Landing Page

```bash
# From the 402found project directory
cd C:\Users\simpl\projects\402found

# If deploying to fly.io:
fly deploy

# Verify changes:
curl -s https://402found.dev | grep "copyUrl"
```
