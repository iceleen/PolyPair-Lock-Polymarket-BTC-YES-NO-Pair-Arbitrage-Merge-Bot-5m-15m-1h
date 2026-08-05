import { describe, it, expect } from "vitest";
import { InventoryManager, computeImbalanceGuard } from "../src/inventory/manager.js";
import { DEFAULT_PROFILES } from "../src/config/schema.js";

const profile = DEFAULT_PROFILES.BTC_5M;

describe("inventory imbalance guards", () => {
  it("tracks matched pairs after balanced fills", () => {
    const inv = new InventoryManager();
    inv.recordFill("UP", 0.48, 10);
    inv.recordFill("DOWN", 0.49, 10);
    const snap = inv.snapshot();
    expect(snap.matchedPairs).toBe(10);
    expect(snap.imbalanceShares).toBe(0);
    expect(snap.imbalanceUsdc).toBe(0);
  });

  it("detects imbalance after one-sided fill", () => {
    const inv = new InventoryManager();
    inv.recordFill("UP", 0.48, 20);
    inv.recordFill("DOWN", 0.49, 8);
    const snap = inv.snapshot();
    expect(snap.matchedPairs).toBe(8);
    expect(snap.imbalanceShares).toBe(12);
    expect(snap.imbalanceUsdc).toBeGreaterThan(0);
  });

  it("blocks when imbalance exceeds limit", () => {
    const inv = new InventoryManager();
    inv.recordFill("UP", 0.50, 50);
    const guard = computeImbalanceGuard(inv.snapshot(), profile.maxInventoryImbalanceUsdc);
    expect(guard.blocked).toBe(true);
    expect(guard.reason).toContain("imbalance");
  });

  it("allows entry when imbalance is within limit", () => {
    const inv = new InventoryManager();
    inv.recordFill("UP", 0.48, 5);
    inv.recordFill("DOWN", 0.49, 4);
    const guard = computeImbalanceGuard(inv.snapshot(), profile.maxInventoryImbalanceUsdc);
    expect(guard.blocked).toBe(false);
  });

  it("records merge profit correctly", () => {
    const inv = new InventoryManager();
    inv.recordFill("UP", 0.48, 10);
    inv.recordFill("DOWN", 0.49, 10);
    inv.recordMerge(10, 0.25);
    expect(inv.getLockedProfit()).toBe(0.25);
    expect(inv.snapshot().mergedPairs).toBe(10);
    expect(inv.mergeablePairs()).toBe(0);
  });
});
