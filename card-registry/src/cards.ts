import { RegisterResult } from "./types.js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const CARDS_DIR = path.resolve(__dirname, "..", "cards");
const BASE_URL = process.env.BASE_URL ?? "https://card-registry.fly.dev";

// Slug must be URL-safe: lowercase alphanumeric + hyphens, 3-64 chars
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

export function validateSlug(slug: string): string | null {
  if (!SLUG_RE.test(slug)) {
    return "Slug must be 3-64 chars, lowercase alphanumeric and hyphens, no leading/trailing hyphens.";
  }
  return null;
}

export function validateCard(card: unknown): string | null {
  if (typeof card !== "object" || card === null) return "Card must be a JSON object.";
  const c = card as Record<string, unknown>;
  if (typeof c.name !== "string" || c.name.length === 0) return "Card must have a non-empty 'name' field.";
  return null;
}

export function registerCard(slug: string, card: object): RegisterResult {
  const filePath = path.join(CARDS_DIR, `${slug}.json`);
  const existed = existsSync(filePath);

  writeFileSync(filePath, JSON.stringify(card, null, 2), "utf-8");

  return {
    hosted_at: `${BASE_URL}/cards/${slug}.json`,
    slug,
    status: existed ? "updated" : "created",
  };
}

export function getCard(slug: string): object | null {
  const filePath = path.join(CARDS_DIR, `${slug}.json`);
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

export function listCards(): string[] {
  const { readdirSync } = require("node:fs");
  try {
    return (readdirSync(CARDS_DIR) as string[])
      .filter((f: string) => f.endsWith(".json"))
      .map((f: string) => f.replace(/\.json$/, ""));
  } catch {
    return [];
  }
}
