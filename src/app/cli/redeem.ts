import { loadConfig } from "../../config/load.js";
import { runRedeem } from "../bot.js";
import { initLogger, logger } from "../../utils/logger.js";

async function main(): Promise<void> {
  const cfg = loadConfig();
  initLogger(cfg.logLevel, cfg.logPretty);

  const idx = process.argv.indexOf("--condition");
  const conditionId = idx >= 0 ? process.argv[idx + 1] : undefined;

  if (!conditionId) {
    logger.error("Usage: npm run redeem -- --condition <conditionId>");
    process.exit(1);
  }

  await runRedeem(cfg, conditionId);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
