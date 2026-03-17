import { DetectionResult, InjectionPattern } from "./types.js";

// --- Pattern detectors ---

// 1. Instruction overrides — attempts to override or reset system instructions
const INSTRUCTION_OVERRIDE_RE =
  /\b(?:ignore\s+(?:all\s+)?(?:previous|above|prior|earlier)\s+(?:instructions?|prompts?|rules?|directions?|guidelines?)|disregard\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions?|prompts?|rules?)|forget\s+(?:everything|all|your)\s+(?:above|previous|prior|instructions?|rules?)|override\s+(?:your|the|all)\s+(?:instructions?|rules?|guidelines?|constraints?)|new\s+instructions?\s*[:=]|from\s+now\s+on\s*,?\s*(?:you\s+(?:are|will|must|should)|ignore)|reset\s+(?:your|all)\s+(?:instructions?|context|rules?))\b/gi;

function checkInstructionOverride(text: string): InjectionPattern | null {
  const match = text.match(INSTRUCTION_OVERRIDE_RE);
  if (match) {
    return {
      type: "instruction_override",
      matched: match[0],
      reason: "Attempts to override or reset the agent's instructions",
    };
  }
  return null;
}

// 2. Jailbreak attempts — DAN, developer mode, unrestricted mode
const JAILBREAK_RE =
  /\b(?:(?:you\s+are\s+)?(?:now\s+)?(?:DAN|Do\s+Anything\s+Now)|(?:enter|enable|activate|switch\s+to)\s+(?:developer|unrestricted|unfiltered|uncensored|jailbreak|god)\s*(?:mode)?|(?:pretend|act)\s+(?:like\s+)?(?:you\s+(?:have\s+)?(?:no|zero)\s+(?:restrictions?|limitations?|filters?|guardrails?|rules?))|you\s+(?:can|are\s+able\s+to)\s+do\s+anything|(?:remove|disable|turn\s+off|bypass)\s+(?:your\s+)?(?:safety|content)?\s*(?:filters?|restrictions?|guardrails?|limitations?)|without\s+(?:any\s+)?(?:ethical|moral|safety)\s+(?:constraints?|guidelines?|restrictions?)|(?:no\s+(?:ethical|moral|safety)\s+(?:constraints?|guidelines?|restrictions?)))\b/gi;

function checkJailbreak(text: string): InjectionPattern | null {
  const match = text.match(JAILBREAK_RE);
  if (match) {
    return {
      type: "jailbreak",
      matched: match[0],
      reason: "Jailbreak or unrestricted-mode attempt detected",
    };
  }
  return null;
}

// 3. Role-play manipulation — forced persona adoption to bypass safety
const ROLEPLAY_RE =
  /\b(?:(?:you\s+are\s+(?:now\s+)?(?:a\s+)?(?:evil|malicious|unethical|unrestricted|uncensored)\s+\w+)|(?:pretend\s+(?:to\s+be|you\s+are)\s+(?:a\s+)?(?:hacker|criminal|villain|evil|malicious))|(?:roleplay\s+as\s+(?:a\s+)?(?:someone|a\s+person|an?\s+\w+)\s+(?:who|that)\s+(?:has\s+no|doesn't\s+(?:have|follow)|ignores?))|(?:act\s+as\s+(?:if\s+)?(?:you\s+(?:have|had)\s+no\s+(?:rules?|restrictions?|filters?|guardrails?))|(?:in\s+(?:this|the)\s+(?:story|scenario|simulation|game)\s*,?\s*(?:you|the\s+AI)\s+(?:can|must|should|will)\s+(?:do\s+anything|ignore\s+(?:all\s+)?rules?))))\b/gi;

function checkRoleplay(text: string): InjectionPattern | null {
  const match = text.match(ROLEPLAY_RE);
  if (match) {
    return {
      type: "roleplay_manipulation",
      matched: match[0],
      reason: "Attempts to force a persona to bypass safety constraints",
    };
  }
  return null;
}

// 4. System prompt leakage — attempts to extract the system prompt
const LEAKAGE_RE =
  /\b(?:(?:(?:show|reveal|display|print|output|repeat|recite|list|tell\s+me|give\s+me|what\s+(?:is|are))\s+(?:your\s+)?(?:system\s+(?:prompt|message|instructions?)|initial\s+(?:prompt|instructions?)|hidden\s+(?:prompt|instructions?)|(?:original|full|complete|entire)\s+(?:prompt|instructions?)))|(?:(?:what|how)\s+(?:were\s+you|are\s+you)\s+(?:instructed|programmed|configured|prompted|told))|(?:(?:copy|paste|dump|echo)\s+(?:your\s+)?(?:system|initial|hidden|original)\s+(?:prompt|message|instructions?))|(?:between\s+(?:the\s+)?(?:tags|brackets|markers)\s+(?:is|are)\s+(?:your|the)\s+(?:instructions?|prompt)))\b/gi;

function checkLeakage(text: string): InjectionPattern | null {
  const match = text.match(LEAKAGE_RE);
  if (match) {
    return {
      type: "system_prompt_leakage",
      matched: match[0],
      reason: "Attempts to extract or reveal the system prompt",
    };
  }
  return null;
}

// 5. Hidden instructions — encoded, invisible, or delimiter-based injection
const HIDDEN_INSTRUCTION_RE =
  /(?:\[SYSTEM\]|\[INST\]|\<\|system\|\>|\<\|im_start\|>|<\|endoftext\|>|<<SYS>>|<\/s>|###\s*(?:System|Instruction|Human|Assistant)\s*:)/gi;

function checkHiddenInstructions(text: string): InjectionPattern | null {
  const match = text.match(HIDDEN_INSTRUCTION_RE);
  if (match) {
    return {
      type: "hidden_instruction",
      matched: match[0],
      reason: "Contains model-specific delimiters or hidden instruction markers",
    };
  }
  return null;
}

// 6. Encoding/obfuscation — base64, hex, rot13 markers, unicode tricks
const ENCODING_RE =
  /(?:\b(?:base64|rot13|hex)\s*(?:decode|encode|:)\s*|(?:eval|decode|atob|btoa)\s*\(|\\u[0-9a-fA-F]{4}(?:\\u[0-9a-fA-F]{4}){3,}|\\x[0-9a-fA-F]{2}(?:\\x[0-9a-fA-F]{2}){3,})/gi;

function checkEncoding(text: string): InjectionPattern | null {
  const match = text.match(ENCODING_RE);
  if (match) {
    return {
      type: "encoding_obfuscation",
      matched: match[0],
      reason: "Contains encoded or obfuscated content that may hide instructions",
    };
  }
  return null;
}

// 7. Context manipulation — "previous conversation", fake user/assistant turns
const CONTEXT_MANIPULATION_RE =
  /\b(?:(?:in\s+(?:our|the)\s+previous\s+(?:conversation|chat|session)\s*,?\s*(?:you|we)\s+(?:agreed|decided|said|confirmed))|(?:(?:User|Human|Assistant|System)\s*:\s*.{10,})|(?:(?:end|start)\s+of\s+(?:system|user|assistant)\s+(?:message|prompt|turn))|(?:the\s+(?:user|human)\s+(?:has\s+)?(?:consented|agreed|approved|authorized)\s+(?:to|that)))\b/gi;

function checkContextManipulation(text: string): InjectionPattern | null {
  const match = text.match(CONTEXT_MANIPULATION_RE);
  if (match) {
    return {
      type: "context_manipulation",
      matched: match[0],
      reason: "Fabricates conversation history or context to manipulate behavior",
    };
  }
  return null;
}

// 8. Privilege escalation — claiming admin, root, or special access
const PRIVILEGE_RE =
  /\b(?:(?:i\s+am\s+(?:the|a|an)\s+(?:admin(?:istrator)?|developer|owner|creator|root\s+user|superuser|maintainer)\s+(?:of|for)\s+(?:this|the))|(?:(?:admin|sudo|root|superuser|maintenance)\s+(?:mode|access|override|command))|(?:(?:my|i\s+have)\s+(?:admin|root|elevated|special|override)\s+(?:access|privileges?|permissions?|clearance)))\b/gi;

function checkPrivilegeEscalation(text: string): InjectionPattern | null {
  const match = text.match(PRIVILEGE_RE);
  if (match) {
    return {
      type: "privilege_escalation",
      matched: match[0],
      reason: "Claims elevated privileges or admin access to bypass restrictions",
    };
  }
  return null;
}

const DETECTORS = [
  checkInstructionOverride,
  checkJailbreak,
  checkRoleplay,
  checkLeakage,
  checkHiddenInstructions,
  checkEncoding,
  checkContextManipulation,
  checkPrivilegeEscalation,
];

export function detectInjection(text: string): DetectionResult {
  const patterns: InjectionPattern[] = [];

  for (const detect of DETECTORS) {
    const pattern = detect(text);
    if (pattern) {
      patterns.push(pattern);
    }
  }

  // Confidence: based on number and severity of patterns found
  const patternCount = patterns.length;
  const uniqueTypes = new Set(patterns.map((p) => p.type)).size;

  // High-severity types get extra weight
  const highSeverityTypes = new Set([
    "instruction_override",
    "jailbreak",
    "hidden_instruction",
    "privilege_escalation",
  ]);
  const highSeverityCount = patterns.filter((p) => highSeverityTypes.has(p.type)).length;

  let confidence: number;
  if (patternCount === 0) {
    confidence = 0;
  } else if (patternCount === 1 && highSeverityCount === 0) {
    confidence = 0.3;
  } else if (patternCount === 1 && highSeverityCount === 1) {
    confidence = 0.6;
  } else {
    // Multiple patterns — scale up with diversity and severity
    const base = Math.min(0.5 + uniqueTypes * 0.1 + highSeverityCount * 0.15, 1.0);
    confidence = Math.round(base * 100) / 100;
  }

  let recommendation: "block" | "warn" | "pass";
  if (confidence >= 0.7) {
    recommendation = "block";
  } else if (confidence >= 0.3) {
    recommendation = "warn";
  } else {
    recommendation = "pass";
  }

  return {
    injectionDetected: patternCount > 0,
    confidence,
    patterns,
    recommendation,
  };
}
