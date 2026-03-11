import type {
  KalshiDeltaMsg,
  OrderLevel,
  Outcome,
  PolymarketBookEvent,
  PolymarketPriceChange,
} from "@/src/types/orderbook";

/**
 * Convert Kalshi raw quantity maps to bids/asks for the given outcome.
 *
 * Despite the "_dollars_fp" name, the second value in each Kalshi snapshot entry
 * is the SHARE/CONTRACT quantity (not a dollar amount). It matches the integer
 * quantities in the companion "yes"/"no" arrays. The "_dollars" label refers to
 * the price being formatted as dollars ("0.0100") rather than cents (1).
 *
 * For YES outcome:
 *   bids = rawYes entries at face value (YES buyers)
 *   asks = rawNo entries with price = 1 − no_price (NO buyers ≡ YES sellers)
 *
 * For NO outcome:
 *   bids = rawNo entries at face value
 *   asks = rawYes entries with price = 1 − yes_price
 */
export function normalizeKalshiRawMaps(
  rawYes: Map<string, number>,
  rawNo: Map<string, number>,
  outcome: Outcome
): { bids: OrderLevel[]; asks: OrderLevel[] } {
  if (outcome === "YES") {
    const bids: OrderLevel[] = [];
    for (const [priceKey, qty] of rawYes) {
      const price = parseFloat(priceKey);
      if (price <= 0 || qty <= 0) continue;
      bids.push({ price, size: qty, venue: "kalshi" });
    }

    const asks: OrderLevel[] = [];
    for (const [priceKey, qty] of rawNo) {
      const noPrice = parseFloat(priceKey);
      if (noPrice <= 0 || qty <= 0) continue;
      const yesAskPrice = Math.round((1 - noPrice) * 10000) / 10000;
      asks.push({ price: yesAskPrice, size: qty, venue: "kalshi" });
    }

    bids.sort((a, b) => b.price - a.price);
    asks.sort((a, b) => a.price - b.price);
    return { bids, asks };
  } else {
    const bids: OrderLevel[] = [];
    for (const [priceKey, qty] of rawNo) {
      const price = parseFloat(priceKey);
      if (price <= 0 || qty <= 0) continue;
      bids.push({ price, size: qty, venue: "kalshi" });
    }

    const asks: OrderLevel[] = [];
    for (const [priceKey, qty] of rawYes) {
      const yesPrice = parseFloat(priceKey);
      if (yesPrice <= 0 || qty <= 0) continue;
      const noAskPrice = Math.round((1 - yesPrice) * 10000) / 10000;
      asks.push({ price: noAskPrice, size: qty, venue: "kalshi" });
    }

    bids.sort((a, b) => b.price - a.price);
    asks.sort((a, b) => a.price - b.price);
    return { bids, asks };
  }
}

/**
 * Apply a Kalshi orderbook_delta to the raw maps in-place.
 * delta_fp is the signed change in dollar qty at the given price level.
 */
export function applyKalshiDelta(
  rawYes: Map<string, number>,
  rawNo: Map<string, number>,
  msg: KalshiDeltaMsg
): void {
  const map = msg.side === "yes" ? rawYes : rawNo;
  const current = map.get(msg.price_dollars) ?? 0;
  const newValue = current + parseFloat(msg.delta_fp);
  if (newValue <= 0) {
    map.delete(msg.price_dollars);
  } else {
    map.set(msg.price_dollars, newValue);
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
