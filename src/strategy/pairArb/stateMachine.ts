export type MarketPhase =
  | "DISCOVER"
  | "QUOTE"
  | "ARM"
  | "ENTER"
  | "REBALANCE"
  | "MERGE"
  | "CLOSE"
  | "REDEEM";

export type StateTransition = {
  from: MarketPhase;
  to: MarketPhase;
  reason: string;
};

const VALID_TRANSITIONS: Record<MarketPhase, MarketPhase[]> = {
  DISCOVER: ["QUOTE"],
  QUOTE: ["ARM", "CLOSE"],
  ARM: ["ENTER", "QUOTE", "CLOSE"],
  ENTER: ["REBALANCE", "MERGE", "CLOSE"],
  REBALANCE: ["ENTER", "MERGE", "CLOSE"],
  MERGE: ["ENTER", "CLOSE"],
  CLOSE: ["REDEEM"],
  REDEEM: ["DISCOVER"],
};

export class MarketStateMachine {
  private phase: MarketPhase = "DISCOVER";
  private history: StateTransition[] = [];

  getPhase(): MarketPhase {
    return this.phase;
  }

  getHistory(): StateTransition[] {
    return [...this.history];
  }

  transition(to: MarketPhase, reason: string): boolean {
    const allowed = VALID_TRANSITIONS[this.phase];
    if (!allowed.includes(to)) return false;
    this.history.push({ from: this.phase, to, reason });
    this.phase = to;
    return true;
  }

  force(to: MarketPhase, reason: string): void {
    this.history.push({ from: this.phase, to, reason });
    this.phase = to;
  }

  reset(): void {
    this.phase = "DISCOVER";
    this.history = [];
  }
}

export function phaseLabel(phase: MarketPhase): string {
  const labels: Record<MarketPhase, string> = {
    DISCOVER: "Discovering market",
    QUOTE: "Streaming books",
    ARM: "Edge detected — arming",
    ENTER: "Entering pair lock",
    REBALANCE: "Rebalancing inventory",
    MERGE: "Merging pairs → USDC",
    CLOSE: "Closing window",
    REDEEM: "Redeeming leftovers",
  };
  return labels[phase];
}
