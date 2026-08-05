import { describe, it, expect } from "vitest";
import { planPartialFillHedge, needsRebalance, rebalancePriority } from "../src/strategy/pairArb/hedging.js";
import { InventoryManager } from "../src/inventory/manager.js";
import type { LocalBook } from "../src/clob/types.js";
import { DEFAULT_PROFILES } from "../src/config/schema.js";

const profile = DEFAULT_PROFILES.BTC_5M;

function makeBook(tokenId: string, askPrice: number, askSize: number): LocalBook {
  return {
    tokenId,
    bids: [],
    asks: [{ price: askPrice, size: askSize }],
    ts: Date.now(),
  };
}

describe("partial fill hedging", () => {
  it("plans hedge for missing DOWN leg after UP fill", () => {
    const inv = new InventoryManager();
    const upBook = makeBook("up-token", 0.48, 50);
    const downBook = makeBook("down-token", 0.49, 50);

    const plan = planPartialFillHedge(
      { filledSide: "UP", filledSize: 10, filledPrice: 0.48, missingSide: "DOWN" },
      upBook,
      downBook,
      inv.snapshot(),
      profile,
    );

    expect(plan).not.toBeNull();
    expect(plan!.side).toBe("DOWN");
    expect(plan!.size).toBeGreaterThan(0);
  });

  it("returns null when hedge would breach imbalance limit", () => {
    const inv = new InventoryManager();
    inv.recordFill("UP", 0.50, 40);
    const upBook = makeBook("up-token", 0.48, 50);
    const downBook = makeBook("down-token", 0.49, 50);

    const plan = planPartialFillHedge(
      { filledSide: "UP", filledSize: 20, filledPrice: 0.50, missingSide: "DOWN" },
      upBook,
      downBook,
      inv.snapshot(),
      profile,
    );

    expect(plan).toBeNull();
  });

  it("detects when rebalance is needed", () => {
    const inv = new InventoryManager();
    inv.recordFill("UP", 0.48, 50);
    inv.recordFill("DOWN", 0.49, 10);
    expect(needsRebalance(inv.snapshot(), profile)).toBe(true);
  });

  it("prioritizes buying the light side", () => {
    const inv = new InventoryManager();
    inv.recordFill("UP", 0.48, 30);
    inv.recordFill("DOWN", 0.49, 10);
    expect(rebalancePriority(inv.snapshot())).toBe("DOWN");
  });
});
