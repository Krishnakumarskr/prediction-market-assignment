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

// Raw DFlow message
export interface DFlowOrderbookMessage {
  channel: string;
  type: string;
  market_ticker: string;
  yes_bids: Record<string, number>;
  no_bids: Record<string, number>;
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
