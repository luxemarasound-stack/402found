import { LeakSignal, SentinelResult } from "./types.js";

// Context window: characters around a match to include
const CONTEXT_WINDOW = 40;

function extractContext(text: string, start: number, end: number): string {
  const from = Math.max(0, start - CONTEXT_WINDOW);
  const to = Math.min(text.length, end + CONTEXT_WINDOW);
  let ctx = text.slice(from, to).replace(/\n/g, " ");
  if (from > 0) ctx = "..." + ctx;
  if (to < text.length) ctx = ctx + "...";
  return ctx;
}

interface Pattern {
  type: string;
  regex: RegExp;
  confidence: "high" | "medium" | "low";
  validate?: (match: string) => boolean;
}

// Deep second-pass patterns — catches what standard PII scrubbers miss
const PATTERNS: Pattern[] = [
  // --- Credentials & secrets ---
  {
    type: "jwt_token",
    regex: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    confidence: "high",
  },
  {
    type: "bearer_token",
    regex: /(?:Bearer|token|Authorization)[:\s]+[A-Za-z0-9_\-./+]{20,}/gi,
    confidence: "high",
  },
  {
    type: "private_key",
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    confidence: "high",
  },
  {
    type: "aws_key",
    regex: /(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}/g,
    confidence: "high",
  },
  {
    type: "generic_secret",
    regex: /(?:password|passwd|secret|token|api_key|apikey|api-key|access_key|private_key)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
    confidence: "high",
  },
  {
    type: "connection_string",
    regex: /(?:mongodb|postgres|mysql|redis|amqp|sqlite):\/\/[^\s'"]{10,}/gi,
    confidence: "high",
  },
  // --- Financial ---
  {
    type: "iban",
    regex: /\b[A-Z]{2}\d{2}[\s]?[\dA-Z]{4}[\s]?(?:[\dA-Z]{4}[\s]?){1,7}[\dA-Z]{1,4}\b/g,
    confidence: "medium",
    validate: (m: string) => /^[A-Z]{2}\d{2}/.test(m.replace(/\s/g, "")),
  },
  {
    type: "swift_bic",
    regex: /\b[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/g,
    confidence: "low",
    validate: (m: string) => m.length >= 8 && m.length <= 11,
  },
  {
    type: "crypto_wallet",
    regex: /\b(?:0x[a-fA-F0-9]{40}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{39,59})\b/g,
    confidence: "medium",
  },
  // --- Personal identifiers ---
  {
    type: "passport_number",
    regex: /\b[A-Z]{1,2}\d{6,9}\b/g,
    confidence: "low",
    validate: (m: string) => m.length >= 7 && m.length <= 11,
  },
  {
    type: "date_of_birth",
    regex: /\b(?:born|dob|date of birth|birthday)[:\s]+\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b/gi,
    confidence: "medium",
  },
  {
    type: "medical_record",
    regex: /\b(?:MRN|patient\s*(?:id|#|number)|medical\s*record)[:\s]*[A-Z0-9\-]{4,20}\b/gi,
    confidence: "high",
  },
  {
    type: "drivers_license",
    regex: /\b(?:DL|driver'?s?\s*(?:license|licence))[:\s#]*[A-Z0-9\-]{5,15}\b/gi,
    confidence: "medium",
  },
  // --- Internal infrastructure ---
  {
    type: "internal_ip",
    regex: /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/g,
    confidence: "medium",
  },
  {
    type: "internal_hostname",
    regex: /\b[a-z][a-z0-9\-]+\.(?:internal|local|corp|intranet|private|lan)\b/gi,
    confidence: "medium",
  },
  {
    type: "file_path_leak",
    regex: /(?:\/(?:home|Users|etc|var|root)\/[^\s'"]{5,}|[A-Z]:\\(?:Users|Documents|AppData)\\[^\s'"]{5,})/g,
    confidence: "medium",
  },
  // --- Encoded data that may contain secrets ---
  {
    type: "base64_blob",
    regex: /\b[A-Za-z0-9+/]{40,}={0,2}\b/g,
    confidence: "low",
    validate: (m: string) => {
      // Must be valid base64 length
      return m.replace(/=/g, "").length % 4 <= 1;
    },
  },
];

export function scanForLeaks(text: string): SentinelResult {
  const leaks: LeakSignal[] = [];
  const categoriesFound = new Set<string>();

  for (const pattern of PATTERNS) {
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.regex.exec(text)) !== null) {
      const matchText = match[0];

      // Run optional validator
      if (pattern.validate && !pattern.validate(matchText)) continue;

      categoriesFound.add(pattern.type);
      leaks.push({
        type: pattern.type,
        match: maskMatch(matchText),
        context: extractContext(text, match.index, match.index + matchText.length),
        confidence: pattern.confidence,
      });
    }
  }

  return {
    clean: leaks.length === 0,
    leak_count: leaks.length,
    leaks,
    categories_found: Array.from(categoriesFound),
  };
}

// Mask the middle of sensitive matches so we don't echo the secret back
function maskMatch(value: string): string {
  if (value.length <= 8) return value.slice(0, 2) + "***";
  const show = Math.min(4, Math.floor(value.length * 0.2));
  return value.slice(0, show) + "***" + value.slice(-show);
}
