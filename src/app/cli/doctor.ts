import { loadConfig } from "../../config/load.js";
import { initLogger, logger } from "../../utils/logger.js";
import { fetchClobTime } from "../../clob/client.js";
import { discoverActiveMarket } from "../../marketDiscovery/gamma.js";

async function checkFetch(url: string, label: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      logger.warn({ label, status: res.status }, "health check failed");
      return false;
    }
    logger.info({ label }, "OK");
    return true;
  } catch (err) {
    logger.warn({ label, err }, "unreachable");
    return false;
  }
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  initLogger(cfg.logLevel, cfg.logPretty);

  console.log("");
  console.log("  PolyPair Lock — System Doctor");
  console.log("  ─────────────────────────────");
  console.log(`  Node.js: ${process.version}`);
  console.log("");

  const checks = await Promise.all([
    checkFetch(`${cfg.gammaApiUrl}/markets?limit=1`, "Gamma API"),
    fetchClobTime(cfg.clobApiUrl).then((ok) => {
      logger.info({ label: "CLOB API" }, ok ? "OK" : "FAILED");
      return ok;
    }),
  ]);

  const liveReady = Boolean(cfg.wallet.privateKey && cfg.wallet.funderAddress);
  logger.info({ mode: cfg.mode, confirmLive: cfg.confirmLive, liveReady }, "trading mode");

  for (const [key, p] of Object.entries(cfg.profiles)) {
    logger.info({ profile: key, status: p.status, prefix: p.slugPrefix, targetEdge: p.targetEdge }, "profile");
    if (p.status !== "disabled") {
      const market = await discoverActiveMarket(p, cfg.gammaApiUrl);
      if (market) {
        logger.info({ slug: market.slug, closes: new Date(market.closeTsMs).toISOString() }, "market discovery");
      } else {
        logger.warn({ profile: key }, "no active market found (may be between windows)");
      }
    }
  }

  console.log("");
  console.log("  Risk knobs:");
  console.log(`    MAX_LOSS_PER_HOUR_USDC: ${cfg.risk.maxLossPerHourUsdc}`);
  console.log(`    MAX_DAILY_LOSS_USDC:    ${cfg.risk.maxDailyLossUsdc}`);
  console.log(`    MAX_FEED_STALENESS_MS:  ${cfg.risk.maxFeedStalenessMs}`);
  console.log("");

  if (cfg.mode === "live" && cfg.confirmLive && !liveReady) {
    logger.error("live mode requested but wallet keys missing");
    process.exit(1);
  }

  process.exit(checks.every(Boolean) ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
