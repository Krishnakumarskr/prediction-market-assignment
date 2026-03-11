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

## Data Sources & WebSocket Architecture

### Kalshi — via DFlow WebSocket

**Endpoint:** `wss://dev-prediction-markets-api.dflow.net/api/v1/ws`

DFlow sends a full-book replacement on every update. No delta handling needed — each message replaces the entire book state.

**Subscription message:**
```json
{
  "type": "subscribe",
  "channel": "orderbook",
  "tickers": ["KXRECOGPERSONIRAN-26"],
  "initial_dump": true
}
```

**Message structure:**
```json
{
  "channel": "orderbook",
  "type": "orderbook",
  "market_ticker": "KXRECOGPERSONIRAN-26",
  "yes_bids": { "0.21": 1500, "0.20": 3200 },
  "no_bids":  { "0.79": 800,  "0.80": 1200 }
}
```

**Key insight:** `yes_bids` is not a pure bid book. It contains ALL YES-side orders — genuine buy bids below market AND limit sell orders at or above market. A naïve mapping would show bids at 80¢ alongside asks at 20¢, producing a negative spread.

**Normalization algorithm:**
1. Derive YES asks from `no_bids`: `ask_price = 1 − no_bid_price`
2. Find `minYESAsk` = lowest derived ask price
3. `yes_bids` entries **below** `minYESAsk` → genuine YES bids
4. `yes_bids` entries **at or above** `minYESAsk` → limit sell orders → YES asks

**NO outcome (symmetric):**
- `no_bids` → NO bids directly (prices already in NO scale)
- Genuine `yes_bids` (price < `minYESAsk`) → NO asks via `(1 − price)`
- Stale `yes_bids` (price ≥ `minYESAsk`) are skipped to avoid nonsensically cheap NO asks

**Outcome toggle without reconnect:** The raw DFlow message contains both `yes_bids` and `no_bids`, so the same WebSocket subscription serves both outcomes. When the user switches YES↔NO, the hook immediately re-normalizes the last cached raw message — no round-trip to the server.

### Polymarket — via CLOB WebSocket

**Phase 1 — Token discovery:**
```
GET https://gamma-api.polymarket.com/markets?slug=us-recognizes-reza-pahlavi-as-leader-of-iran-in2026
```
`clobTokenIds` is a JSON-stringified array: `'["token_yes_id", "token_no_id"]'`. YES = index 0, NO = index 1.

**Phase 2 — WebSocket subscription:**
```
wss://ws-subscriptions-clob.polymarket.com/ws/market
```
```json
{ "assets_ids": ["<token_id>"], "type": "market", "initial_dump": true, "level": 2 }
```

**Two event types handled:**
- `book` — full snapshot, replaces local state entirely
- `price_change` — delta updates: `size "0"` removes a level, otherwise upserts

**Delta handling:** Price levels are keyed by their original price string (not float) to avoid floating-point drift. Levels are converted to floats only for display and sorting.

**Outcome toggle with reconnect:** Since YES and NO are separate token IDs on Polymarket, switching outcome triggers a full reconnect with the new token ID. The book resets to empty while the new snapshot loads.

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

## "Walking the Book" Highlight

When a user enters a budget, the order book visually shows which rows are consumed by the fill.

**How it works:**
1. `fillResult.fills` is an array of `FillLevel` objects, each with `{ price, size, cost, venue }`
2. The fill sizes at each price are summed (across venues) and compared against the aggregated level's `totalSize`
3. `consumedFraction = filledSize / totalSize` — a value from 0 to 1

**Styling of consumed rows:**
- **Left border:** 3px solid in the venue's color (blue for Kalshi, orange for Polymarket, blue for mixed)
- **Background tint:** semi-transparent venue-colored overlay on top of the depth bar
- **Bold text:** price and size become `font-weight: 700`
- **Partial row indicator:** the last partially-filled row shows a `~` prefix on the price
- **Smooth animation:** `transition-all duration-300` so the highlighted zone slides up or down as the budget changes

The visual result: as a user types a budget, a "watermark" climbs up the ask side of the order book, showing exactly how deep into the book the order reaches.

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

## Project Structure

```
apps/web/
├── app/
│   ├── layout.tsx               # Google Fonts: Playfair Display, DM Sans, DM Mono
│   ├── page.tsx                 # Renders MarketDashboard
│   └── globals.css              # Light theme CSS variables, flash keyframes, scrollbar styles
├── src/
│   ├── config/
│   │   └── market.ts            # Market tickers, WebSocket URLs, thresholds
│   ├── types/
│   │   └── orderbook.ts         # OrderLevel, AggregatedLevel, FillResult, VenueOrderBook, ...
│   ├── lib/
│   │   ├── normalizer.ts        # DFlow YES/NO normalization, Polymarket snapshot + delta
│   │   ├── orderbook.ts         # mergeOrderBooks, aggregateLevels, getMidPrice, getSpread
│   │   └── quoteEngine.ts       # sweepAsks, calculateFill, single-venue comparison
│   └── hooks/
│       ├── useKalshiBook.ts     # DFlow WebSocket, exponential backoff, stale detection
│       ├── usePolymarketBook.ts # Polymarket token discovery + CLOB WebSocket
│       └── useCombinedBook.ts   # useMemo wrapper over mergeOrderBooks
└── components/
    ├── MarketDashboard.tsx      # Root client component, owns all shared state
    ├── MarketHeader.tsx         # Question title, outcome badge
    ├── VenueStatus.tsx          # Per-venue connection status dot
    ├── OrderBookTable.tsx       # Aggregated order book with walk highlight
    └── QuotePanel.tsx           # Budget input, fill preview, venue comparison
```

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
