export const MARKET_CONFIG = {
  kalshi: {
    ticker: "KXRECOGPERSONIRAN-26",
    label: "Kalshi",
  },
  polymarket: {
    slug: "us-recognizes-reza-pahlavi-as-leader-of-iran-in2026",
    label: "Polymarket",
  },
  question: "Will the US recognize Reza Pahlavi as leader of Iran in 2026?",
  outcome: "YES",
} as const;

export const STALE_THRESHOLD_MS = 30_000;
export const MAX_RECONNECT_DELAY_MS = 30_000;
export const KALSHI_WS_URL = "wss://api.elections.kalshi.com/trade-api/ws/v2";
export const POLYMARKET_WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market";
export const POLYMARKET_GAMMA_API = "https://gamma-api.polymarket.com";
