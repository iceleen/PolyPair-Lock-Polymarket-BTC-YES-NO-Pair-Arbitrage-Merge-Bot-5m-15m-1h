import { randomUUID } from "node:crypto";
import type { AppConfig, ProfileKey, TimeframeProfile } from "../config/schema.js";
import { isLiveProfile } from "../config/load.js";
import { discoverActiveMarket, type BtcUpDownMarket } from "../marketDiscovery/gamma.js";
import { WsOrderbookFeed } from "../clob/wsFeed.js";
import { fetchBookSnapshot } from "../clob/client.js";
import {
  evaluatePairArbSignal,
  balancedOrderSize,
  computeLockedProfit,
} from "../strategy/pairArb/edge.js";
import { MarketStateMachine } from "../strategy/pairArb/stateMachine.js";
import { needsRebalance, rebalancePriority, planPartialFillHedge } from "../strategy/pairArb/hedging.js";
import { InventoryManager } from "../inventory/manager.js";
import { ExecutionEngine } from "../execution/engine.js";
import { evaluateMerge, executeMerge, redeemWinningPositions } from "../mergeRedeem/merge.js";
import {
  evaluateEntryRisk,
  shouldCancelBeforeClose,
  evaluateHedgeRisk,
} from "../risk/gates.js";
import { BinanceBtcFeed } from "../feeds/binance.js";
import {
  initDb,
  recordFill,
  recordMerge,
  recordEvent,
  getHourlyPnl,
  getDailyPnl,
  addPnlDelta,
  closeDb,
} from "../storage/db.js";
import { renderDashboard, clearScreen, type DashboardState } from "./dashboard.js";
import { logger, initLogger } from "../utils/logger.js";
import { onShutdown } from "../utils/shutdown.js";
import { msToExpiry } from "../utils/time.js";

export type BotOptions = {
  profileKey: ProfileKey;
  profile: TimeframeProfile;
};

export class PolyPairLockBot {
  private readonly cfg: AppConfig;
  private readonly opts: BotOptions;
  private market: BtcUpDownMarket | null = null;
  private ws: WsOrderbookFeed | null = null;
  private binance: BinanceBtcFeed | null = null;
  private inventory = new InventoryManager();
  private execution: ExecutionEngine;
  private stateMachine = new MarketStateMachine();
  private pollTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private dashboardTimer: NodeJS.Timeout | null = null;
  private marketSpendUsdc = 0;
  private sessionPnlUsdc = 0;
  private pairLocks = 0;
  private merges = 0;
  private lastEdge: ReturnType<typeof evaluatePairArbSignal> | null = null;
  private running = false;
  private readonly monitorOnly: boolean;

  constructor(cfg: AppConfig, opts: BotOptions) {
    this.cfg = cfg;
    this.opts = opts;
    this.monitorOnly = opts.profile.status === "monitor";
    this.execution = new ExecutionEngine(isLiveProfile(cfg, opts.profile));
  }

  async start(): Promise<void> {
    initLogger(this.cfg.logLevel, this.cfg.logPretty);
    initDb(this.cfg.dbPath);

    this.market = await discoverActiveMarket(this.opts.profile, this.cfg.gammaApiUrl);
    if (!this.market) {
      logger.error("cannot start — no market discovered");
      return;
    }

    this.stateMachine.transition("QUOTE", "market discovered");

    this.binance = new BinanceBtcFeed(this.cfg.binanceWsUrl);
    this.binance.start();

    this.ws = new WsOrderbookFeed(
      [this.market.upTokenId, this.market.downTokenId],
      this.cfg.clobWsUrl,
    );
    this.ws.on("book", () => void this.onBookTick());
    this.ws.start();

    await this.bootstrapBooks();

    this.running = true;
    this.pollTimer = setInterval(() => void this.tick(), this.opts.profile.pollIntervalMs);
    this.heartbeatTimer = setInterval(() => this.heartbeat(), this.opts.profile.heartbeatIntervalMs);
    this.dashboardTimer = setInterval(() => this.renderLiveDashboard(), 1000);

    onShutdown(async () => {
      await this.stop("shutdown");
    });

    const mode = this.monitorOnly ? "monitor" : isLiveProfile(this.cfg, this.opts.profile) ? "live" : "paper";
    logger.info({ profile: this.opts.profileKey, slug: this.market.slug, mode }, "PolyPair Lock started");
    recordEvent("bot_start", { profile: this.opts.profileKey, slug: this.market.slug, mode });
  }

  async stop(reason = "manual"): Promise<void> {
    if (!this.running) return;
    this.running = false;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.dashboardTimer) clearInterval(this.dashboardTimer);

    await this.execution.cancelAll();
    this.ws?.stop();
    this.binance?.stop();
    closeDb();

    recordEvent("bot_stop", { reason, profile: this.opts.profileKey });
    logger.info({ reason }, "PolyPair Lock stopped");
  }

  private async bootstrapBooks(): Promise<void> {
    if (!this.market || !this.ws) return;
    for (const tokenId of [this.market.upTokenId, this.market.downTokenId]) {
      const snap = await fetchBookSnapshot(tokenId, this.cfg.clobApiUrl);
      if (snap) this.ws.upsertBook(snap);
    }
  }

  private async onBookTick(): Promise<void> {
    if (!this.running) return;
    await this.tick();
  }

  private async tick(): Promise<void> {
    if (!this.market || !this.ws) return;

    const upBook = this.ws.getBook(this.market.upTokenId);
    const downBook = this.ws.getBook(this.market.downTokenId);
    if (!upBook || !downBook) return;

    const signal = evaluatePairArbSignal(upBook, downBook, this.opts.profile, this.cfg.fees);
    this.lastEdge = signal;

    if (shouldCancelBeforeClose(this.opts.profile, this.market.closeTsMs)) {
      if (this.stateMachine.getPhase() !== "CLOSE") {
        this.stateMachine.transition("CLOSE", "near market close");
        await this.execution.cancelAll();
      }
      return;
    }

    if (this.monitorOnly) return;

    const mode = isLiveProfile(this.cfg, this.opts.profile) ? "live" : "paper";
    const invSnap = this.inventory.snapshot();
    const riskState = {
      hourlyPnlUsdc: getHourlyPnl(mode),
      dailyPnlUsdc: getDailyPnl(mode),
      marketSpendUsdc: this.marketSpendUsdc,
      inventory: invSnap,
      feedStaleMs: this.ws.lastUpdateAgeMs(),
      openTakerNotionalUsdc: this.execution.getOpenTakerNotional(),
    };

    const mergeCheck = evaluateMerge(this.inventory, this.opts.profile.mergeThreshold);
    if (mergeCheck.shouldMerge) {
      this.stateMachine.transition("MERGE", "threshold reached");
      const snap = this.inventory.snapshot();
      const upAvg = snap.upShares > 0 ? snap.upCostUsdc / snap.upShares : signal.upAsk;
      const downAvg = snap.downShares > 0 ? snap.downCostUsdc / snap.downShares : signal.downAsk;
      const result = await executeMerge(
        this.inventory,
        mergeCheck.pairs,
        upAvg,
        downAvg,
        this.cfg.fees,
        isLiveProfile(this.cfg, this.opts.profile),
      );
      if (result) {
        this.merges++;
        this.sessionPnlUsdc += result.profitUsdc;
        addPnlDelta(mode, result.profitUsdc);
        recordMerge({
          id: randomUUID(),
          ts: Date.now(),
          marketSlug: this.market.slug,
          pairs: result.pairs,
          profitUsdc: result.profitUsdc,
          mode,
        });
        this.stateMachine.transition("ENTER", "merge complete");
      }
    }

    if (needsRebalance(invSnap, this.opts.profile)) {
      this.stateMachine.transition("REBALANCE", "inventory skew");
      const priority = rebalancePriority(invSnap);
      if (priority && signal.shouldEnter) {
        await this.tryPairLock(signal, riskState, mode, priority);
      }
      return;
    }

    if (signal.shouldEnter) {
      this.stateMachine.transition("ARM", "edge detected");
      await this.tryPairLock(signal, riskState, mode);
    }
  }

  private async tryPairLock(
    signal: NonNullable<typeof this.lastEdge>,
    riskState: Parameters<typeof evaluateEntryRisk>[2],
    mode: "paper" | "live",
    rebalanceSide?: "UP" | "DOWN",
  ): Promise<void> {
    if (!this.market) return;

    const remainingSpend = this.opts.profile.maxSpendPerMarketUsdc - this.marketSpendUsdc;
    const size = balancedOrderSize(signal, this.opts.profile, remainingSpend);
    const notional = signal.combinedAsk * size;

    const risk = evaluateEntryRisk(this.cfg, this.opts.profile, riskState, this.market.closeTsMs, notional);
    if (!risk.allow) {
      logger.debug({ reason: risk.reason }, "entry blocked");
      return;
    }

    this.stateMachine.transition("ENTER", "executing dual taker");

    const result = await this.execution.executeDualTaker(
      this.market.upTokenId,
      this.market.downTokenId,
      signal.upAsk,
      signal.downAsk,
      size,
    );

    if (!result) {
      const partial = this.execution.getPaperExchange().simulatePartialFill(
        this.market.upTokenId,
        this.market.downTokenId,
        signal.upAsk,
        signal.downAsk,
        size,
        rebalanceSide === "UP" ? "DOWN" : "UP",
      );
      if (partial) {
        this.onFill(partial.side, partial.price, partial.size, mode);
        const hedge = planPartialFillHedge(
          {
            filledSide: partial.side,
            filledSize: partial.size,
            filledPrice: partial.price,
            missingSide: partial.side === "UP" ? "DOWN" : "UP",
          },
          this.ws!.getBook(this.market.upTokenId)!,
          this.ws!.getBook(this.market.downTokenId)!,
          this.inventory.snapshot(),
          this.opts.profile,
        );
        if (hedge) {
          const hedgeRisk = evaluateHedgeRisk(this.opts.profile, this.inventory.snapshot(), hedge.price * hedge.size);
          if (hedgeRisk.allow) {
            const hedgeFill = await this.execution.executeHedge(hedge.tokenId, hedge.side, hedge.price, hedge.size);
            if (hedgeFill) this.onFill(hedgeFill.side, hedgeFill.price, hedgeFill.size, mode);
          }
        }
      }
      return;
    }

    this.onFill("UP", result.up.price, result.up.size, mode);
    this.onFill("DOWN", result.down.price, result.down.size, mode);
    this.pairLocks++;
    this.marketSpendUsdc += result.notionalUsdc;
    this.execution.resetTakerExposure();

    const profit = computeLockedProfit(signal.upAsk, signal.downAsk, size, this.cfg.fees);
    this.sessionPnlUsdc += profit;
    addPnlDelta(mode, profit);

    logger.info(
      {
        size,
        combinedAsk: signal.combinedAsk,
        edge: signal.edge,
        profit: profit.toFixed(4),
      },
      "pair lock executed",
    );
    recordEvent("pair_lock", {
      slug: this.market.slug,
      size,
      edge: signal.edge,
      profit,
    });
  }

  private onFill(side: "UP" | "DOWN", price: number, size: number, mode: "paper" | "live"): void {
    if (!this.market) return;
    this.inventory.recordFill(side, price, size);
    recordFill({
      id: randomUUID(),
      ts: Date.now(),
      marketSlug: this.market.slug,
      side,
      price,
      size,
      mode,
      pnlDelta: 0,
    });
  }

  private heartbeat(): void {
    if (!this.market) return;
    logger.debug({
      phase: this.stateMachine.getPhase(),
      expiry: msToExpiry(this.market.closeTsMs),
      edge: this.lastEdge?.netEdge,
      pnl: this.sessionPnlUsdc,
    }, "heartbeat");
  }

  private renderLiveDashboard(): void {
    if (!this.market) return;
    const mode = this.monitorOnly ? "monitor" : isLiveProfile(this.cfg, this.opts.profile) ? "live" : "paper";
    const state: DashboardState = {
      profile: this.opts.profileKey,
      mode,
      marketSlug: this.market.slug,
      phase: this.stateMachine.getPhase(),
      edge: this.lastEdge,
      inventory: this.inventory.snapshot(),
      sessionPnlUsdc: this.sessionPnlUsdc,
      marketSpendUsdc: this.marketSpendUsdc,
      pairLocks: this.pairLocks,
      merges: this.merges,
      closeTsMs: this.market.closeTsMs,
      btcPrice: this.binance?.getLastPrice() || undefined,
      lastUpdate: Date.now(),
    };
    clearScreen();
    process.stdout.write(renderDashboard(state, this.opts.profile.targetEdge));
  }
}

export async function runRedeem(cfg: AppConfig, conditionId: string): Promise<void> {
  initLogger(cfg.logLevel, cfg.logPretty);
  const live = cfg.mode === "live" && cfg.confirmLive;
  const result = await redeemWinningPositions(conditionId, live);
  logger.info({ redeemed: result.redeemed }, "redeem complete");
}
