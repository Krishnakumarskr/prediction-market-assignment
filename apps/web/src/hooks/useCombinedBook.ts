"use client";

import { useMemo } from "react";
import { mergeOrderBooks } from "@/src/lib/orderbook";
import type { CombinedOrderBook, VenueFilter, VenueOrderBook } from "@/src/types/orderbook";

export function useCombinedBook(
  kalshi: VenueOrderBook,
  polymarket: VenueOrderBook,
  filter: VenueFilter
): CombinedOrderBook {
  return useMemo(
    () => mergeOrderBooks(kalshi, polymarket, filter),
    [kalshi, polymarket, filter]
  );
}
