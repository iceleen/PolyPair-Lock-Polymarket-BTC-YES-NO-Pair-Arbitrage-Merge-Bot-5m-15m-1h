import { z } from "zod";

export const ProfileStatusSchema = z.enum(["live", "paper", "monitor", "disabled"]);

export const TimeframeProfileSchema = z.object({
  status: ProfileStatusSchema.default("paper"),
  slugPrefix: z.string(),
  windowSeconds: z.number().int().positive(),
  targetEdge: z.number().positive().default(0.005),
  mergeThreshold: z.number().positive().default(10),
  orderSizeUsdc: z.number().positive().default(8),
  minAskSize: z.number().positive().default(5),
  stopBuyingBeforeCloseMs: z.number().int().positive().default(45_000),
  maxSpendPerMarketUsdc: z.number().positive().default(100),
  maxInventoryImbalanceUsdc: z.number().positive().default(25),
  maxTakerFillUsdc: z.number().positive().default(15),
  combinedAskStop: z.number().positive().default(0.992),
  pollIntervalMs: z.number().int().positive().default(500),
  heartbeatIntervalMs: z.number().int().positive().default(15_000),
});

export const RiskSchema = z.object({
  maxLossPerHourUsdc: z.number().positive().default(60),
  maxDailyLossUsdc: z.number().positive().default(150),
  killSwitchFile: z.string().default(".killswitch"),
  maxFeedStalenessMs: z.number().int().positive().default(3000),
  allowExtremePrices: z.boolean().default(false),
});

export const FeeModelSchema = z.object({
  takerFeeBps: z.number().min(0).default(0),
  mergeGasUsdcEst: z.number().min(0).default(0.02),
  slippageBps: z.number().min(0).default(15),
});

export const AppConfigSchema = z.object({
  mode: z.enum(["paper", "live"]).default("paper"),
  confirmLive: z.boolean().default(false),
  logLevel: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
  logPretty: z.boolean().default(true),
  dbPath: z.string().default("./data/polypair.db"),
  gammaApiUrl: z.string().url().default("https://gamma-api.polymarket.com"),
  clobApiUrl: z.string().url().default("https://clob.polymarket.com"),
  clobWsUrl: z.string().url().default("wss://ws-subscriptions-clob.polymarket.com/ws/market"),
  binanceWsUrl: z.string().default("wss://stream.binance.com:9443/ws/btcusdt@trade"),
  profiles: z.object({
    BTC_5M: TimeframeProfileSchema,
    BTC_15M: TimeframeProfileSchema,
    BTC_1H: TimeframeProfileSchema,
  }),
  risk: RiskSchema,
  fees: FeeModelSchema,
  alerts: z.object({
    telegramEnabled: z.boolean().default(false),
    telegramBotToken: z.string().optional(),
    telegramChatId: z.string().optional(),
    discordWebhookUrl: z.string().optional(),
  }),
  wallet: z.object({
    privateKey: z.string().optional(),
    funderAddress: z.string().optional(),
    rpcUrl: z.string().default("https://polygon-rpc.com"),
  }),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
export type TimeframeProfile = z.infer<typeof TimeframeProfileSchema>;
export type ProfileKey = keyof AppConfig["profiles"];
export type FeeModel = z.infer<typeof FeeModelSchema>;

export const DEFAULT_PROFILES: AppConfig["profiles"] = {
  BTC_5M: {
    status: "paper",
    slugPrefix: "btc-updown-5m",
    windowSeconds: 300,
    targetEdge: 0.005,
    mergeThreshold: 10,
    orderSizeUsdc: 8,
    minAskSize: 5,
    stopBuyingBeforeCloseMs: 45_000,
    maxSpendPerMarketUsdc: 100,
    maxInventoryImbalanceUsdc: 25,
    maxTakerFillUsdc: 15,
    combinedAskStop: 0.992,
    pollIntervalMs: 500,
    heartbeatIntervalMs: 15_000,
  },
  BTC_15M: {
    status: "monitor",
    slugPrefix: "btc-updown-15m",
    windowSeconds: 900,
    targetEdge: 0.004,
    mergeThreshold: 15,
    orderSizeUsdc: 12,
    minAskSize: 8,
    stopBuyingBeforeCloseMs: 90_000,
    maxSpendPerMarketUsdc: 180,
    maxInventoryImbalanceUsdc: 40,
    maxTakerFillUsdc: 25,
    combinedAskStop: 0.994,
    pollIntervalMs: 800,
    heartbeatIntervalMs: 20_000,
  },
  BTC_1H: {
    status: "monitor",
    slugPrefix: "btc-updown-1h",
    windowSeconds: 3600,
    targetEdge: 0.003,
    mergeThreshold: 20,
    orderSizeUsdc: 15,
    minAskSize: 10,
    stopBuyingBeforeCloseMs: 180_000,
    maxSpendPerMarketUsdc: 250,
    maxInventoryImbalanceUsdc: 60,
    maxTakerFillUsdc: 35,
    combinedAskStop: 0.996,
    pollIntervalMs: 1500,
    heartbeatIntervalMs: 30_000,
  },
};
