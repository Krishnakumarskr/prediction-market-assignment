import type { FillLevel, FillResult, OrderLevel, SingleVenueFill, Venue } from "@/src/types/orderbook";

function sweepAsks(
  asks: OrderLevel[],
  budget: number
): {
  fills: FillLevel[];
  totalShares: number;
  totalCost: number;
} {
  const sorted = [...asks].sort((a, b) => a.price - b.price);
  const fills: FillLevel[] = [];
  let remaining = budget;

  for (const level of sorted) {
    if (remaining <= 0) break;

    const maxCostAtLevel = level.price * level.size;
    let shares: number;
    let cost: number;

    if (remaining >= maxCostAtLevel) {
      shares = level.size;
      cost = maxCostAtLevel;
    } else {
      shares = remaining / level.price;
      cost = remaining;
    }

    fills.push({ price: level.price, size: shares, cost, venue: level.venue });
    remaining -= cost;
  }

  const totalCost = budget - remaining;
  const totalShares = fills.reduce((sum, f) => sum + f.size, 0);

  return { fills, totalShares, totalCost };
}

/**
 * Calculate optimal fill via smart order routing across combined asks.
 * Also calculates what the fill would cost on each venue individually
 * (used for savings comparison).
 */
export function calculateFill(
  combinedAsks: OrderLevel[],
  kalshiAsks: OrderLevel[],
  polymarketAsks: OrderLevel[],
  budget: number
): FillResult {
  if (budget <= 0 || combinedAsks.length === 0) {
    return emptyFillResult();
  }

  const { fills, totalShares, totalCost } = sweepAsks(combinedAsks, budget);

  const byVenue: Record<Venue, { shares: number; cost: number }> = {
    kalshi: { shares: 0, cost: 0 },
    polymarket: { shares: 0, cost: 0 },
  };
  for (const fill of fills) {
    byVenue[fill.venue].shares += fill.size;
    byVenue[fill.venue].cost += fill.cost;
  }

  const avgPrice = totalShares > 0 ? totalCost / totalShares : 0;

  // Calculate single-venue fills for comparison
  const kalshiRaw = sweepAsks(kalshiAsks, budget);
  const polymarketRaw = sweepAsks(polymarketAsks, budget);

  const toSingleVenueFill = (raw: { totalShares: number; totalCost: number }): SingleVenueFill | null => {
    if (raw.totalShares <= 0) return null;
    return {
      shares: raw.totalShares,
      cost: raw.totalCost,
      avgPrice: raw.totalCost / raw.totalShares,
    };
  };

  const kalshiOnly = toSingleVenueFill(kalshiRaw);
  const polymarketOnly = toSingleVenueFill(polymarketRaw);

  const savingsVsKalshi =
    kalshiOnly != null
      ? (kalshiOnly.avgPrice - avgPrice) / kalshiOnly.avgPrice
      : null;

  const savingsVsPolymarket =
    polymarketOnly != null
      ? (polymarketOnly.avgPrice - avgPrice) / polymarketOnly.avgPrice
      : null;

  return {
    fills,
    totalShares,
    totalCost,
    avgPrice,
    byVenue,
    savingsVsKalshi,
    savingsVsPolymarket,
    kalshiOnly,
    polymarketOnly,
  };
}

function emptyFillResult(): FillResult {
  return {
    fills: [],
    totalShares: 0,
    totalCost: 0,
    avgPrice: 0,
    byVenue: {
      kalshi: { shares: 0, cost: 0 },
      polymarket: { shares: 0, cost: 0 },
    },
    savingsVsKalshi: null,
    savingsVsPolymarket: null,
    kalshiOnly: null,
    polymarketOnly: null,
  };
}
