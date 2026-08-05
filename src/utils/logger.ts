import pino from "pino";

export let logger = pino({ level: "info" });

export function initLogger(level: string, pretty: boolean): void {
  logger = pino({
    level,
    transport: pretty
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } }
      : undefined,
  });
}
