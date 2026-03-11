"use client";

import { useState } from "react";
import { MarketHeader } from "@/components/MarketHeader";
import { VenueStatus } from "@/components/VenueStatus";
import { OrderBookTable } from "@/components/OrderBookTable";
import { QuotePanel } from "@/components/QuotePanel";
import { useKalshiBook } from "@/src/hooks/useKalshiBook";
import { usePolymarketBook } from "@/src/hooks/usePolymarketBook";
import { useCombinedBook } from "@/src/hooks/useCombinedBook";
import type { Outcome, VenueFilter } from "@/src/types/orderbook";

export function MarketDashboard() {
  const [filter, setFilter] = useState<VenueFilter>("combined");
  const [outcome, setOutcome] = useState<Outcome>("YES");

  const kalshiBook = useKalshiBook(outcome);
  const polymarketBook = usePolymarketBook(outcome);
  const combinedBook = useCombinedBook(kalshiBook, polymarketBook, filter);

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: "#F6F3EE" }}>
      <MarketHeader outcome={outcome} />

      {/* Venue status bar */}
      <div
        className="flex items-center gap-5 px-6 py-2.5 border-b shrink-0"
        style={{ backgroundColor: "#FAFAF6", borderColor: "#DDD9D0" }}
      >
        <VenueStatus venue="kalshi" book={kalshiBook} />
        <div className="w-px h-3" style={{ backgroundColor: "#DDD9D0" }} />
        <VenueStatus venue="polymarket" book={polymarketBook} />
      </div>

      {/* Main content — fills remaining viewport height, one grid row */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-5 lg:grid-rows-1 gap-5 p-5">
        {/* Order book: must respect grid row height */}
        <div className="lg:col-span-3 min-h-0 flex flex-col">
          <OrderBookTable
            book={combinedBook}
            filter={filter}
            onFilterChange={setFilter}
            outcome={outcome}
          />
        </div>
        {/* Quote panel: independently scrollable */}
        <div className="lg:col-span-2 overflow-y-auto ob-scroll">
          <QuotePanel
            combinedBook={combinedBook}
            kalshiBook={kalshiBook}
            polymarketBook={polymarketBook}
            outcome={outcome}
            onOutcomeChange={setOutcome}
          />
        </div>
      </div>
    </div>
  );
}
