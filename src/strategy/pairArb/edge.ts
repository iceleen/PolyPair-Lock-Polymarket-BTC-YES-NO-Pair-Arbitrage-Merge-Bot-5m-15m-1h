import type { FeeModel, TimeframeProfile } from "../../config/schema.js";
import { bestAsk, type LocalBook } from "../../clob/types.js";
import { bpsToFraction, round } from "../../utils/math.js";

export type EdgeSnapshot = {
  upAsk: number;
  downAsk: number;
  upAskSize: number;
  downAskSize: number;
  combinedAsk: number;
  edge: number;
  netEdge: number;
  maxPairSize: number;
  liquidityOk: boolean;
  timestamp: number;
};

export type PairArbSignal = EdgeSnapshot & {
  shouldEnter: boolean;
  reason?: string;
};

export function computeEdge(
  upBook: LocalBook,
  downBook: LocalBook,
  profile: TimeframeProfile,
  fees: FeeModel,
): EdgeSnapshot {
  const up = bestAsk(upBook.asks);
  const down = bestAsk(downBook.asks);
  const upAsk = up?.price ?? 1;
  const downAsk = down?.price ?? 1;
  const upAskSize = up?.size ?? 0;
  const downAskSize = down?.size ?? 0;
  const combinedAsk = upAsk + downAsk;
  const edge = 1 - combinedAsk;

  const feeCost = bpsToFraction(fees.takerFeeBps) * 2 + bpsToFraction(fees.slippageBps);
  const mergeCostPerPair = fees.mergeGasUsdcEst;
  const netEdge = edge - feeCost - mergeCostPerPair / Math.max(profile.orderSizeUsdc, 1);

  const maxPairSize = Math.min(upAskSize, downAskSize, profile.orderSizeUsdc / combinedAsk);
  const liquidityOk =
    upAskSize >= profile.minAskSize &&
    downAskSize >= profile.minAskSize &&
    maxPairSize >= profile.minAskSize * 0.5;

  return {
    upAsk,
    downAsk,
    upAskSize,
    downAskSize,
    combinedAsk,
    edge: round(edge, 5),
    netEdge: round(netEdge, 5),
    maxPairSize: round(maxPairSize, 2),
    liquidityOk,
    timestamp: Date.now(),
  };
}

export function evaluatePairArbSignal(
  upBook: LocalBook,
  downBook: LocalBook,
  profile: TimeframeProfile,
  fees: FeeModel,
): PairArbSignal {
  const snap = computeEdge(upBook, downBook, profile, fees);

  if (!snap.liquidityOk) {
    return { ...snap, shouldEnter: false, reason: "insufficient ask liquidity" };
  }
  if (snap.combinedAsk >= profile.combinedAskStop) {
    return { ...snap, shouldEnter: false, reason: "combined ask stop" };
  }
  if (snap.netEdge < profile.targetEdge) {
    return { ...snap, shouldEnter: false, reason: "edge below target" };
  }
  if (snap.upAsk <= 0.02 || snap.downAsk <= 0.02) {
    return { ...snap, shouldEnter: false, reason: "extreme price guard" };
  }

  return { ...snap, shouldEnter: true };
}

export function computeLockedProfit(
  upPrice: number,
  downPrice: number,
  size: number,
  fees: FeeModel,
): number {
  const cost = (upPrice + downPrice) * size;
  const gross = size;
  const feeCost = cost * bpsToFraction(fees.takerFeeBps) * 2;
  const slippageCost = cost * bpsToFraction(fees.slippageBps);
  const mergeCost = fees.mergeGasUsdcEst;
  return round(gross - cost - feeCost - slippageCost - mergeCost, 4);
}

export function balancedOrderSize(
  signal: EdgeSnapshot,
  profile: TimeframeProfile,
  remainingSpendUsdc: number,
): number {
  const notionalCap = Math.min(profile.orderSizeUsdc, profile.maxTakerFillUsdc, remainingSpendUsdc);
  const sizeFromNotional = notionalCap / signal.combinedAsk;
  return round(Math.min(signal.maxPairSize, sizeFromNotional), 2);
}
