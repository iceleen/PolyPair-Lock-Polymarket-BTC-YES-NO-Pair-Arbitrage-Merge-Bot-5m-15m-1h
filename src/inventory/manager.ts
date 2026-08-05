export type InventorySnapshot = {
  upShares: number;
  downShares: number;
  upCostUsdc: number;
  downCostUsdc: number;
  matchedPairs: number;
  mergedPairs: number;
  imbalanceShares: number;
  imbalanceUsdc: number;
  totalExposureUsdc: number;
  lockedProfitUsdc: number;
};

export class InventoryManager {
  private upShares = 0;
  private downShares = 0;
  private upCostUsdc = 0;
  private downCostUsdc = 0;
  private mergedPairs = 0;
  private lockedProfitUsdc = 0;

  recordFill(side: "UP" | "DOWN", price: number, size: number): void {
    const notional = price * size;
    if (side === "UP") {
      this.upShares += size;
      this.upCostUsdc += notional;
    } else {
      this.downShares += size;
      this.downCostUsdc += notional;
    }
  }

  recordMerge(pairs: number, profitUsdc: number): void {
    if (pairs <= 0) return;
    const mergeable = Math.min(pairs, this.upShares, this.downShares);
    if (mergeable <= 0) return;

    const upAvg = this.upShares > 0 ? this.upCostUsdc / this.upShares : 0;
    const downAvg = this.downShares > 0 ? this.downCostUsdc / this.downShares : 0;

    this.upShares -= mergeable;
    this.downShares -= mergeable;
    this.upCostUsdc -= upAvg * mergeable;
    this.downCostUsdc -= downAvg * mergeable;
    this.mergedPairs += mergeable;
    this.lockedProfitUsdc += profitUsdc;
  }

  snapshot(): InventorySnapshot {
    const matchedPairs = Math.min(this.upShares, this.downShares);
    const imbalanceShares = Math.abs(this.upShares - this.downShares);
    const upAvg = this.upShares > 0 ? this.upCostUsdc / this.upShares : 0;
    const downAvg = this.downShares > 0 ? this.downCostUsdc / this.downShares : 0;
    const imbalanceUsdc = imbalanceShares * Math.max(upAvg, downAvg, 0.01);
    const totalExposureUsdc = this.upCostUsdc + this.downCostUsdc;

    return {
      upShares: this.upShares,
      downShares: this.downShares,
      upCostUsdc: this.upCostUsdc,
      downCostUsdc: this.downCostUsdc,
      matchedPairs,
      mergedPairs: this.mergedPairs,
      imbalanceShares,
      imbalanceUsdc,
      totalExposureUsdc,
      lockedProfitUsdc: this.lockedProfitUsdc,
    };
  }

  mergeablePairs(): number {
    return Math.min(this.upShares, this.downShares);
  }

  getLockedProfit(): number {
    return this.lockedProfitUsdc;
  }

  reset(): void {
    this.upShares = 0;
    this.downShares = 0;
    this.upCostUsdc = 0;
    this.downCostUsdc = 0;
    this.mergedPairs = 0;
    this.lockedProfitUsdc = 0;
  }
}

export function computeImbalanceGuard(
  inventory: InventorySnapshot,
  maxImbalanceUsdc: number,
): { blocked: boolean; reason?: string } {
  if (inventory.imbalanceUsdc >= maxImbalanceUsdc) {
    return { blocked: true, reason: "inventory imbalance limit breached" };
  }
  return { blocked: false };
}
