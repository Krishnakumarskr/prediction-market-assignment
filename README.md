# Prediction Market Aggregator

A real-time order book aggregator and smart order routing engine for prediction markets. Built for the question:

> **"Will the US recognize Reza Pahlavi as leader of Iran in 2026?"**

Combines live liquidity from **Kalshi** and **Polymarket** into a unified order book, then computes the optimal fill strategy across both venues — showing users exactly how many shares they get, at what average price, and how much better that is than trading on a single platform.

---

## What Problem This Solves

Prediction markets are fragmented. The same question trades on multiple venues simultaneously, and each venue has its own liquidity pool. A user buying YES shares on Kalshi alone might get a worse average price than if they swept the cheapest asks across both Kalshi and Polymarket together.

This app makes that arbitrage visible and actionable:
- It aggregates both order books in real time
- It runs a greedy sweep algorithm across the combined ask side
- It shows a side-by-side comparison of single-venue fills vs. smart-routed fills
- It highlights which specific rows in the order book your budget consumes

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                 MarketDashboard                  │
│   (owns: outcome, filter, budget, fillResult)    │
└────────────────┬───────────────┬────────────────┘
                 │               │
    ┌────────────▼───┐    ┌──────▼──────────┐
    │ OrderBookTable │    │   QuotePanel    │
    │  (aggregated   │    │  (budget input, │
    │   levels +     │    │   fill preview, │
    │   walk highlight│   │   venue compare)│
    └────────────────┘    └─────────────────┘
                 │
    ┌────────────▼────────────────────────┐
    │           useCombinedBook           │
    │  mergeOrderBooks(kalshi, poly, filter)│
    └──────────────┬──────────────────────┘
                   │
        ┌──────────┴───────────┐
        │                      │
┌───────▼──────┐     ┌─────────▼────────┐
│ useKalshiBook│     │usePolymarketBook  │
│ DFlow WS     │     │Polymarket CLOB WS │
│ (no reconnect│     │(reconnects on     │
│  on outcome) │     │ outcome change)   │
└──────────────┘     └──────────────────┘
```

---

## Order Book Normalization & Merging

### Price Level Aggregation

When the combined view is active, Kalshi and Polymarket may have liquidity at the same price point. Instead of showing two separate rows at `21.0¢`, the app merges them into a single aggregated row.

```
aggregateLevels(levels: OrderLevel[]): AggregatedLevel[]
```

Each `AggregatedLevel` tracks:
- `totalSize` — combined shares across all venues at this price
- `kalshiSize` — Kalshi's contribution
- `polySize` — Polymarket's contribution

The venue split drives the split depth bar and the dual-source indicator in the UI.

### Venue Filter

Three views are available: **Combined**, **Kalshi only**, **Polymarket only**. The filter is applied before aggregation — single-venue views show only that venue's levels.

---

## Smart Order Routing Engine

The core of the product. Given a dollar budget, the engine finds the optimal fill by sweeping the combined ask side from cheapest to most expensive.

### Algorithm: Greedy Price Sweep

```
function sweepAsks(asks: OrderLevel[], budget: number):
  sort asks ascending by price
  for each level:
    if budget >= level.price × level.size:
      take the full level  → shares += level.size, cost += level.price × level.size
    else:
      take a partial fill  → shares += budget / level.price, cost += budget
      budget = 0
      break
  return { fills, totalShares, totalCost }
```

**Why this is optimal:** In a limit order book, taking the cheapest available shares first minimizes average cost for any given budget. There is no rearrangement of fills that produces more shares for the same spend.

### Single-Venue Comparison

The engine runs three separate sweeps:
1. **Combined** — across the merged ask book (the smart-routed result)
2. **Kalshi only** — restricted to Kalshi's asks
3. **Polymarket only** — restricted to Polymarket's asks

This produces `SingleVenueFill` objects for each venue: `{ shares, cost, avgPrice }`. The UI uses these to show:

- How many shares you'd get on Kalshi alone
- How many shares you'd get on Polymarket alone
- How many shares smart routing delivers
- The delta: **+N.NN shares** over the best single venue
- The avg price savings: **X.XX% cheaper** per share

### Savings Calculation

```
savingsVsKalshi     = (kalshiAvgPrice − smartAvgPrice) / kalshiAvgPrice
savingsVsPolymarket = (polyAvgPrice   − smartAvgPrice) / polyAvgPrice
```

A positive value means smart routing delivers a lower average cost per share.

---

## UI Features

### Order Book Table

- **Aggregated rows** — same price from multiple venues merged into one row
- **Dual-source indicator** — single colored dot for one venue; split-circle gradient (half blue / half orange) when both venues share a price level
- **Split depth bar** — the horizontal background bar is a CSS gradient split by venue proportion. Example: if 60% of size at a level is from Polymarket and 40% from Kalshi, the bar is 60% orange tint and 40% blue tint
- **Flash animations** — rows flash green (size increased) or red (size decreased) on updates
- **Venue breakdown tooltip** — hovering the size shows a popover: `Kalshi: 5.6K | Polymarket: 9.3K | Total: 14.9K`
- **Asks anchored to bottom** — the ask section uses `flex-col-reverse` so the best ask always sits just above the spread, with deeper asks scrolling upward
- **Crossed market detection** — if `bestBid ≥ bestAsk`, the spread row shows a red "crossed market" badge instead of mid/spread values
- **Scrollable, no level cap** — both bid and ask sections are independently scrollable with no artificial limit on displayed levels

### Quote Panel

- **YES / NO toggle** — switches the active outcome; the active button shows the current best ask price inline (e.g. `YES  21.50¢`)
- **Live fill preview** — updates on every keystroke; no submit required
- **Venue comparison table** — shows Kalshi-alone and Polymarket-alone fills with shares and avg price; the better single venue gets a `BEST` badge
- **Smart routing summary** — total shares, avg price, total cost
- **Share improvement callout** — green banner showing `+N.NN shares more vs [best venue]` with avg price savings %
- **Fill split bar** — proportional blue/orange bar showing how the budget was divided between venues
- **Per-venue cards** — detailed breakdown of shares and cost allocated to each venue

### Venue Status Bar

Each venue shows a real-time connection indicator:
- `live` — pulsing green dot
- `stale` — yellow dot (no data for > 30 seconds)
- `disconnected` — red dot
- `connecting` — grey dot with pulse

---

## Running Locally

```sh
# Install dependencies (from monorepo root)
pnpm install

# Start the web app
pnpm turbo dev --filter=web
```

App runs at `http://localhost:3000`. No API keys required — the DFlow dev endpoint is open, and Polymarket's CLOB WebSocket is public.

To point to a different market, edit two fields in [`apps/web/src/config/market.ts`](apps/web/src/config/market.ts):

```ts
export const MARKET_CONFIG = {
  kalshi:      { ticker: "YOUR_KALSHI_TICKER" },
  polymarket:  { slug: "your-polymarket-slug" },
}
```

---

## What I'd Improve With More Time

### WebSocket & Data Pipeline

**Order book update throttling**
Right now every incoming WebSocket message triggers a React state update, which triggers a full re-render of the order book. In practice, Polymarket can fire 10–20 `price_change` deltas per second during active trading. Each delta individually produces a visible DOM update, which is wasted work. It can be throttled to 5 or 6 updates per second.



**Reconnect jitter**
The current exponential backoff (`Math.min(1000 * 2^attempt, 30s)`) is deterministic. If many clients disconnect simultaneously (e.g. a server restart), they all retry on the same schedule, creating a thundering herd. Adding randomized jitter — `delay * (0.5 + Math.random() * 0.5)` — spreads reconnect attempts across time.

**DFlow heartbeat**
Polymarket has an explicit `PING` → `PONG` keepalive. DFlow does not, so silent drops (firewall idle-connection timeouts, typically at 60–90s) could leave the hook in `live` status with a stale book. A proactive ping-style message or a tighter stale threshold would catch this earlier.

### Price Precision & Aggregation


**Tick size alignment**
Kalshi and Polymarket may not share the same minimum price increment. Aggregating them as-is works today, but a proper implementation would re-bucket Polymarket levels to the nearest Kalshi tick before merging.

### Quote Engine

**Sell-side routing**
The current engine only handles buying (sweeping asks). Routing across bids for a seller — finding the best venue split to exit a position — would use the same greedy sweep in reverse and would be a natural extension.

**Slippage curve**
Rather than a single budget → fill preview, computing the full curve (shares received at $10, $50, $100, $500, $1000) and rendering it as a chart would give traders an intuitive view of market depth and price impact before they commit a size.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Components | shadcn/ui (Tooltip, etc.) |
| Fonts | Playfair Display · DM Sans · DM Mono |
| State | React hooks only — no external state library |
| Data | DFlow WebSocket (Kalshi) · Polymarket CLOB WebSocket |
| Build | Turborepo monorepo |
