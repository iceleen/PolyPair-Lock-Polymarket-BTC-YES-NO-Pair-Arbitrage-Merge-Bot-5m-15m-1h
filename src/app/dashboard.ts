import type { EdgeSnapshot } from "../strategy/pairArb/edge.js";
import type { InventorySnapshot } from "../inventory/manager.js";
import type { MarketPhase } from "../strategy/pairArb/stateMachine.js";
import { phaseLabel } from "../strategy/pairArb/stateMachine.js";
import { formatDuration, msToExpiry } from "../utils/time.js";

export type DashboardState = {
  profile: string;
  mode: "paper" | "live" | "monitor";
  marketSlug: string;
  phase: MarketPhase;
  edge: EdgeSnapshot | null;
  inventory: InventorySnapshot;
  sessionPnlUsdc: number;
  marketSpendUsdc: number;
  pairLocks: number;
  merges: number;
  closeTsMs: number;
  btcPrice?: number;
  lastUpdate: number;
};

const CLEAR = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const MAGENTA = "\x1b[35m";

function edgeColor(edge: number, target: number): string {
  if (edge >= target) return GREEN;
  if (edge >= target * 0.5) return YELLOW;
  return RED;
}

export function renderDashboard(state: DashboardState, targetEdge: number): string {
  const lines: string[] = [];
  const w = 72;
  const bar = "═".repeat(w);

  lines.push("");
  lines.push(`${BOLD}${CYAN}╔${bar}╗${CLEAR}`);
  lines.push(`${BOLD}${CYAN}║${CLEAR} ${BOLD}PolyPair Lock${CLEAR} — BTC YES+NO Pair Arbitrage Dashboard${" ".repeat(18)}${BOLD}${CYAN}║${CLEAR}`);
  lines.push(`${BOLD}${CYAN}╠${bar}╣${CLEAR}`);

  const expiry = msToExpiry(state.closeTsMs);
  lines.push(`${BOLD}${CYAN}║${CLEAR} Profile: ${BOLD}${state.profile}${CLEAR}  Mode: ${state.mode.toUpperCase()}  Phase: ${MAGENTA}${phaseLabel(state.phase)}${CLEAR}${" ".repeat(Math.max(0, w - 50))}${BOLD}${CYAN}║${CLEAR}`);
  lines.push(`${BOLD}${CYAN}║${CLEAR} Market: ${DIM}${state.marketSlug}${CLEAR}${" ".repeat(Math.max(0, w - 10 - state.marketSlug.length))}${BOLD}${CYAN}║${CLEAR}`);
  lines.push(`${BOLD}${CYAN}║${CLEAR} Expires in: ${formatDuration(expiry)}${" ".repeat(Math.max(0, w - 20))}${BOLD}${CYAN}║${CLEAR}`);
  lines.push(`${BOLD}${CYAN}╠${bar}╣${CLEAR}`);

  if (state.edge) {
    const e = state.edge;
    const ec = edgeColor(e.netEdge, targetEdge);
    lines.push(`${BOLD}${CYAN}║${CLEAR} ${BOLD}EDGE ANALYSIS${CLEAR}${" ".repeat(w - 15)}${BOLD}${CYAN}║${CLEAR}`);
    lines.push(`${BOLD}${CYAN}║${CLEAR}   UP ask:   ${e.upAsk.toFixed(4)}  (${e.upAskSize.toFixed(1)} shares)${" ".repeat(Math.max(0, w - 40))}${BOLD}${CYAN}║${CLEAR}`);
    lines.push(`${BOLD}${CYAN}║${CLEAR}   DOWN ask: ${e.downAsk.toFixed(4)}  (${e.downAskSize.toFixed(1)} shares)${" ".repeat(Math.max(0, w - 42))}${BOLD}${CYAN}║${CLEAR}`);
    lines.push(`${BOLD}${CYAN}║${CLEAR}   Combined: ${BOLD}${e.combinedAsk.toFixed(4)}${CLEAR}   Raw edge: ${e.edge.toFixed(4)}   Net edge: ${ec}${e.netEdge.toFixed(4)}${CLEAR}${" ".repeat(Math.max(0, w - 55))}${BOLD}${CYAN}║${CLEAR}`);
    lines.push(`${BOLD}${CYAN}║${CLEAR}   Liquidity: ${e.liquidityOk ? `${GREEN}OK${CLEAR}` : `${RED}THIN${CLEAR}`}   Max pair size: ${e.maxPairSize.toFixed(1)}${" ".repeat(Math.max(0, w - 45))}${BOLD}${CYAN}║${CLEAR}`);
  }

  lines.push(`${BOLD}${CYAN}╠${bar}╣${CLEAR}`);
  lines.push(`${BOLD}${CYAN}║${CLEAR} ${BOLD}INVENTORY${CLEAR}${" ".repeat(w - 11)}${BOLD}${CYAN}║${CLEAR}`);
  const inv = state.inventory;
  lines.push(`${BOLD}${CYAN}║${CLEAR}   UP: ${inv.upShares.toFixed(1)} shares ($${inv.upCostUsdc.toFixed(2)})   DOWN: ${inv.downShares.toFixed(1)} shares ($${inv.downCostUsdc.toFixed(2)})${" ".repeat(Math.max(0, w - 55))}${BOLD}${CYAN}║${CLEAR}`);
  lines.push(`${BOLD}${CYAN}║${CLEAR}   Matched pairs: ${inv.matchedPairs.toFixed(1)}   Merged: ${inv.mergedPairs.toFixed(0)}   Imbalance: $${inv.imbalanceUsdc.toFixed(2)}${" ".repeat(Math.max(0, w - 55))}${BOLD}${CYAN}║${CLEAR}`);

  lines.push(`${BOLD}${CYAN}╠${bar}╣${CLEAR}`);
  lines.push(`${BOLD}${CYAN}║${CLEAR} ${BOLD}PnL${CLEAR}${" ".repeat(w - 5)}${BOLD}${CYAN}║${CLEAR}`);
  const pnlColor = state.sessionPnlUsdc >= 0 ? GREEN : RED;
  lines.push(`${BOLD}${CYAN}║${CLEAR}   Session PnL: ${pnlColor}$${state.sessionPnlUsdc.toFixed(4)}${CLEAR}   Locked profit: ${GREEN}$${inv.lockedProfitUsdc.toFixed(4)}${CLEAR}${" ".repeat(Math.max(0, w - 50))}${BOLD}${CYAN}║${CLEAR}`);
  lines.push(`${BOLD}${CYAN}║${CLEAR}   Pair locks: ${state.pairLocks}   Merges: ${state.merges}   Market spend: $${state.marketSpendUsdc.toFixed(2)}${" ".repeat(Math.max(0, w - 50))}${BOLD}${CYAN}║${CLEAR}`);

  if (state.btcPrice) {
    lines.push(`${BOLD}${CYAN}║${CLEAR}   BTC (diag): $${state.btcPrice.toFixed(2)}${" ".repeat(Math.max(0, w - 25))}${BOLD}${CYAN}║${CLEAR}`);
  }

  lines.push(`${BOLD}${CYAN}╚${bar}╝${CLEAR}`);
  lines.push("");

  return lines.join("\n");
}

export function clearScreen(): void {
  process.stdout.write("\x1b[2J\x1b[H");
}
