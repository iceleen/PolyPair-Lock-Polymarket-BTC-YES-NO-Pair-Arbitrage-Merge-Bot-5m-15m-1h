import { logger } from "../utils/logger.js";
import type { AppConfig } from "../config/schema.js";

export async function sendTelegramAlert(cfg: AppConfig, message: string): Promise<void> {
  if (!cfg.alerts.telegramEnabled || !cfg.alerts.telegramBotToken || !cfg.alerts.telegramChatId) return;
  try {
    const url = `https://api.telegram.org/bot${cfg.alerts.telegramBotToken}/sendMessage`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: cfg.alerts.telegramChatId, text: message }),
    });
  } catch (err) {
    logger.warn({ err }, "telegram alert failed");
  }
}
