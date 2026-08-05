import { describe, it, expect } from "vitest";
import {
  computeEdge,
  evaluatePairArbSignal,
  computeLockedProfit,
  balancedOrderSize,
} from "../src/strategy/pairArb/edge.js";
import type { LocalBook } from "../src/clob/types.js";
import { DEFAULT_PROFILES } from "../src/config/schema.js";

const profile = DEFAULT_PROFILES.BTC_5M;
const fees = { takerFeeBps: 0, mergeGasUsdcEst: 0.02, slippageBps: 15 };

function makeBook(tokenId: string, askPrice: number, askSize: number): LocalBook {
  return {
    tokenId,
    bids: [{ price: askPrice - 0.02, size: 100 }],
    asks: [{ price: askPrice, size: askSize }],
    ts: Date.now(),
  };
}

describe("pairArb edge calculation", () => {
  it("computes positive edge when combined ask < 1", () => {
    const up = makeBook("up", 0.48, 50);
    const down = makeBook("down", 0.49, 50);
    const snap = computeEdge(up, down, profile, fees);
    expect(snap.combinedAsk).toBeCloseTo(0.97, 2);
    expect(snap.edge).toBeCloseTo(0.03, 2);
    expect(snap.liquidityOk).toBe(true);
  });

  it("signals entry when net edge exceeds target", () => {
    const up = makeBook("up", 0.47, 50);
    const down = makeBook("down", 0.48, 50);
    const signal = evaluatePairArbSignal(up, down, profile, fees);
    expect(signal.shouldEnter).toBe(true);
    expect(signal.edge).toBeGreaterThan(profile.targetEdge);
  });

  it("blocks entry when combined ask exceeds stop", () => {
    const up = makeBook("up", 0.51, 50);
    const down = makeBook("down", 0.50, 50);
    const signal = evaluatePairArbSignal(up, down, profile, fees);
    expect(signal.shouldEnter).toBe(false);
    expect(signal.reason).toContain("combined ask");
  });

  it("blocks entry when liquidity is thin", () => {
    const up = makeBook("up", 0.47, 1);
    const down = makeBook("down", 0.48, 1);
    const signal = evaluatePairArbSignal(up, down, profile, fees);
    expect(signal.shouldEnter).toBe(false);
    expect(signal.reason).toContain("liquidity");
  });

  it("computes locked profit after fees", () => {
    const profit = computeLockedProfit(0.48, 0.49, 10, fees);
    expect(profit).toBeGreaterThan(0);
    expect(profit).toBeLessThan(0.3 * 10);
  });

  it("respects spend cap in balanced order size", () => {
    const up = makeBook("up", 0.47, 100);
    const down = makeBook("down", 0.48, 100);
    const snap = computeEdge(up, down, profile, fees);
    const size = balancedOrderSize(snap, profile, 5);
    expect(size * snap.combinedAsk).toBeLessThanOrEqual(5.01);
  });
});
