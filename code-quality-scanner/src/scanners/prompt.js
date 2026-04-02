/**
 * LLM prompt scanner — detects prompt injection vulnerabilities
 * and other anti-patterns in raw system/user prompts.
 */

export function scanPrompt(code) {
  const issues = [];
  const lines = code.split("\n");
  const push = (line, severity, message, fix) =>
    issues.push({ line, severity, message, fix });

  const fullText = code.toLowerCase();

  for (let i = 0; i < lines.length; i++) {
    const ln = i + 1;
    const line = lines[i];
    const lower = line.toLowerCase();

    // --- Injection surface: user input placeholders without guardrails ---
    if (/\{\{?\s*\w*(user|input|query|message|data)\w*\s*\}?\}/i.test(line)) {
      const surrounding = lines
        .slice(Math.max(0, i - 5), Math.min(lines.length, i + 5))
        .join("\n")
        .toLowerCase();
      if (
        !/\b(sanitize|validate|filter|guard|escape|allowlist|blocklist|reject)\b/.test(
          surrounding
        )
      ) {
        push(
          ln,
          "HIGH",
          "User input placeholder without sanitization guardrail",
          "Add input sanitization before interpolation, or wrap in delimiters with instructions to ignore injected instructions"
        );
      }
    }

    // --- "Ignore previous instructions" susceptibility ---
    if (
      /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|rules|context)/i.test(
        line
      )
    ) {
      push(
        ln,
        "CRITICAL",
        "Prompt contains 'ignore previous instructions' — injection payload or vulnerability",
        "Remove this text. If testing, use a dedicated injection test harness"
      );
    }

    // --- No role/system boundary ---
    if (
      /\b(you are|act as|your role)\b/i.test(line) &&
      !/\b(system|assistant)\s*(message|prompt|role)\b/i.test(
        lines.slice(Math.max(0, i - 3), i + 1).join("\n")
      )
    ) {
      // Only flag if this looks like a system prompt without clear role boundaries
      if (i < 5) {
        push(
          ln,
          "MEDIUM",
          "System prompt lacks explicit role boundary markers",
          "Use clear [SYSTEM] / [USER] delimiters and instruct the model to treat them as boundaries"
        );
      }
    }

    // --- Hardcoded secrets in prompts ---
    if (
      /(?:api[_-]?key|secret|password|token|bearer)\s*[:=]\s*\S{8,}/i.test(
        line
      )
    ) {
      push(
        ln,
        "CRITICAL",
        "Hardcoded credential in prompt text",
        "Never include secrets in prompts. Pass via secure environment variables or a secrets manager"
      );
    }

    // --- Overly permissive instructions ---
    if (
      /\b(do anything|no restrictions|no limits|bypass|override safety|ignore safety)\b/i.test(
        line
      )
    ) {
      push(
        ln,
        "HIGH",
        "Overly permissive instruction may weaken model safety guardrails",
        "Scope the agent's capabilities explicitly. List allowed actions rather than removing restrictions"
      );
    }

    // --- Missing output format specification ---
    // (checked at file level below)

    // --- Unbounded generation ---
    if (/\b(generate|write|create)\b/i.test(line) && /\b(as much|unlimited|everything|all)\b/i.test(line)) {
      push(
        ln,
        "MEDIUM",
        "Unbounded generation instruction — may cause excessive token usage",
        "Add explicit length constraints (e.g., 'in 3 bullet points' or 'max 200 words')"
      );
    }
  }

  // --- File-level checks ---
  if (
    lines.length > 5 &&
    !/\b(json|format|schema|structured|return as|respond with)\b/i.test(
      fullText
    )
  ) {
    push(
      0,
      "LOW",
      "No output format specification found in prompt",
      "Specify expected output format (JSON schema, bullet points, etc.) for reliable downstream parsing"
    );
  }

  if (
    !/\b(do not|don't|must not|never|refuse|decline|cannot)\b/i.test(
      fullText
    ) &&
    lines.length > 5
  ) {
    push(
      0,
      "LOW",
      "No negative constraints / refusal instructions in prompt",
      "Add explicit boundaries: what the agent should NOT do, to reduce misuse surface"
    );
  }

  if (
    /\b(tool|function|action|execute|run|call)\b/i.test(fullText) &&
    !/\b(confirm|approval|human|review|allow)\b/i.test(fullText)
  ) {
    push(
      0,
      "MEDIUM",
      "Agent has tool/action access without human-in-the-loop confirmation",
      "Add confirmation steps for destructive or irreversible actions"
    );
  }

  return issues;
}
