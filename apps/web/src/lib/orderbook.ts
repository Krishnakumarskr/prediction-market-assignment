import type {
  CombinedOrderBook,
  OrderLevel,
  VenueFilter,
  VenueOrderBook,
  VenueStatus,
} from "@/src/types/orderbook";

export const EMPTY_VENUE_BOOK: VenueOrderBook = {
  bids: [],
  asks: [],
  lastUpdated: 0,
  status: "connecting",
};

export function buildVenueOrderBook(
  levels: { bids: OrderLevel[]; asks: OrderLevel[] },
  status: VenueStatus,
  lastUpdated: number
): VenueOrderBook {
  return {
    bids: levels.bids,
    asks: levels.asks,
    lastUpdated,
    status,
  };
}

/** Merge two venue order books into a combined view based on the active filter. */
export function mergeOrderBooks(
  kalshi: VenueOrderBook,
  polymarket: VenueOrderBook,
  filter: VenueFilter
): CombinedOrderBook {
  let bids: OrderLevel[];
  let asks: OrderLevel[];

  if (filter === "kalshi") {
    bids = kalshi.bids;
    asks = kalshi.asks;
  } else if (filter === "polymarket") {
    bids = polymarket.bids;
    asks = polymarket.asks;
  } else {
    // Combined: merge and re-sort
    bids = [...kalshi.bids, ...polymarket.bids].sort(
      (a, b) => b.price - a.price
    );
    asks = [...kalshi.asks, ...polymarket.asks].sort(
      (a, b) => a.price - b.price
    );
  }

  return { bids, asks, kalshi, polymarket };
}

/** Get the mid price (average of best bid and best ask). */
export function getMidPrice(book: { bids: OrderLevel[]; asks: OrderLevel[] }): number | null {
  const bestBid = book.bids[0]?.price;
  const bestAsk = book.asks[0]?.price;
  if (bestBid == null || bestAsk == null) return null;
  return (bestBid + bestAsk) / 2;
}

/** Get the spread between best ask and best bid. */
export function getSpread(book: { bids: OrderLevel[]; asks: OrderLevel[] }): number | null {
  const bestBid = book.bids[0]?.price;
  const bestAsk = book.asks[0]?.price;
  if (bestBid == null || bestAsk == null) return null;
  return bestAsk - bestBid;
}
