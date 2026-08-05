import { logger } from "../utils/logger.js";
import type { FeeModel } from "../config/schema.js";
import { computeLockedProfit } from "../strategy/pairArb/edge.js";
import type { InventoryManager } from "../inventory/manager.js";

export type MergeResult = {
  pairs: number;
  usdcReceived: number;
  profitUsdc: number;
  txHash?: string;
};

export function evaluateMerge(
  inventory: InventoryManager,
  mergeThreshold: number,
): { shouldMerge: boolean; pairs: number } {
  const pairs = inventory.mergeablePairs();
  return { shouldMerge: pairs >= mergeThreshold, pairs };
}

export async function executeMerge(
  inventory: InventoryManager,
  pairs: number,
  upAvgPrice: number,
  downAvgPrice: number,
  fees: FeeModel,
  live = false,
): Promise<MergeResult | null> {
  if (pairs <= 0) return null;

  const profitPerPair = computeLockedProfit(upAvgPrice, downAvgPrice, 1, fees);
  const profitUsdc = profitPerPair * pairs;
  const usdcReceived = pairs;

  if (live) {
    logger.info({ pairs }, "live merge — wire Polygon CTF contract in mergeRedeem/merge.ts");
    return null;
  }

  inventory.recordMerge(pairs, profitUsdc);
  logger.info({ pairs, profitUsdc: profitUsdc.toFixed(4), usdcReceived }, "paper merge executed");

  return { pairs, usdcReceived, profitUsdc };
}

export async function redeemWinningPositions(
  _conditionId: string,
  live = false,
): Promise<{ redeemed: number }> {
  if (!live) {
    logger.info("paper redeem — no action needed");
    return { redeemed: 0 };
  }
  logger.info("live redeem — wire post-resolution CTF redeem");
  return { redeemed: 0 };
}
