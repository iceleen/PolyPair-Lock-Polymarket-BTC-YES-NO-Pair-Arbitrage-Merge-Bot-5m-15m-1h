import { logger } from "../utils/logger.js";
import type { LocalBook } from "./types.js";

const CLOB = process.env.CLOB_API_URL ?? "https://clob.polymarket.com";

export type ClobBookResponse = {
  market?: string;
  asset_id?: string;
  bids?: Array<{ price: string; size: string }>;
  asks?: Array<{ price: string; size: string }>;
  timestamp?: string | number;
};

export type OrderRequest = {
  tokenId: string;
  side: "BUY" | "SELL";
  price: number;
  size: number;
  orderType: "FAK" | "FOK" | "GTC";
  clientOrderId?: string;
};

export type OrderResult =
  | { ok: true; orderId: string; filled: number; avgPrice: number }
  | { ok: false; reason: string };

export async function fetchBookSnapshot(tokenId: string, clobUrl = CLOB): Promise<LocalBook | null> {
  try {
    const res = await fetch(`${clobUrl}/book?token_id=${encodeURIComponent(tokenId)}`);
    if (!res.ok) return null;
    return normalizeBook(tokenId, (await res.json()) as ClobBookResponse);
  } catch (err) {
    logger.warn({ err, tokenId }, "clob book REST fallback failed");
    return null;
  }
}

export function normalizeBook(tokenId: string, data: ClobBookResponse): LocalBook {
  const mapSide = (levels?: Array<{ price: string; size: string }>) =>
    (levels ?? [])
      .map((l) => ({ price: Number(l.price), size: Number(l.size) }))
      .filter((l) => l.price > 0 && l.size > 0);

  const ts =
    typeof data.timestamp === "string"
      ? Number(data.timestamp)
      : typeof data.timestamp === "number"
        ? data.timestamp
        : Date.now();

  return {
    tokenId,
    bids: mapSide(data.bids),
    asks: mapSide(data.asks),
    ts: ts < 1e12 ? ts * 1000 : ts,
  };
}

/**
 * Live CLOB order placement — wire @polymarket/clob-client-v2 when CONFIRM_LIVE=true.
 * Paper mode uses execution/paperExchange.ts with identical call signatures.
 */
export async function placeOrder(req: OrderRequest, live = false): Promise<OrderResult> {
  if (!live) {
    return { ok: false, reason: "paper mode — use PaperExchange" };
  }
  if (!process.env.POLYMARKET_PRIVATE_KEY) {
    return { ok: false, reason: "POLYMARKET_PRIVATE_KEY missing" };
  }
  logger.info({ side: req.side, price: req.price, size: req.size, token: req.tokenId.slice(0, 8) }, "live order stub");
  return { ok: false, reason: "Integrate @polymarket/clob-client-v2 in clob/client.ts for live signing" };
}

export async function cancelOrder(_orderId: string, live = false): Promise<boolean> {
  if (!live) return true;
  logger.warn("cancelOrder: live cancel requires SDK credentials");
  return false;
}

export async function cancelAllOrders(live = false): Promise<{ cancelled: number }> {
  if (!live) return { cancelled: 0 };
  logger.warn("cancelAllOrders: live cancel requires SDK credentials");
  return { cancelled: 0 };
}

export async function fetchClobTime(clobUrl = CLOB): Promise<boolean> {
  try {
    const res = await fetch(`${clobUrl}/time`, { signal: AbortSignal.timeout(8000) });
    return res.ok;
  } catch {
    return false;
  }
}
