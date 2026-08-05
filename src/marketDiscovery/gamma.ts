import { logger } from "../utils/logger.js";
import { floorToWindowStart } from "../utils/time.js";
import type { TimeframeProfile } from "../config/schema.js";

export type GammaMarket = {
  id: string;
  question?: string;
  slug?: string;
  conditionId?: string;
  clobTokenIds?: string | string[];
  outcomes?: string | string[];
  active?: boolean;
  closed?: boolean;
  enableOrderBook?: boolean;
  endDate?: string;
  startDate?: string;
  events?: Array<{ id?: string; slug?: string; title?: string }>;
};

export type BtcUpDownMarket = {
  slug: string;
  conditionId: string;
  upTokenId: string;
  downTokenId: string;
  windowStartSec: number;
  windowEndSec: number;
  closeTsMs: number;
  question?: string;
};

const DEFAULT_GAMMA = process.env.GAMMA_API_URL ?? "https://gamma-api.polymarket.com";

export function buildDeterministicSlug(profile: TimeframeProfile, nowSec = Math.floor(Date.now() / 1000)): string {
  const start = floorToWindowStart(nowSec, profile.windowSeconds);
  return `${profile.slugPrefix}-${start}`;
}

export function buildNextSlug(profile: TimeframeProfile, nowSec = Math.floor(Date.now() / 1000)): string {
  const currentStart = floorToWindowStart(nowSec, profile.windowSeconds);
  const nextStart = currentStart + profile.windowSeconds;
  return `${profile.slugPrefix}-${nextStart}`;
}

export function parseTokenIds(market: GammaMarket): string[] {
  const raw = market.clobTokenIds;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export function parseOutcomes(market: GammaMarket): string[] {
  const raw = market.outcomes;
  if (!raw) return ["Up", "Down"];
  if (Array.isArray(raw)) return raw.map(String);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    return raw.split(",").map((s) => s.trim());
  }
  return ["Up", "Down"];
}

export async function fetchMarketBySlug(slug: string, gammaUrl = DEFAULT_GAMMA): Promise<GammaMarket | null> {
  try {
    const res = await fetch(`${gammaUrl}/markets?slug=${encodeURIComponent(slug)}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as GammaMarket[];
    return Array.isArray(data) && data.length > 0 ? (data[0] ?? null) : null;
  } catch (err) {
    logger.warn({ err, slug }, "gamma slug fetch failed");
    return null;
  }
}

export function normalizeBtcUpDown(market: GammaMarket, profile: TimeframeProfile): BtcUpDownMarket | null {
  const tokens = parseTokenIds(market);
  const outcomes = parseOutcomes(market);
  if (tokens.length < 2) return null;

  let upIdx = outcomes.findIndex((o) => /up/i.test(o));
  let downIdx = outcomes.findIndex((o) => /down/i.test(o));
  if (upIdx < 0) upIdx = 0;
  if (downIdx < 0) downIdx = upIdx === 0 ? 1 : 0;

  const slug = market.slug ?? market.events?.[0]?.slug ?? "";
  const match = slug.match(/-(\d{9,})$/);
  const windowStartSec = match ? Number(match[1]) : floorToWindowStart(Math.floor(Date.now() / 1000), profile.windowSeconds);
  const windowEndSec = windowStartSec + profile.windowSeconds;

  return {
    slug,
    conditionId: market.conditionId ?? market.id,
    upTokenId: tokens[upIdx]!,
    downTokenId: tokens[downIdx]!,
    windowStartSec,
    windowEndSec,
    closeTsMs: windowEndSec * 1000,
    question: market.question,
  };
}

export async function discoverActiveMarket(
  profile: TimeframeProfile,
  gammaUrl = DEFAULT_GAMMA,
): Promise<BtcUpDownMarket | null> {
  const nowSec = Math.floor(Date.now() / 1000);
  const candidates = [buildDeterministicSlug(profile, nowSec), buildNextSlug(profile, nowSec)];

  for (const slug of candidates) {
    const raw = await fetchMarketBySlug(slug, gammaUrl);
    if (!raw || raw.closed || raw.active === false) continue;
    const normalized = normalizeBtcUpDown(raw, profile);
    if (normalized) {
      logger.info({ slug: normalized.slug, up: normalized.upTokenId.slice(0, 8) }, "market discovered");
      return normalized;
    }
  }

  logger.warn({ prefix: profile.slugPrefix }, "no active BTC up/down market found");
  return null;
}

export async function discoverNextMarket(
  profile: TimeframeProfile,
  gammaUrl = DEFAULT_GAMMA,
): Promise<BtcUpDownMarket | null> {
  const slug = buildNextSlug(profile);
  const raw = await fetchMarketBySlug(slug, gammaUrl);
  if (!raw) return null;
  return normalizeBtcUpDown(raw, profile);
}
