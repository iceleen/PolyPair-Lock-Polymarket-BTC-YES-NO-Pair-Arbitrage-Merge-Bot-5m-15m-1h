import { existsSync } from "node:fs";
import type { AppConfig, TimeframeProfile } from "../config/schema.js";
import type { InventorySnapshot } from "../inventory/manager.js";
import { msToExpiry } from "../utils/time.js";

export type RiskDecision = { allow: true } | { allow: false; reason: string };

export type RiskState = {
  hourlyPnlUsdc: number;
  dailyPnlUsdc: number;
  marketSpendUsdc: number;
  inventory: InventorySnapshot;
  feedStaleMs: number;
  openTakerNotionalUsdc: number;
};

export function isKillSwitchActive(killSwitchFile: string): boolean {
  return existsSync(killSwitchFile);
}

export function evaluateEntryRisk(
  cfg: AppConfig,
  profile: TimeframeProfile,
  state: RiskState,
  closeTsMs: number,
  notionalUsdc: number,
  now = Date.now(),
): RiskDecision {
  if (isKillSwitchActive(cfg.risk.killSwitchFile)) {
    return { allow: false, reason: "kill switch active" };
  }
  if (state.hourlyPnlUsdc <= -cfg.risk.maxLossPerHourUsdc) {
    return { allow: false, reason: "hourly loss circuit breaker" };
  }
  if (state.dailyPnlUsdc <= -cfg.risk.maxDailyLossUsdc) {
    return { allow: false, reason: "daily loss circuit breaker" };
  }
  if (state.marketSpendUsdc + notionalUsdc > profile.maxSpendPerMarketUsdc) {
    return { allow: false, reason: "max spend per market reached" };
  }
  if (state.inventory.imbalanceUsdc >= profile.maxInventoryImbalanceUsdc) {
    return { allow: false, reason: "inventory imbalance limit breached" };
  }
  if (state.feedStaleMs > cfg.risk.maxFeedStalenessMs) {
    return { allow: false, reason: "order book feed stale" };
  }
  if (msToExpiry(closeTsMs, now) <= profile.stopBuyingBeforeCloseMs) {
    return { allow: false, reason: "stop buying before close window" };
  }
  if (notionalUsdc > profile.maxTakerFillUsdc) {
    return { allow: false, reason: "max taker fill exceeded" };
  }
  if (state.openTakerNotionalUsdc + notionalUsdc > profile.maxTakerFillUsdc * 2) {
    return { allow: false, reason: "rolling taker exposure cap" };
  }
  return { allow: true };
}

export function evaluateCombinedAskStop(
  upAsk: number,
  downAsk: number,
  profile: TimeframeProfile,
): RiskDecision {
  if (upAsk + downAsk >= profile.combinedAskStop) {
    return { allow: false, reason: "combined ask stop — toxic pair pricing" };
  }
  return { allow: true };
}

export function shouldCancelBeforeClose(profile: TimeframeProfile, closeTsMs: number, now = Date.now()): boolean {
  return msToExpiry(closeTsMs, now) <= profile.stopBuyingBeforeCloseMs;
}

export function evaluateHedgeRisk(
  profile: TimeframeProfile,
  inventory: InventorySnapshot,
  hedgeNotionalUsdc: number,
): RiskDecision {
  if (inventory.imbalanceUsdc + hedgeNotionalUsdc > profile.maxInventoryImbalanceUsdc) {
    return { allow: false, reason: "hedge would breach imbalance limit" };
  }
  return { allow: true };
}
