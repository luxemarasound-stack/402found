/**
 * Python code scanner — regex + structural analysis.
 * (Full AST would use a Python subprocess; here we do fast pattern matching
 *  that covers the 10 required anti-patterns reliably for typical agent code.)
 */

export function scanPython(code) {
  const lines = code.split("\n");
  const issues = [];

  const push = (line, severity, message, fix) =>
    issues.push({ line, severity, message, fix });

  // Track structural flags
  let hasTry = false;
  let hasLogging = false;
  let hasTypeHints = false;
  let functionCount = 0;
  let hintedFunctionCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const ln = i + 1;
    const line = lines[i];
    const trimmed = line.trim();

    // Skip comments and blanks
    if (trimmed.startsWith("#") || trimmed === "") continue;

    // --- Hardcoded secrets ---
    if (
      /(?:api[_-]?key|secret|password|token|credential)\s*=\s*["'][^"']{8,}/i.test(
        line
      )
    ) {
      push(
        ln,
        "CRITICAL",
        "Hardcoded secret or API key detected",
        "Move to environment variables: os.environ.get('KEY_NAME') or use a secrets manager"
      );
    }

    // --- eval / exec ---
    if (/\beval\s*\(/.test(line)) {
      push(
        ln,
        "CRITICAL",
        "eval() usage — arbitrary code execution risk",
        "Replace with ast.literal_eval() for data parsing, or refactor to avoid dynamic evaluation"
      );
    }
    if (/\bexec\s*\(/.test(line)) {
      push(
        ln,
        "CRITICAL",
        "exec() usage — arbitrary code execution risk",
        "Refactor to use explicit function calls instead of dynamic code execution"
      );
    }

    // --- Error handling ---
    if (/\btry\s*:/.test(line)) hasTry = true;
    if (/\bexcept\s*:/.test(line) && !/except\s+\w/.test(line)) {
      push(
        ln,
        "HIGH",
        "Bare except clause catches all exceptions including KeyboardInterrupt",
        "Catch specific exceptions: except (ValueError, TypeError) as e:"
      );
    }

    // --- Logging ---
    if (/\b(logging\.|logger\.|log\.)/.test(line)) hasLogging = true;

    // --- print() as only debugging ---
    if (/\bprint\s*\(/.test(line) && !hasLogging) {
      push(
        ln,
        "LOW",
        "print() used instead of structured logging",
        "Use the logging module: import logging; logger = logging.getLogger(__name__)"
      );
    }

    // --- Type hints on functions ---
    const funcMatch = line.match(/^\s*def\s+(\w+)\s*\(/);
    if (funcMatch) {
      functionCount++;
      if (/->/.test(line)) {
        hintedFunctionCount++;
      }
    }

    // --- Unbounded loops ---
    if (/\bwhile\s+True\s*:/.test(line)) {
      // Check next few lines for break
      const next5 = lines.slice(i + 1, i + 6).join("\n");
      if (!/\bbreak\b/.test(next5)) {
        push(
          ln,
          "HIGH",
          "Unbounded while True loop without visible break condition",
          "Add explicit break condition or use a counter/timeout to prevent infinite loops"
        );
      }
    }

    // --- Recursion without depth limit ---
    if (funcMatch) {
      const funcName = funcMatch[1];
      const body = lines.slice(i + 1, i + 30).join("\n");
      if (
        new RegExp(`\\b${funcName}\\s*\\(`).test(body) &&
        !/max_depth|depth|limit|level/i.test(body)
      ) {
        push(
          ln,
          "MEDIUM",
          `Recursive function '${funcName}' without apparent depth limit`,
          "Add a depth/limit parameter with a maximum recursion guard"
        );
      }
    }

    // --- No input validation (functions accepting user/external data) ---
    if (
      funcMatch &&
      /\b(user|input|request|payload|data|body|query|params)\b/i.test(line)
    ) {
      const body = lines.slice(i + 1, i + 10).join("\n");
      if (
        !/\b(isinstance|assert|validate|check|if\s+not|raise\s+ValueError|raise\s+TypeError)\b/.test(
          body
        )
      ) {
        push(
          ln,
          "HIGH",
          "Function accepts external input without visible validation",
          "Add input validation: check types, ranges, and sanitize strings before use"
        );
      }
    }

    // --- No rate limiting on API calls ---
    if (
      /\b(requests\.(get|post|put|delete|patch)|httpx\.|aiohttp\.|urllib\.request|openai\.|anthropic\.)/i.test(
        line
      )
    ) {
      const surrounding = lines.slice(Math.max(0, i - 5), i + 5).join("\n");
      if (
        !/\b(rate.?limit|throttle|sleep|backoff|retry|semaphore|limit)\b/i.test(
          surrounding
        )
      ) {
        push(
          ln,
          "MEDIUM",
          "External API call without rate limiting or backoff",
          "Add rate limiting (e.g., time.sleep, tenacity @retry, or a semaphore)"
        );
      }
    }

    // --- Prompt injection (LLM calls) ---
    if (
      /\b(openai|anthropic|llm|chat|completion)\b/i.test(line) &&
      /f["']|\.format\(|%\s/.test(line)
    ) {
      push(
        ln,
        "HIGH",
        "User input interpolated directly into LLM prompt — prompt injection risk",
        "Sanitize user input, use parameterized prompt templates, and add input/output guardrails"
      );
    }
  }

  // --- File-level checks ---
  if (!hasTry && lines.length > 10) {
    push(
      0,
      "HIGH",
      "No error handling (try/except) found in file",
      "Wrap critical operations in try/except blocks with specific exception types"
    );
  }

  if (!hasLogging && lines.length > 15) {
    push(
      0,
      "MEDIUM",
      "No logging or observability instrumentation found",
      "Add structured logging: import logging; logger = logging.getLogger(__name__)"
    );
  }

  if (functionCount > 0 && hintedFunctionCount / functionCount < 0.5) {
    push(
      0,
      "LOW",
      `Only ${hintedFunctionCount}/${functionCount} functions have return type hints`,
      "Add type hints to function signatures: def func(x: str) -> dict:"
    );
  }

  return issues;
}
