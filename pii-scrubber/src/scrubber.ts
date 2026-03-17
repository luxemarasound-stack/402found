import { PIIType, ScrubResult } from "./types.js";

// Each pattern maps a PII type to a regex and its replacement placeholder
const PII_PATTERNS: { type: PIIType; pattern: RegExp; replacement: string }[] = [
  // SSN: 123-45-6789 or 123 45 6789
  {
    type: "ssn",
    pattern: /\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g,
    replacement: "[SSN_REDACTED]",
  },
  // Credit cards: 13-19 digit sequences with optional separators
  {
    type: "credit_card",
    pattern: /\b(?:\d{4}[-\s]?){3}\d{1,7}\b/g,
    replacement: "[CREDIT_CARD_REDACTED]",
  },
  // API keys: common patterns (AWS, generic hex/base64 keys 20+ chars)
  {
    type: "api_key",
    pattern: /\b(?:AKIA[0-9A-Z]{16}|sk[-_]live[-_][a-zA-Z0-9]{24,}|sk[-_]test[-_][a-zA-Z0-9]{24,}|ghp_[a-zA-Z0-9]{36,}|xox[bpras]-[a-zA-Z0-9\-]{10,})\b/g,
    replacement: "[API_KEY_REDACTED]",
  },
  // Email addresses
  {
    type: "email",
    pattern: /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/g,
    replacement: "[EMAIL_REDACTED]",
  },
  // US phone numbers: various formats
  {
    type: "phone",
    pattern: /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g,
    replacement: "[PHONE_REDACTED]",
  },
  // IPv4 addresses
  {
    type: "ip_address",
    pattern: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
    replacement: "[IP_REDACTED]",
  },
  // US street addresses: number + street name + suffix
  {
    type: "street_address",
    pattern: /\b\d{1,6}\s+(?:[A-Z][a-zA-Z]*\s+){1,4}(?:St(?:reet)?|Ave(?:nue)?|Blvd|Boulevard|Dr(?:ive)?|Ln|Lane|Rd|Road|Ct|Court|Pl(?:ace)?|Way|Cir(?:cle)?|Pkwy|Parkway)\.?\b/gi,
    replacement: "[ADDRESS_REDACTED]",
  },
];

export function scrubPII(text: string): ScrubResult {
  let scrubbed = text;
  const typesFound = new Set<PIIType>();
  let itemsRemoved = 0;

  for (const { type, pattern, replacement } of PII_PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    const matches = scrubbed.match(pattern);
    if (matches) {
      itemsRemoved += matches.length;
      typesFound.add(type);
      scrubbed = scrubbed.replace(pattern, replacement);
    }
  }

  return {
    scrubbed,
    items_removed: itemsRemoved,
    types_found: Array.from(typesFound),
  };
}
