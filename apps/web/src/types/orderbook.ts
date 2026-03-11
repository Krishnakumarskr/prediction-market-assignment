export type Venue = "kalshi" | "polymarket";
export type VenueStatus = "connecting" | "live" | "stale" | "disconnected";
export type VenueFilter = "combined" | "kalshi" | "polymarket";
export type Outcome = "YES" | "NO";

export interface OrderLevel {
  price: number;
  size: number;
  venue: Venue;
}

export interface VenueOrderBook {
  bids: OrderLevel[]; // sorted descending by price
  asks: OrderLevel[]; // sorted ascending by price
  lastUpdated: number; // ms timestamp
  status: VenueStatus;
}

export interface CombinedOrderBook {
  bids: OrderLevel[];
  asks: OrderLevel[];
  kalshi: VenueOrderBook;
  polymarket: VenueOrderBook;
}

export interface AggregatedLevel {
  price: number;
  totalSize: number;
  kalshiSize: number;
  polySize: number;
}

export interface FillLevel {
  price: number;
  size: number;
  cost: number;
  venue: Venue;
}

export interface SingleVenueFill {
  shares: number;
  cost: number;
  avgPrice: number;
}

export interface FillResult {
  fills: FillLevel[];
  totalShares: number;
  totalCost: number;
  avgPrice: number;
  byVenue: Record<Venue, { shares: number; cost: number }>;
  savingsVsKalshi: number | null;
  savingsVsPolymarket: number | null;
  /** Single-venue fills for comparison — null if that venue has no liquidity */
  kalshiOnly: SingleVenueFill | null;
  polymarketOnly: SingleVenueFill | null;
}

// Raw Kalshi snapshot message
export interface KalshiSnapshotMsg {
  market_ticker: string;
  market_id: string;
  /** [price_string, dollar_qty_string][] — e.g. [["0.0800", "300.00"]] */
  yes_dollars_fp: [string, string][];
  no_dollars_fp: [string, string][];
}

export interface KalshiSnapshotMessage {
  type: "orderbook_snapshot";
  sid: number;
  seq: number;
  msg: KalshiSnapshotMsg;
}

// Raw Kalshi delta message
export interface KalshiDeltaMsg {
  market_ticker: string;
  price_dollars: string;
  /** Signed change in dollar qty at this level */
  delta_fp: string;
  side: "yes" | "no";
  ts: string;
}

export interface KalshiDeltaMessage {
  type: "orderbook_delta";
  sid: number;
  seq: number;
  msg: KalshiDeltaMsg;
}

// Raw Polymarket book snapshot
export interface PolymarketBookEvent {
  event_type: "book";
  asset_id: string;
  market: string;
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
  timestamp: string;
}

// Raw Polymarket price change delta
export interface PolymarketPriceChange {
  asset_id: string;
  price: string;
  size: string;
  side: "BUY" | "SELL";
  hash?: string;
}

export interface PolymarketPriceChangeEvent {
  event_type: "price_change";
  market: string;
  price_changes: PolymarketPriceChange[];
  timestamp: string;
}
