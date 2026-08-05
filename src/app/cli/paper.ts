import { loadConfig } from "../../config/load.js";
import type { ProfileKey } from "../../config/schema.js";
import { PolyPairLockBot } from "../bot.js";
import { logger } from "../../utils/logger.js";

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
  const profileKey = parseProfile();
  const profile = cfg.profiles[profileKey];

  if (profile.status === "disabled") {
    logger.error({ profile: profileKey }, "profile is disabled");
    process.exit(1);
  }

  const bot = new PolyPairLockBot(cfg, { profileKey, profile });
  await bot.start();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
