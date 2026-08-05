import { randomUUID } from "node:crypto";
import { logger } from "../utils/logger.js";
import { placeOrder, cancelAllOrders, type OrderRequest } from "../clob/client.js";
import { PaperExchange, type SimulatedFill } from "./paperExchange.js";

export type DualFillResult = {
  up: SimulatedFill;
  down: SimulatedFill;
  notionalUsdc: number;
};

export class ExecutionEngine {
  private readonly paper: PaperExchange;
  private openTakerNotionalUsdc = 0;

  constructor(private readonly live: boolean) {
    this.paper = new PaperExchange();
  }

  getPaperExchange(): PaperExchange {
    return this.paper;
  }

  getOpenTakerNotional(): number {
    return this.openTakerNotionalUsdc;
  }

  resetTakerExposure(): void {
    this.openTakerNotionalUsdc = 0;
  }

  async executeDualTaker(
    upTokenId: string,
    downTokenId: string,
    upPrice: number,
    downPrice: number,
    size: number,
  ): Promise<DualFillResult | null> {
    const notionalUsdc = (upPrice + downPrice) * size;

    if (this.live) {
      const upReq: OrderRequest = {
        tokenId: upTokenId,
        side: "BUY",
        price: upPrice,
        size,
        orderType: "FOK",
        clientOrderId: randomUUID(),
      };
      const downReq: OrderRequest = {
        tokenId: downTokenId,
        side: "BUY",
        price: downPrice,
        size,
        orderType: "FOK",
        clientOrderId: randomUUID(),
      };
      const [upRes, downRes] = await Promise.all([
        placeOrder(upReq, true),
        placeOrder(downReq, true),
      ]);
      if (!upRes.ok || !downRes.ok) {
        logger.warn({ upRes, downRes }, "dual taker partial failure — hedge required");
        return null;
      }
      this.openTakerNotionalUsdc += notionalUsdc;
      return {
        up: { tokenId: upTokenId, side: "UP", price: upPrice, size, orderId: upRes.orderId },
        down: { tokenId: downTokenId, side: "DOWN", price: downPrice, size, orderId: downRes.orderId },
        notionalUsdc,
      };
    }

    const sim = this.paper.simulateDualTakerFill(upTokenId, downTokenId, upPrice, downPrice, size);
    if (!sim) return null;
    this.openTakerNotionalUsdc += notionalUsdc;
    return { ...sim, notionalUsdc };
  }

  async executeHedge(
    tokenId: string,
    side: "UP" | "DOWN",
    price: number,
    size: number,
  ): Promise<SimulatedFill | null> {
    if (this.live) {
      const res = await placeOrder(
        { tokenId, side: "BUY", price, size, orderType: "FOK", clientOrderId: randomUUID() },
        true,
      );
      if (!res.ok) return null;
      return { tokenId, side, price, size, orderId: res.orderId };
    }
    return this.paper.simulateSingleTakerFill(tokenId, side, price, size);
  }

  async cancelAll(): Promise<number> {
    if (this.live) {
      const { cancelled } = await cancelAllOrders(true);
      return cancelled;
    }
    return this.paper.cancelAll();
  }
}
