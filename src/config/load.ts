import { config as loadDotenv } from "dotenv";
import { readFileSync, existsSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import {
  AppConfigSchema,
  DEFAULT_PROFILES,
  type AppConfig,
  type ProfileKey,
  type TimeframeProfile,
} from "./schema.js";

loadDotenv();

function envBool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function envNum(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function envStr(key: string, fallback?: string): string | undefined {
  const v = process.env[key];
  return v !== undefined && v !== "" ? v : fallback;
}

function profileFromEnv(prefix: string, base: TimeframeProfile): TimeframeProfile {
  const status = envStr(`${prefix}_STATUS`) as TimeframeProfile["status"] | undefined;
  return {
    ...base,
    ...(status ? { status } : {}),
    targetEdge: envNum(`${prefix}_TARGET_EDGE`, base.targetEdge),
    mergeThreshold: envNum(`${prefix}_MERGE_THRESHOLD`, base.mergeThreshold),
    orderSizeUsdc: envNum(`${prefix}_ORDER_SIZE_USDC`, base.orderSizeUsdc),
    minAskSize: envNum(`${prefix}_MIN_ASK_SIZE`, base.minAskSize),
    stopBuyingBeforeCloseMs: envNum(`${prefix}_STOP_BUYING_BEFORE_CLOSE_MS`, base.stopBuyingBeforeCloseMs),
    maxSpendPerMarketUsdc: envNum(`${prefix}_MAX_SPEND_PER_MARKET_USDC`, base.maxSpendPerMarketUsdc),
    maxInventoryImbalanceUsdc: envNum(`${prefix}_MAX_INVENTORY_IMBALANCE_USDC`, base.maxInventoryImbalanceUsdc),
    maxTakerFillUsdc: envNum(`${prefix}_MAX_TAKER_FILL_USDC`, base.maxTakerFillUsdc),
    combinedAskStop: envNum(`${prefix}_COMBINED_ASK_STOP`, base.combinedAskStop),
    pollIntervalMs: envNum(`${prefix}_POLL_INTERVAL_MS`, base.pollIntervalMs),
    heartbeatIntervalMs: envNum(`${prefix}_HEARTBEAT_INTERVAL_MS`, base.heartbeatIntervalMs),
  };
}

function loadYamlProfiles(): Partial<AppConfig["profiles"]> {
  const path = "./config/profiles.yaml";
  if (!existsSync(path)) return {};
  try {
    const raw = parseYaml(readFileSync(path, "utf8")) as { profiles?: Partial<AppConfig["profiles"]> };
    return raw.profiles ?? {};
  } catch {
    return {};
  }
}

export function loadConfig(): AppConfig {
  const yamlProfiles = loadYamlProfiles();
  const mode = envStr("MODE", "paper") === "live" ? "live" : "paper";

  const raw = {
    mode,
    confirmLive: envBool("CONFIRM_LIVE", false),
    logLevel: envStr("LOG_LEVEL", "info"),
    logPretty: envBool("LOG_PRETTY", true),
    dbPath: envStr("DB_PATH", "./data/polypair.db"),
    gammaApiUrl: envStr("GAMMA_API_URL", "https://gamma-api.polymarket.com"),
    clobApiUrl: envStr("CLOB_API_URL", "https://clob.polymarket.com"),
    clobWsUrl: envStr("CLOB_WS_URL", "wss://ws-subscriptions-clob.polymarket.com/ws/market"),
    binanceWsUrl: envStr("BINANCE_WS_URL", "wss://stream.binance.com:9443/ws/btcusdt@trade"),
    profiles: {
      BTC_5M: { ...profileFromEnv("BTC_5M", DEFAULT_PROFILES.BTC_5M), ...yamlProfiles.BTC_5M },
      BTC_15M: { ...profileFromEnv("BTC_15M", DEFAULT_PROFILES.BTC_15M), ...yamlProfiles.BTC_15M },
      BTC_1H: { ...profileFromEnv("BTC_1H", DEFAULT_PROFILES.BTC_1H), ...yamlProfiles.BTC_1H },
    },
    risk: {
      maxLossPerHourUsdc: envNum("MAX_LOSS_PER_HOUR_USDC", 60),
      maxDailyLossUsdc: envNum("MAX_DAILY_LOSS_USDC", 150),
      killSwitchFile: envStr("KILL_SWITCH_FILE", ".killswitch") ?? ".killswitch",
      maxFeedStalenessMs: envNum("MAX_FEED_STALENESS_MS", 3000),
      allowExtremePrices: envBool("ALLOW_EXTREME_PRICES", false),
    },
    fees: {
      takerFeeBps: envNum("TAKER_FEE_BPS", 0),
      mergeGasUsdcEst: envNum("MERGE_GAS_USDC_EST", 0.02),
      slippageBps: envNum("SLIPPAGE_BPS", 15),
    },
    alerts: {
      telegramEnabled: envBool("TELEGRAM_ENABLED", false),
      telegramBotToken: envStr("TELEGRAM_BOT_TOKEN"),
      telegramChatId: envStr("TELEGRAM_CHAT_ID"),
      discordWebhookUrl: envStr("DISCORD_WEBHOOK_URL"),
    },
    wallet: {
      privateKey: envStr("POLYMARKET_PRIVATE_KEY"),
      funderAddress: envStr("POLYMARKET_FUNDER_ADDRESS"),
      rpcUrl: envStr("POLYGON_RPC_URL", "https://polygon-rpc.com"),
    },
  };

  return AppConfigSchema.parse(raw);
}

export function getActiveProfiles(cfg: AppConfig): Array<{ key: ProfileKey; profile: TimeframeProfile }> {
  return (Object.entries(cfg.profiles) as Array<[ProfileKey, TimeframeProfile]>)
    .filter(([, p]) => p.status !== "disabled")
    .map(([key, profile]) => ({ key, profile }));
}

export function isLiveProfile(cfg: AppConfig, profile: TimeframeProfile): boolean {
  return profile.status === "live" && cfg.mode === "live" && cfg.confirmLive;
}

export function isPaperProfile(profile: TimeframeProfile): boolean {
  return profile.status === "paper" || profile.status === "monitor";
}
