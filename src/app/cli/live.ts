import { loadConfig } from "../../config/load.js";
import type { ProfileKey } from "../../config/schema.js";
import { PolyPairLockBot } from "../bot.js";
import { initLogger, logger } from "../../utils/logger.js";

function parseProfile(): ProfileKey {
  const idx = process.argv.indexOf("--profile");
  if (idx >= 0 && process.argv[idx + 1]) {
    const p = process.argv[idx + 1] as ProfileKey;
    if (["BTC_5M", "BTC_15M", "BTC_1H"].includes(p)) return p;
  }
  return "BTC_5M";
}

async function main(): Promise<void> {
  const cfg = loadConfig();

  if (cfg.mode !== "live" || !cfg.confirmLive) {
    logger.warn("live mode requires MODE=live and CONFIRM_LIVE=true in .env");
  }

  if (!cfg.wallet.privateKey || !cfg.wallet.funderAddress) {
    initLogger(cfg.logLevel, cfg.logPretty);
    logger.error("POLYMARKET_PRIVATE_KEY and POLYMARKET_FUNDER_ADDRESS required for live");
    process.exit(1);
  }

  const profileKey = parseProfile();
  const profile = { ...cfg.profiles[profileKey], status: "live" as const };
  const liveCfg = { ...cfg, mode: "live" as const, confirmLive: true };

  const bot = new PolyPairLockBot(liveCfg, { profileKey, profile });
  await bot.start();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
