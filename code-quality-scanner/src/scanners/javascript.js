/**
 * JavaScript / TypeScript scanner — uses Acorn AST where possible,
 * falls back to regex for patterns AST doesn't cover easily.
 */

import { parse } from "acorn";
import * as walk from "acorn-walk";

export function scanJavaScript(code) {
  const issues = [];
  const push = (line, severity, message, fix) =>
    issues.push({ line, severity, message, fix });

  const lines = code.split("\n");

  // --- Try AST-based analysis first ---
  let ast = null;
  try {
    ast = parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
      locations: true,
      allowReturnOutsideFunction: true,
      allowImportExportEverywhere: true,
    });
  } catch {
    // If parse fails (e.g. TypeScript syntax), fall back to regex-only
  }

  let hasTryCatch = false;
  let hasStructuredLogging = false;
  let consoleLogCount = 0;

  if (ast) {
    walk.simple(ast, {
      TryStatement() {
        hasTryCatch = true;
      },

      CallExpression(node) {
        const ln = node.loc?.start.line ?? 0;

        // eval()
        if (node.callee.type === "Identifier" && node.callee.name === "eval") {
          push(
            ln,
            "CRITICAL",
            "eval() usage — arbitrary code execution risk",
            "Use JSON.parse() for data, or refactor to avoid dynamic evaluation"
          );
        }

        // Function() constructor (hidden eval)
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "Function"
        ) {
          push(
            ln,
            "CRITICAL",
            "new Function() — equivalent to eval(), arbitrary code execution risk",
            "Refactor to use explicit function definitions"
          );
        }

        // console.log detection
        if (
          node.callee.type === "MemberExpression" &&
          node.callee.object?.name === "console" &&
          node.callee.property?.name === "log"
        ) {
          consoleLogCount++;
        }

        // Structured logging detection
        if (
          node.callee.type === "MemberExpression" &&
          /^(logger|log|winston|pino|bunyan)$/.test(
            node.callee.object?.name ?? ""
          )
        ) {
          hasStructuredLogging = true;
        }
      },

      // Unbounded loops
      WhileStatement(node) {
        const ln = node.loc?.start.line ?? 0;
        if (
          node.test.type === "Literal" &&
          node.test.value === true
        ) {
          push(
            ln,
            "HIGH",
            "while(true) loop — risk of infinite execution",
            "Add a break condition, counter, or timeout guard"
          );
        }
      },

      ForStatement(node) {
        const ln = node.loc?.start.line ?? 0;
        if (!node.test) {
          push(
            ln,
            "HIGH",
            "for(;;) infinite loop without test condition",
            "Add an explicit termination condition"
          );
        }
      },
    });
  }

  // --- Regex-based checks (works even if AST parse failed) ---
  for (let i = 0; i < lines.length; i++) {
    const ln = i + 1;
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("//") || trimmed === "") continue;

    // Hardcoded secrets
    if (
      /(?:api[_-]?key|secret|password|token|credential)\s*[:=]\s*["'][^"']{8,}/i.test(
        line
      )
    ) {
      push(
        ln,
        "CRITICAL",
        "Hardcoded secret or API key detected",
        "Move to environment variables: process.env.KEY_NAME"
      );
    }

    // eval in case AST missed it (TS files)
    if (!ast && /\beval\s*\(/.test(line)) {
      push(
        ln,
        "CRITICAL",
        "eval() usage — arbitrary code execution risk",
        "Use JSON.parse() for data, or refactor to avoid dynamic evaluation"
      );
    }

    // No input validation on route handlers
    if (
      /\b(req\.body|req\.query|req\.params|request\.body)\b/.test(line)
    ) {
      const surrounding = lines.slice(i, i + 8).join("\n");
      if (
        !/\b(validate|schema|zod|joi|yup|assert|check|typeof|instanceof)\b/i.test(
          surrounding
        )
      ) {
        push(
          ln,
          "HIGH",
          "Request input accessed without validation",
          "Use a validation library (zod, joi) or add explicit type/range checks"
        );
      }
    }

    // No rate limiting on external API calls
    if (
      /\b(fetch|axios|got|request|https?\.request|openai|anthropic)\s*[.(]/i.test(
        line
      )
    ) {
      const surrounding = lines
        .slice(Math.max(0, i - 5), i + 5)
        .join("\n");
      if (
        !/\b(rate.?limit|throttle|sleep|backoff|retry|p-limit|bottleneck|semaphore)\b/i.test(
          surrounding
        )
      ) {
        push(
          ln,
          "MEDIUM",
          "External API call without rate limiting or backoff",
          "Add rate limiting (e.g., p-limit, bottleneck, or exponential backoff)"
        );
      }
    }

    // Prompt injection
    if (
      /\b(openai|anthropic|llm|chat|completion)\b/i.test(line) &&
      /\$\{|`.*\+.*`|\.concat\(|template/i.test(line)
    ) {
      push(
        ln,
        "HIGH",
        "User input interpolated into LLM prompt — prompt injection risk",
        "Sanitize user input, use parameterized templates, add input/output guardrails"
      );
    }

    // try/catch fallback detection
    if (/\btry\s*\{/.test(line)) hasTryCatch = true;
    if (/\b(winston|pino|bunyan|logger)\b/.test(line))
      hasStructuredLogging = true;
  }

  // --- File-level checks ---
  if (!hasTryCatch && lines.length > 10) {
    push(
      0,
      "HIGH",
      "No error handling (try/catch) found in file",
      "Wrap async operations and critical logic in try/catch blocks"
    );
  }

  if (consoleLogCount > 0 && !hasStructuredLogging) {
    push(
      0,
      "MEDIUM",
      `console.log used ${consoleLogCount} time(s) as only debugging method`,
      "Replace with structured logging (winston, pino, or bunyan)"
    );
  }

  if (!hasStructuredLogging && lines.length > 15) {
    push(
      0,
      "MEDIUM",
      "No structured logging or observability found",
      "Add a logging library (winston, pino) with log levels and structured output"
    );
  }

  return issues;
}
