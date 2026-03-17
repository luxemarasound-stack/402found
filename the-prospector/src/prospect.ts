import { ProspectInput, AgentCard, ProspectResult } from "./types.js";

const FETCH_TIMEOUT = 8_000;
const REGISTRY_URL = process.env.REGISTRY_URL ?? "https://card-registry.fly.dev";

// Stable structured sources only — never scrape HTML
const PROBE_PATHS = [
  "/.well-known/agent-card.json",
  "/.well-known/ai-plugin.json",
  "/llms.txt",
  "/robots.txt",
  "/sitemap.xml",
] as const;

async function safeFetch(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "402found.dev Prospector/1.0" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// Derive a human-readable name from the domain
function domainToName(domain: string): string {
  return domain
    .replace(/^www\./, "")
    .split(".")[0]
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Pull description from llms.txt if available
function parseLlmsTxt(text: string): { description?: string; capabilities?: string[] } {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const description = lines[0] ?? undefined;
  // Lines starting with "- " are often capability-like items
  const capabilities = lines.filter((l) => l.startsWith("- ")).map((l) => l.slice(2));
  return { description, capabilities: capabilities.length > 0 ? capabilities : undefined };
}

// Extract sitemap URLs as potential endpoint hints
function parseSitemapUrls(xml: string): string[] {
  const urls: string[] = [];
  const re = /<loc>(.*?)<\/loc>/g;
  let match;
  while ((match = re.exec(xml)) !== null) {
    urls.push(match[1]);
  }
  return urls.slice(0, 20);
}

// Identify API-like paths from sitemap or robots.txt
function findApiPaths(urls: string[]): Record<string, string> {
  const endpoints: Record<string, string> = {};
  const apiPatterns = [/\/api\b/i, /\/v\d+\b/i, /\/graphql\b/i, /\/rest\b/i, /\/mcp\b/i];

  for (const url of urls) {
    for (const pattern of apiPatterns) {
      if (pattern.test(url)) {
        try {
          const path = new URL(url).pathname;
          endpoints[path] = path;
        } catch { /* skip malformed */ }
        break;
      }
    }
  }
  return endpoints;
}

// Parse robots.txt for sitemap references and disallowed hints
function parseRobotsTxt(text: string): { sitemaps: string[]; hints: string[] } {
  const sitemaps: string[] = [];
  const hints: string[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.toLowerCase().startsWith("sitemap:")) {
      sitemaps.push(trimmed.slice(8).trim());
    }
    if (trimmed.toLowerCase().startsWith("allow:")) {
      hints.push(trimmed.slice(6).trim());
    }
  }
  return { sitemaps, hints };
}

export async function prospect(input: ProspectInput): Promise<ProspectResult> {
  const baseUrl = input.url.replace(/\/+$/, "");
  const domain = extractDomain(baseUrl);
  const sourcesChecked: string[] = [];

  // Collected intelligence from probes
  let existingCard: Partial<AgentCard> | null = null;
  let llmsInfo: { description?: string; capabilities?: string[] } = {};
  let discoveredEndpoints: Record<string, string> = {};
  let allUrls: string[] = [];

  // Probe all stable sources in parallel
  const probeResults = await Promise.all(
    PROBE_PATHS.map(async (path) => {
      const url = `${baseUrl}${path}`;
      const content = await safeFetch(url);
      sourcesChecked.push(url);
      return { path, content };
    })
  );

  for (const { path, content } of probeResults) {
    if (!content) continue;

    if (path === "/.well-known/agent-card.json") {
      try {
        existingCard = JSON.parse(content);
      } catch { /* malformed JSON */ }
    }

    if (path === "/.well-known/ai-plugin.json") {
      try {
        const plugin = JSON.parse(content);
        if (plugin.description_for_human) {
          llmsInfo.description = llmsInfo.description ?? plugin.description_for_human;
        }
        if (plugin.api?.url) {
          discoveredEndpoints["openapi"] = plugin.api.url;
        }
      } catch { /* skip */ }
    }

    if (path === "/llms.txt") {
      llmsInfo = { ...llmsInfo, ...parseLlmsTxt(content) };
    }

    if (path === "/robots.txt") {
      const parsed = parseRobotsTxt(content);
      // Fetch sitemaps referenced in robots.txt
      for (const sitemapUrl of parsed.sitemaps.slice(0, 3)) {
        const sitemapContent = await safeFetch(sitemapUrl);
        sourcesChecked.push(sitemapUrl);
        if (sitemapContent) {
          allUrls.push(...parseSitemapUrls(sitemapContent));
        }
      }
      allUrls.push(...parsed.hints.map((h) => `${baseUrl}${h}`));
    }

    if (path === "/sitemap.xml") {
      allUrls.push(...parseSitemapUrls(content));
    }
  }

  discoveredEndpoints = { ...discoveredEndpoints, ...findApiPaths(allUrls) };

  // Build the card — prefer existing card data, then probed data, then user input
  const name = existingCard?.name ?? domainToName(domain);
  const description =
    existingCard?.description ??
    input.description ??
    llmsInfo.description ??
    `Services provided by ${domain}`;

  const capabilities =
    existingCard?.capabilities ??
    input.capabilities ??
    llmsInfo.capabilities ??
    ["General web services"];

  const card: AgentCard = {
    spec_version: "2026-03",
    name,
    description,
    url: baseUrl,
    provider: {
      organization: existingCard?.provider?.organization ?? name,
      url: existingCard?.provider?.url ?? baseUrl,
    },
    capabilities,
    endpoints: {
      ...(existingCard?.endpoints ?? {}),
      ...discoveredEndpoints,
    },
    generated_by: "402found.dev Prospector",
  };

  // Carry over any extra fields from an existing card
  if (existingCard) {
    for (const [key, value] of Object.entries(existingCard)) {
      if (!(key in card)) {
        card[key] = value;
      }
    }
  }

  return {
    card,
    sources_checked: sourcesChecked,
    hosting_upsell: {
      message: `Want this card hosted permanently? Register it at ${REGISTRY_URL} via the Card Registry MCP tool for $0.001 USDC/month.`,
      registry_url: REGISTRY_URL,
    },
  };
}
