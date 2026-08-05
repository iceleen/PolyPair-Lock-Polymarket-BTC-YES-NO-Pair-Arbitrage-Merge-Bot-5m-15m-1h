import { randomUUID } from "node:crypto";
import type { OrderRequest } from "../clob/client.js";

export type SimulatedFill = {
  tokenId: string;
  side: "UP" | "DOWN";
  price: number;
  size: number;
  orderId: string;
};

export class PaperExchange {
  private pendingOrders: Array<OrderRequest & { orderId: string }> = [];

  simulateDualTakerFill(
    upTokenId: string,
    downTokenId: string,
    upPrice: number,
    downPrice: number,
    size: number,
  ): { up: SimulatedFill; down: SimulatedFill } | null {
    if (size <= 0 || upPrice <= 0 || downPrice <= 0) return null;
    const upId = randomUUID();
    const downId = randomUUID();
    return {
      up: { tokenId: upTokenId, side: "UP", price: upPrice, size, orderId: upId },
      down: { tokenId: downTokenId, side: "DOWN", price: downPrice, size, orderId: downId },
    };
  }

  simulateSingleTakerFill(
    tokenId: string,
    side: "UP" | "DOWN",
    price: number,
    size: number,
  ): SimulatedFill | null {
    if (price <= 0 || size <= 0) return null;
    return { tokenId, side, price, size, orderId: randomUUID() };
  }

  /** Simulate partial fill: one leg fills, other misses. */
  simulatePartialFill(
    upTokenId: string,
    downTokenId: string,
    upPrice: number,
    downPrice: number,
    size: number,
    failSide: "UP" | "DOWN",
  ): SimulatedFill | null {
    if (failSide === "UP") {
      return this.simulateSingleTakerFill(downTokenId, "DOWN", downPrice, size);
    }
    return this.simulateSingleTakerFill(upTokenId, "UP", upPrice, size);
  }

  placeResting(req: OrderRequest): string {
    const orderId = req.clientOrderId ?? randomUUID();
    this.pendingOrders.push({ ...req, orderId });
    return orderId;
  }

  cancelAll(): number {
    const n = this.pendingOrders.length;
    this.pendingOrders = [];
    return n;
  }
}
