#!/usr/bin/env bash
set -euo pipefail

STATE_FILE=".security-monitor/state.json"
WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

mkdir -p .security-monitor

# --- STEP 1: discover repos (uses the broad-read PAT) -----------------------
repos_json=$(GH_TOKEN="$SECURITY_TOKEN" gh repo list "$OWNER" --limit 100 \
  --json name,isPrivate,pushedAt)

if [[ -z "$repos_json" || "$repos_json" == "[]" ]]; then
  echo "ERROR: repo discovery returned nothing — check SECURITY_MONITOR_TOKEN." >&2
  exit 1
fi

# --- STEP 2: load prior state ------------------------------------------------
if [[ -f "$STATE_FILE" ]]; then
  prior_state=$(cat "$STATE_FILE")
else
  prior_state='{"repos":{}}'
fi
first_run=$(jq -r '(.repos // {}) | length == 0' <<<"$prior_state")

repo_names=$(jq -r '.[].name' <<<"$repos_json")

: > "$WORKDIR/current_repos.jsonl"
: > "$WORKDIR/findings.jsonl"       # actionable — goes in the report
: > "$WORKDIR/rollup.jsonl"         # chronic never-enabled — one line each

for repo in $repo_names; do
  is_private=$(jq -r --arg r "$repo" '.[] | select(.name==$r) | .isPrivate' <<<"$repos_json")
  pushed_at=$(jq -r --arg r "$repo" '.[] | select(.name==$r) | .pushedAt' <<<"$repos_json")
  prior_repo=$(jq -c --arg r "$repo" '.repos[$r] // null' <<<"$prior_state")

  # --- Dependabot alerts ---
  dependabot_json="null"
  # `alerts` = every OPEN alert, always a valid JSON array — read later under `set -u`.
  # No --jq on the paginated fetch: gh api auto-merges multi-page array responses into
  # one array only when --jq isn't used; a per-page --jq '[...]' filter (the earlier bug)
  # instead concatenates one array PER PAGE, which breaks on any repo with enough alerts
  # to span pages (this bit 402found at 122 open alerts, several pages).
  alerts='[]'
  if raw=$(GH_TOKEN="$SECURITY_TOKEN" gh api --paginate \
      "repos/$OWNER/$repo/dependabot/alerts" 2>"$WORKDIR/err"); then
    alerts=$(jq '[.[] | select(.state=="open")]' <<<"$raw")
    counts=$(jq 'reduce .[] as $a ({critical:0,high:0,medium:0,low:0,unknown:0};
              ($a.security_advisory.severity) as $s |
              if $s=="critical" then .critical+=1
              elif $s=="high" then .high+=1
              elif $s=="medium" or $s=="moderate" then .medium+=1
              elif $s=="low" then .low+=1
              else .unknown+=1 end)' <<<"$alerts")
    keys=$(jq '[.[] | (.security_advisory.ghsa_id + "|" + (.dependency.manifest_path // "unknown"))]' <<<"$alerts")
    dependabot_json=$(jq -n --argjson c "$counts" --argjson k "$keys" \
      '{critical:$c.critical, high:$c.high, medium:$c.medium, low:$c.low, alert_keys:$k}')
  elif grep -qi "disabled for this repository\|HTTP 404\|not enabled" "$WORKDIR/err"; then
    # GitHub returns this for "Dependabot alerts turned off", which isn't a 404 —
    # matching only "HTTP 404" (as STEP 3 originally assumed) missed this case,
    # so it was falling into the real-error branch below instead.
    dependabot_json='"disabled"'
    alerts='[]'
  else
    dependabot_json="null"
    alerts='[]'
    echo "WARN: dependabot alerts fetch failed for $repo: $(cat "$WORKDIR/err")" >&2
  fi

  # --- security_and_analysis (secret scanning / push protection) ---
  sec_json=$(GH_TOKEN="$SECURITY_TOKEN" gh api "repos/$OWNER/$repo" \
    --jq '.security_and_analysis // {}' 2>/dev/null || echo '{}')
  secret_scanning_enabled=$(jq -r '(.secret_scanning.status // "disabled") == "enabled"' <<<"$sec_json")
  push_protection_enabled=$(jq -r '(.secret_scanning_push_protection.status // "disabled") == "enabled"' <<<"$sec_json")

  # --- vulnerability-alerts toggle ---
  vuln_status=$(GH_TOKEN="$SECURITY_TOKEN" gh api -i "repos/$OWNER/$repo/vulnerability-alerts" \
    2>/dev/null | head -1 || true)
  if grep -q "204" <<<"$vuln_status"; then
    vulnerability_alerts_enabled="true"
  else
    vulnerability_alerts_enabled="false"
  fi

  # --- code scanning alerts ---
  code_scanning_json="null"
  if cs_alerts=$(GH_TOKEN="$SECURITY_TOKEN" gh api --paginate \
      "repos/$OWNER/$repo/code-scanning/alerts?state=open" 2>"$WORKDIR/cserr"); then
    cs_counts=$(jq 'reduce .[] as $a ({critical:0,high:0,medium:0,low:0,unknown:0};
        (($a.rule.security_severity_level // $a.rule.severity // "unknown")) as $s |
        if $s=="critical" then .critical+=1
        elif $s=="high" or $s=="error" then .high+=1
        elif $s=="medium" or $s=="moderate" or $s=="warning" then .medium+=1
        elif $s=="low" or $s=="note" then .low+=1
        else .unknown+=1 end)' <<<"$cs_alerts")
    code_scanning_json=$(jq -n --argjson c "$cs_counts" '{enabled:true} + $c')
  else
    code_scanning_json='{"enabled": false}'
  fi

  # --- manual secret sweep fallback, only if secret scanning is off ---
  secret_hits="[]"
  if [[ "$secret_scanning_enabled" != "true" ]]; then
    hits=()
    for pattern in 'sk_live' 'sk_test' 'AKIA' 'AIza' 'ghp_' 'BEGIN PRIVATE KEY'; do
      encoded=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$pattern")
      count=$(GH_TOKEN="$SECURITY_TOKEN" gh api "search/code?q=repo:$OWNER/$repo+%22$encoded%22" \
        --jq '.total_count' 2>/dev/null || echo 0)
      if [[ "$count" != "0" && -n "$count" ]]; then
        hits+=("{\"pattern\":\"$pattern\",\"count\":$count}")
      fi
      sleep 8
    done
    if [[ ${#hits[@]} -gt 0 ]]; then
      secret_hits=$(printf '%s\n' "${hits[@]}" | jq -s '.')
    fi
  fi

  # --- assemble this repo's current-state record ---
  current=$(jq -n \
    --arg name "$repo" \
    --argjson private "$is_private" \
    --arg pushed_at "$pushed_at" \
    --argjson dependabot "$dependabot_json" \
    --argjson secret_scanning_enabled "$secret_scanning_enabled" \
    --argjson push_protection_enabled "$push_protection_enabled" \
    --argjson code_scanning "$code_scanning_json" \
    --argjson vulnerability_alerts_enabled "$vulnerability_alerts_enabled" \
    '{name:$name, private:$private, pushed_at:$pushed_at, dependabot:$dependabot,
      secret_scanning_enabled:$secret_scanning_enabled,
      push_protection_enabled:$push_protection_enabled,
      code_scanning:$code_scanning,
      vulnerability_alerts_enabled:$vulnerability_alerts_enabled}')
  echo "$current" >> "$WORKDIR/current_repos.jsonl"

  # --- STEP 4: diff against last week (skip entirely on first run) ---
  if [[ "$first_run" != "true" && "$prior_repo" != "null" ]]; then
    # `prior_repo` is the whole repo record (so .dependabot.alert_keys is right),
    # but `dependabot_json` IS the dependabot value itself — already one level in.
    # It can also be a bare JSON string ("disabled"/"null" rather than an object),
    # which .alert_keys can't be applied to at all (indexing a string errors,
    # it doesn't just return null) — this was crashing on any "disabled" repo,
    # and silently always returning [] for real ones the rest of the time,
    # since ".dependabot" doesn't exist as a field on an already-unwrapped object.
    # same guard as cur_keys below: prior_repo.dependabot can itself be the
    # bare string "disabled"/"null" (not nested inside another object), and
    # `.dependabot.alert_keys` errors outright on that — `// []` only catches
    # null/false, not a genuine indexing-a-string error, so this would crash
    # again next week the first time a repo's *prior* value was "disabled".
    prior_keys=$(jq -c '(.dependabot // {}) | if type == "object" then (.alert_keys // []) else [] end' <<<"$prior_repo")
    cur_keys=$(jq -c 'if type == "object" then (.alert_keys // []) else [] end' <<<"$dependabot_json")
    new_keys=$(jq -c -n --argjson a "$cur_keys" --argjson b "$prior_keys" '$a - $b')
    new_count=$(jq 'length' <<<"$new_keys")
    if [[ "$new_count" -gt 0 ]]; then
      # only flag as urgent if any new key belongs to a critical/high alert
      new_high_crit=$(jq --argjson alerts "$alerts" -c '
        . as $newkeys |
        [$alerts[] | select((.security_advisory.severity=="critical" or .security_advisory.severity=="high"))
          | (.security_advisory.ghsa_id + "|" + (.dependency.manifest_path // "unknown"))
          | select(. as $k | $newkeys | index($k) != null)]' <<<"$new_keys" 2>/dev/null || echo '[]')
      nhc_count=$(jq 'length' <<<"$new_high_crit" 2>/dev/null || echo 0)
      if [[ "$nhc_count" -gt 0 ]]; then
        echo "{\"repo\":\"$repo\",\"type\":\"new_critical_high\",\"detail\":$new_high_crit}" >> "$WORKDIR/findings.jsonl"
      fi
    fi

    for field in secret_scanning_enabled push_protection_enabled vulnerability_alerts_enabled; do
      prior_val=$(jq -r --arg f "$field" '.[$f] // false' <<<"$prior_repo")
      cur_val=$(jq -n --argjson v "${!field}" '$v')
      if [[ "$prior_val" == "true" && "$cur_val" == "false" ]]; then
        echo "{\"repo\":\"$repo\",\"type\":\"regression\",\"field\":\"$field\"}" >> "$WORKDIR/findings.jsonl"
      elif [[ "$prior_val" == "false" && "$cur_val" == "false" ]]; then
        echo "{\"repo\":\"$repo\",\"field\":\"$field\"}" >> "$WORKDIR/rollup.jsonl"
      fi
    done
  elif [[ "$first_run" != "true" && "$prior_repo" == "null" ]]; then
    echo "{\"repo\":\"$repo\",\"type\":\"new_repo\"}" >> "$WORKDIR/findings.jsonl"
  fi

  if [[ "$(jq 'length' <<<"$secret_hits")" -gt 0 ]]; then
    echo "{\"repo\":\"$repo\",\"type\":\"secret_hits\",\"detail\":$secret_hits}" >> "$WORKDIR/findings.jsonl"
  fi
  if [[ "$dependabot_json" == '"disabled"' ]]; then
    prior_dependabot=$(jq -r '.dependabot // "null"' <<<"$prior_repo")
    if [[ "$prior_dependabot" != '"disabled"' ]]; then
      echo "{\"repo\":\"$repo\",\"type\":\"dependabot_disabled\"}" >> "$WORKDIR/findings.jsonl"
    else
      echo "{\"repo\":\"$repo\",\"field\":\"dependabot\"}" >> "$WORKDIR/rollup.jsonl"
    fi
  fi
  if [[ "$dependabot_json" == "null" ]]; then
    # real fetch error (not just "disabled") — surface it so a bad token/permission
    # doesn't silently look like "nothing to report" week after week
    echo "{\"repo\":\"$repo\",\"type\":\"dependabot_fetch_error\"}" >> "$WORKDIR/findings.jsonl"
  fi
done

# --- STEP 5: write new state -------------------------------------------------
new_repos=$(jq -s 'map({(.name): del(.name)}) | add' "$WORKDIR/current_repos.jsonl")
jq -n --argjson repos "$new_repos" --arg last_run "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{repos:$repos, last_run:$last_run}' > "$STATE_FILE"

# --- STEP 6: build the report ------------------------------------------------
findings=$(jq -s '.' "$WORKDIR/findings.jsonl" 2>/dev/null || echo '[]')
rollup=$(jq -s 'group_by(.field) | map({field: .[0].field, repos: [.[].repo]})' "$WORKDIR/rollup.jsonl" 2>/dev/null || echo '[]')
n_repos=$(jq -r 'length' <<<"$repos_json")
n_findings=$(jq 'length' <<<"$findings")

{
  echo "## Weekly Security Monitor — $(date -u +%Y-%m-%d)"
  echo
  if [[ "$first_run" == "true" ]]; then
    echo "First run — baseline established for $n_repos repos. Nothing to diff yet."
    echo
  fi
  if [[ "$n_findings" -eq 0 ]]; then
    if [[ "$first_run" != "true" ]]; then
      echo "No new security issues this week — $n_repos repos checked, all clean/unchanged."
    fi
  else
    echo "**$n_findings finding(s):**"
    echo
    jq -r '.[] | "- **\(.repo)**: \(.type)" + (if .field then " (\(.field))" else "" end) +
      (if .detail then " — \(.detail | tostring)" else "" end)' <<<"$findings"
  fi
  if [[ "$(jq 'length' <<<"$rollup")" -gt 0 ]]; then
    echo
    echo "_Chronically never enabled (unchanged from prior runs, not repeated in detail):_"
    jq -r '.[] | "- \(.field): " + (.repos | join(", "))' <<<"$rollup"
  fi
} > "$WORKDIR/report.md"

cat "$WORKDIR/report.md" >> "${GITHUB_STEP_SUMMARY:-/dev/stdout}"

# Open an issue (→ email/notification) whenever there's something actionable,
# even on a first run — e.g. a broken token should be visible immediately,
# not hidden behind "baseline established".
if [[ "$n_findings" -gt 0 ]]; then
  issue_title="Security monitor: $n_findings finding(s) — $(date -u +%Y-%m-%d)"
  if ! GH_TOKEN="$GITHUB_TOKEN" gh issue create --repo "$OWNER/402found" \
      --title "$issue_title" --label "security-monitor" --body-file "$WORKDIR/report.md" \
      2>"$WORKDIR/issueerr"; then
    # most likely cause: the "security-monitor" label doesn't exist yet — the
    # issue itself (i.e. the notification) matters more than the label, so
    # retry once without it rather than silently skipping the issue entirely.
    echo "WARN: issue create with label failed ($(cat "$WORKDIR/issueerr")); retrying without a label" >&2
    GH_TOKEN="$GITHUB_TOKEN" gh issue create --repo "$OWNER/402found" \
      --title "$issue_title" --body-file "$WORKDIR/report.md"
  fi
fi
