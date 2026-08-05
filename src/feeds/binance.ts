import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { logger } from "../utils/logger.js";

/** Optional Binance BTCUSDT feed for diagnostics only — strategy is pair-arb, not directional. */
export class BinanceBtcFeed extends EventEmitter {
  private ws: WebSocket | null = null;
  private lastPrice = 0;
  private lastTs = 0;
  private closed = false;

  constructor(private readonly wsUrl: string) {
    super();
  }

  getLastPrice(): number {
    return this.lastPrice;
  }

  lastUpdateAgeMs(now = Date.now()): number {
    return this.lastTs ? now - this.lastTs : Number.POSITIVE_INFINITY;
  }

  start(): void {
    this.closed = false;
    this.connect();
  }

  stop(): void {
    this.closed = true;
    this.ws?.terminate();
    this.ws = null;
  }

  private connect(): void {
    this.ws = new WebSocket(this.wsUrl);
    this.ws.on("open", () => logger.debug("Binance BTC feed connected"));
    this.ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as { p?: string };
        if (msg.p) {
          this.lastPrice = Number(msg.p);
          this.lastTs = Date.now();
          this.emit("trade", this.lastPrice);
        }
      } catch {
        /* ignore */
      }
    });
    this.ws.on("close", () => {
      if (!this.closed) setTimeout(() => this.connect(), 3000);
    });
    this.ws.on("error", (err) => logger.debug({ err }, "binance ws error"));
  }
}
