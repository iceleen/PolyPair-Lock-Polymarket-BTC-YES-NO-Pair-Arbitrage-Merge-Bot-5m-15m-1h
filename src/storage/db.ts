import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { logger } from "../utils/logger.js";

export type FillRecord = {
  id: string;
  ts: number;
  marketSlug: string;
  side: "UP" | "DOWN";
  price: number;
  size: number;
  mode: "paper" | "live";
  pnlDelta: number;
};

export type MergeRecord = {
  id: string;
  ts: number;
  marketSlug: string;
  pairs: number;
  profitUsdc: number;
  mode: "paper" | "live";
};

export type EventRecord = {
  id: string;
  ts: number;
  type: string;
  payload: string;
};

let db: Database.Database | null = null;

export function initDb(dbPath: string): Database.Database {
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS fills (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      market_slug TEXT NOT NULL,
      side TEXT NOT NULL,
      price REAL NOT NULL,
      size REAL NOT NULL,
      mode TEXT NOT NULL,
      pnl_delta REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS merges (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      market_slug TEXT NOT NULL,
      pairs REAL NOT NULL,
      profit_usdc REAL NOT NULL,
      mode TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pnl_hourly (
      hour_ts INTEGER PRIMARY KEY,
      paper REAL NOT NULL DEFAULT 0,
      live REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS markets (
      slug TEXT PRIMARY KEY,
      condition_id TEXT,
      discovered_ts INTEGER,
      closed_ts INTEGER
    );
  `);
  logger.info({ dbPath }, "sqlite storage ready");
  return db;
}

export function getDb(): Database.Database {
  if (!db) throw new Error("DB not initialized — call initDb first");
  return db;
}

export function recordFill(fill: FillRecord): void {
  getDb()
    .prepare(
      `INSERT INTO fills (id, ts, market_slug, side, price, size, mode, pnl_delta)
       VALUES (@id, @ts, @marketSlug, @side, @price, @size, @mode, @pnlDelta)`,
    )
    .run(fill);
}

export function recordMerge(merge: MergeRecord): void {
  getDb()
    .prepare(
      `INSERT INTO merges (id, ts, market_slug, pairs, profit_usdc, mode)
       VALUES (@id, @ts, @marketSlug, @pairs, @profitUsdc, @mode)`,
    )
    .run(merge);
}

export function recordEvent(type: string, payload: Record<string, unknown>): void {
  getDb()
    .prepare(`INSERT INTO events (id, ts, type, payload) VALUES (@id, @ts, @type, @payload)`)
    .run({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ts: Date.now(),
      type,
      payload: JSON.stringify(payload),
    });
}

export function getHourlyPnl(mode: "paper" | "live"): number {
  const hourTs = Math.floor(Date.now() / (3600 * 1000)) * 3600 * 1000;
  const row = getDb()
    .prepare(`SELECT paper, live FROM pnl_hourly WHERE hour_ts = ?`)
    .get(hourTs) as { paper: number; live: number } | undefined;
  if (!row) return 0;
  return mode === "paper" ? row.paper : row.live;
}

export function getDailyPnl(mode: "paper" | "live"): number {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const row = getDb()
    .prepare(`SELECT COALESCE(SUM(pnl_delta), 0) as total FROM fills WHERE ts >= ? AND mode = ?`)
    .get(startOfDay.getTime(), mode) as { total: number };
  const mergeRow = getDb()
    .prepare(`SELECT COALESCE(SUM(profit_usdc), 0) as total FROM merges WHERE ts >= ? AND mode = ?`)
    .get(startOfDay.getTime(), mode) as { total: number };
  return row.total + mergeRow.total;
}

export function addPnlDelta(mode: "paper" | "live", delta: number): void {
  const hourTs = Math.floor(Date.now() / (3600 * 1000)) * 3600 * 1000;
  const col = mode === "paper" ? "paper" : "live";
  getDb()
    .prepare(
      `INSERT INTO pnl_hourly (hour_ts, paper, live) VALUES (?, 0, 0)
       ON CONFLICT(hour_ts) DO UPDATE SET ${col} = ${col} + ?`,
    )
    .run(hourTs, delta);
}

export function getSessionStats(mode: "paper" | "live"): {
  fills: number;
  merges: number;
  totalProfit: number;
} {
  const fills = getDb()
    .prepare(`SELECT COUNT(*) as n FROM fills WHERE mode = ?`)
    .get(mode) as { n: number };
  const merges = getDb()
    .prepare(`SELECT COUNT(*) as n, COALESCE(SUM(profit_usdc), 0) as profit FROM merges WHERE mode = ?`)
    .get(mode) as { n: number; profit: number };
  return { fills: fills.n, merges: merges.n, totalProfit: merges.profit };
}

export function closeDb(): void {
  db?.close();
  db = null;
}
