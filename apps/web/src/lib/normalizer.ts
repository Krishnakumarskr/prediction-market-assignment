import type {
  DFlowOrderbookMessage,
  OrderLevel,
  PolymarketBookEvent,
  PolymarketPriceChange,
} from "@/src/types/orderbook";

/** Normalize a DFlow full-book message for the YES or NO outcome.
 *
 *  DFlow structure:
 *   yes_bids — ALL YES-side orders: genuine buy bids (< market) AND limit sells (≥ market)
 *   no_bids  — people bidding to buy NO
 *
 *  YES algorithm:
 *   1. Derive YES asks from no_bids: ask_price = 1 − no_bid_price
 *   2. Use the lowest derived ask as threshold (minYESAsk)
 *   3. yes_bids < threshold → genuine YES bids
 *      yes_bids ≥ threshold → limit sell orders → also YES asks
 *
 *  NO algorithm (symmetric):
 *   1. Same minYESAsk derivation (used to filter stale yes_bids)
 *   2. no_bids → NO bids directly (prices already in NO scale)
 *   3. genuine yes_bids (price < minYESAsk) → NO asks via (1 − price)
 *   4. Stale yes_bids (price ≥ minYESAsk) produce nonsensically cheap NO asks → skip
 */
export function normalizeDFlowMessage(
  msg: DFlowOrderbookMessage,
  outcome: "YES" | "NO" = "YES"
): {
  bids: OrderLevel[];
  asks: OrderLevel[];
} {
  // Shared step: derive YES asks from no_bids to establish minYESAsk threshold
  const asksFromNoBids: OrderLevel[] = Object.entries(msg.no_bids ?? {}).map(
    ([price, qty]) => ({
      price: Math.round((1 - parseFloat(price)) * 10000) / 10000,
      size: qty,
      venue: "kalshi" as const,
    })
  );
  asksFromNoBids.sort((a, b) => a.price - b.price);
  const minYESAsk = asksFromNoBids[0]?.price ?? 1;

  if (outcome === "YES") {
    const bids: OrderLevel[] = [];
    const asksFromYesBids: OrderLevel[] = [];

    for (const [price, qty] of Object.entries(msg.yes_bids ?? {})) {
      const priceFloat = parseFloat(price);
      const level: OrderLevel = { price: priceFloat, size: qty, venue: "kalshi" };
      if (priceFloat < minYESAsk) {
        bids.push(level);
      } else {
        asksFromYesBids.push(level);
      }
    }

    const asks = [...asksFromNoBids, ...asksFromYesBids];
    bids.sort((a, b) => b.price - a.price);
    asks.sort((a, b) => a.price - b.price);
    return { bids, asks };
  } else {
    // NO outcome
    // NO bids = no_bids directly (people bidding to buy NO at prices in NO scale)
    const bids: OrderLevel[] = Object.entries(msg.no_bids ?? {}).map(
      ([price, qty]) => ({
        price: parseFloat(price),
        size: qty,
        venue: "kalshi" as const,
      })
    );

    // NO asks = genuine YES bids (price < minYESAsk) converted via (1 − price)
    // Stale yes_bids (price ≥ minYESAsk) would become nonsensically cheap NO asks — skip
    const asks: OrderLevel[] = Object.entries(msg.yes_bids ?? {})
      .filter(([price]) => parseFloat(price) < minYESAsk)
      .map(([price, qty]) => ({
        price: Math.round((1 - parseFloat(price)) * 10000) / 10000,
        size: qty,
        venue: "kalshi" as const,
      }));

    bids.sort((a, b) => b.price - a.price);
    asks.sort((a, b) => a.price - b.price);
    return { bids, asks };
  }
}

/** Normalize a Polymarket full-book snapshot event. */
export function normalizePolymarketSnapshot(event: PolymarketBookEvent): {
  bids: OrderLevel[];
  asks: OrderLevel[];
} {
  const bids: OrderLevel[] = (event.bids ?? []).map((l) => ({
    price: parseFloat(l.price),
    size: parseFloat(l.size),
    venue: "polymarket" as const,
  }));

  const asks: OrderLevel[] = (event.asks ?? []).map((l) => ({
    price: parseFloat(l.price),
    size: parseFloat(l.size),
    venue: "polymarket" as const,
  }));

  bids.sort((a, b) => b.price - a.price);
  asks.sort((a, b) => a.price - b.price);

  return { bids, asks };
}

/** Apply Polymarket price_change deltas to the current local book state.
 *  Uses price string as map key to avoid float precision drift.
 *  BUY side = bids, SELL side = asks.
 *  size "0" = remove the level.
 */
export function applyPolymarketDelta(
  current: { bids: OrderLevel[]; asks: OrderLevel[] },
  changes: PolymarketPriceChange[]
): { bids: OrderLevel[]; asks: OrderLevel[] } {
  // Build mutable maps keyed by price string
  const bidsMap = new Map<string, OrderLevel>(
    current.bids.map((l) => [l.price.toString(), l])
  );
  const asksMap = new Map<string, OrderLevel>(
    current.asks.map((l) => [l.price.toString(), l])
  );

  for (const change of changes) {
    const priceFloat = parseFloat(change.price);
    const priceKey = priceFloat.toString();
    const sizeFloat = parseFloat(change.size);
    const map = change.side === "BUY" ? bidsMap : asksMap;

    if (sizeFloat === 0) {
      map.delete(priceKey);
    } else {
      map.set(priceKey, {
        price: priceFloat,
        size: sizeFloat,
        venue: "polymarket",
      });
    }
  }

  const bids = Array.from(bidsMap.values()).sort((a, b) => b.price - a.price);
  const asks = Array.from(asksMap.values()).sort((a, b) => a.price - b.price);

  return { bids, asks };
}
