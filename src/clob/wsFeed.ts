import WebSocket from "ws";
import { EventEmitter } from "node:events";
import { logger } from "../utils/logger.js";
import type { LocalBook, BookLevel } from "./types.js";

export type BookStore = Map<string, LocalBook>;

/**
 * Real-time Polymarket CLOB order book feed via WebSocket.
 * REST snapshots are fallback-only (see clob/client.ts).
 */
export class WsOrderbookFeed extends EventEmitter {
  private ws: WebSocket | null = null;
  private readonly books: BookStore = new Map();
  private readonly tokenIds: string[];
  private readonly wsUrl: string;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private lastMessageTs = 0;
  private closed = false;
  private reconnectDelayMs = 1500;

  constructor(tokenIds: string[], wsUrl: string) {
    super();
    this.tokenIds = tokenIds;
    this.wsUrl = wsUrl;
  }

  getBook(tokenId: string): LocalBook | undefined {
    return this.books.get(tokenId);
  }

  getAllBooks(): BookStore {
    return this.books;
  }

  lastUpdateAgeMs(now = Date.now()): number {
    return this.lastMessageTs ? now - this.lastMessageTs : Number.POSITIVE_INFINITY;
  }

  start(): void {
    if (!this.tokenIds.length) {
      logger.warn("WsOrderbookFeed: empty token list");
      return;
    }
    this.closed = false;
    this.connect();
  }

  stop(): void {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.cleanupSocket();
  }

  upsertBook(book: LocalBook): void {
    this.books.set(book.tokenId, book);
    this.lastMessageTs = book.ts;
    this.emit("book", book);
  }

  private connect(): void {
    this.ws = new WebSocket(this.wsUrl);
    this.ws.on("open", () => {
      logger.info({ n: this.tokenIds.length }, "CLOB WS connected");
      this.reconnectDelayMs = 1500;
      this.ws?.send(JSON.stringify({ assets_ids: this.tokenIds, type: "market" }));
      this.heartbeatTimer = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.ping();
      }, 10_000);
    });

    this.ws.on("message", (raw) => {
      this.lastMessageTs = Date.now();
      try {
        this.handleMessage(JSON.parse(String(raw)) as unknown);
      } catch (err) {
        logger.debug({ err }, "ws parse error");
      }
    });

    this.ws.on("close", () => {
      logger.warn("CLOB WS closed — reconnecting");
      this.cleanupSocket();
      if (!this.closed) {
        this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelayMs);
        this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 1.5, 30_000);
      }
    });

    this.ws.on("error", (err) => logger.warn({ err }, "CLOB WS error"));
  }

  private cleanupSocket(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    try {
      this.ws?.terminate();
    } catch {
      /* ignore */
    }
    this.ws = null;
  }

  private handleMessage(data: unknown): void {
    if (Array.isArray(data)) {
      for (const item of data) this.handleMessage(item);
      return;
    }
    if (!data || typeof data !== "object") return;
    const msg = data as Record<string, unknown>;
    const assetId = String(msg.asset_id ?? msg.assetId ?? "");
    if (!assetId) return;

    if (msg.bids || msg.asks || msg.buys || msg.sells) {
      const bids = toLevels((msg.bids ?? msg.buys) as unknown);
      const asks = toLevels((msg.asks ?? msg.sells) as unknown);
      const book: LocalBook = {
        tokenId: assetId,
        bids: bids.length ? bids : (this.books.get(assetId)?.bids ?? []),
        asks: asks.length ? asks : (this.books.get(assetId)?.asks ?? []),
        ts: Date.now(),
      };
      this.books.set(assetId, book);
      this.emit("book", book);
    }
  }
}

function toLevels(raw: unknown): BookLevel[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((l) => {
      if (Array.isArray(l) && l.length >= 2) return { price: Number(l[0]), size: Number(l[1]) };
      if (l && typeof l === "object") {
        const o = l as { price?: string | number; size?: string | number };
        return { price: Number(o.price), size: Number(o.size) };
      }
      return { price: 0, size: 0 };
    })
    .filter((l) => l.price > 0 && l.size > 0);
}

export { WsOrderbookFeed as WsBookFeed };
