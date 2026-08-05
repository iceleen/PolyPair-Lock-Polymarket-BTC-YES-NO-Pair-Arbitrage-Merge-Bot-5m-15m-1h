# Contributing to PolyPair Lock

Thank you for your interest in PolyPair Lock. This project is built for **real trading infrastructure** — contributions that improve live execution safety and profitability are especially welcome.

## What We're Looking For

### Live Trading (Highest Priority)

1. **CLOB client integration** — wire `@polymarket/clob-client-v2` with EIP-712 signing, L1/L2 credential derive/refresh
2. **Dual-leg atomicity** — handle partial fills, immediate hedge/flatten under imbalance limits
3. **Merge automation** — Polygon CTF contract integration to merge matched UP+DOWN pairs back to USDC
4. **Post-resolution redeem** — auto-redeem winning leftovers after market settlement
5. **Fill quality metrics** — slippage, latency, and fee calibration from production sessions

### Strategy & Risk

6. **Edge calibration** — tune `TARGET_EDGE`, fee model, and slippage assumptions against real fills
7. **Inventory safety** — improve rebalance and partial-fill hedge logic
8. **Multi-timeframe orchestration** — run 5m / 15m / 1h profiles concurrently with shared risk caps

### Observability

9. **Web dashboard** — React UI replacing CLI dashboard
10. **Telegram / Discord alerts** — pair lock, merge, circuit breaker events
11. **Backtest harness** — replay captured order book snapshots (no historical data bundled)

## Development Setup

```bash
git clone https://github.com/YOUR_USERNAME/PolyPair-Lock-Polymarket-BTC-YES-NO-Pair-Arbitrage-Merge-Bot-5m-15m-1h.git
cd PolyPair-Lock-Polymarket-BTC-YES-NO-Pair-Arbitrage-Merge-Bot-5m-15m-1h
npm install
cp .env.example .env
npm run doctor
npm test
npm run paper
```

## Pull Request Guidelines

- Keep PRs focused — one concern per PR
- Add or update tests for strategy/risk logic changes
- Match existing TypeScript strict style and module layout
- Document new ENV knobs in `.env.example`
- Never commit `.env`, private keys, or wallet credentials

## Discuss First

The developer **wants to discuss this project openly**. Before large architectural changes, open a GitHub Discussion or Issue describing your approach. If you've run live sessions on Polymarket BTC Up/Down markets, sharing anonymized fill data is extremely valuable.

Let's make this bot more profitable together.
