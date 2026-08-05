import type { InventorySnapshot } from "../../inventory/manager.js";
import type { TimeframeProfile } from "../../config/schema.js";
import { bestAsk, type LocalBook } from "../../clob/types.js";

export type HedgePlan = {
  side: "UP" | "DOWN";
  tokenId: string;
  price: number;
  size: number;
  reason: string;
} | null;

export type PartialFillState = {
  filledSide: "UP" | "DOWN";
  filledSize: number;
  filledPrice: number;
  missingSide: "UP" | "DOWN";
};

/**
 * When only one leg fills, attempt to hedge the missing side under imbalance limits.
 */
export function planPartialFillHedge(
  partial: PartialFillState,
  upBook: LocalBook,
  downBook: LocalBook,
  inventory: InventorySnapshot,
  profile: TimeframeProfile,
): HedgePlan {
  const projectedImbalance =
    inventory.imbalanceUsdc + partial.filledSize * partial.filledPrice;

  if (projectedImbalance >= profile.maxInventoryImbalanceUsdc) {
    return null;
  }

  const missingBook = partial.missingSide === "UP" ? upBook : downBook;
  const ask = bestAsk(missingBook.asks);
  if (!ask) return null;

  const maxHedgeNotional = profile.maxInventoryImbalanceUsdc - inventory.imbalanceUsdc;
  const hedgeSize = Math.min(partial.filledSize, maxHedgeNotional / ask.price, ask.size);

  if (hedgeSize < profile.minAskSize * 0.5) return null;

  return {
    side: partial.missingSide,
    tokenId: missingBook.tokenId,
    price: ask.price,
    size: hedgeSize,
    reason: "partial fill hedge",
  };
}

export function needsRebalance(inventory: InventorySnapshot, profile: TimeframeProfile): boolean {
  return inventory.imbalanceUsdc >= profile.maxInventoryImbalanceUsdc * 0.5;
}

export function rebalancePriority(inventory: InventorySnapshot): "UP" | "DOWN" | null {
  if (inventory.upShares > inventory.downShares + 0.01) return "DOWN";
  if (inventory.downShares > inventory.upShares + 0.01) return "UP";
  return null;
}
