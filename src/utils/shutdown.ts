import { logger } from "./logger.js";

const handlers: Array<() => void | Promise<void>> = [];
let registered = false;

export function onShutdown(fn: () => void | Promise<void>): void {
  handlers.push(fn);
  if (!registered) {
    registered = true;
    for (const sig of ["SIGINT", "SIGTERM"] as const) {
      process.once(sig, () => void shutdown(sig));
    }
  }
}

async function shutdown(reason: string): Promise<void> {
  logger.info({ reason }, "graceful shutdown");
  for (const fn of handlers) {
    try {
      await fn();
    } catch (err) {
      logger.warn({ err }, "shutdown handler error");
    }
  }
  process.exit(0);
}
