"use client";

import { MARKET_CONFIG } from "@/src/config/market";
import type { Outcome } from "@/src/types/orderbook";

interface MarketHeaderProps {
  outcome: Outcome;
}

export function MarketHeader({ outcome }: MarketHeaderProps) {
  const isYes = outcome === "YES";

  return (
    <div className="px-6 pt-6 pb-5 border-b" style={{ borderColor: "#DDD9D0", backgroundColor: "#FFFFFF" }}>
      <div className="flex items-start gap-3 flex-wrap">
        {/* Outcome badge */}
        <span
          className="shrink-0 mt-1 px-2.5 py-0.5 rounded text-xs font-semibold tracking-widest uppercase"
          style={{
            fontFamily: "'DM Mono', monospace",
            backgroundColor: isYes ? "#DCFCE7" : "#FEE2E2",
            color: isYes ? "#166534" : "#991B1B",
            border: `1px solid ${isYes ? "#BBF7D0" : "#FECACA"}`,
          }}
        >
          {outcome}
        </span>
        <div>
          <h1
            className="text-xl font-semibold leading-tight"
            style={{ fontFamily: "'Playfair Display', Georgia, serif", color: "#1A1814" }}
          >
            {MARKET_CONFIG.question}
          </h1>
          <p className="text-sm mt-1" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", color: "#7C796F" }}>
            Aggregated liquidity from{" "}
            <span style={{ color: "#1565C0", fontWeight: 500 }}>Kalshi</span>{" "}
            +{" "}
            <span style={{ color: "#D4500C", fontWeight: 500 }}>Polymarket</span>
          </p>
        </div>
      </div>
    </div>
  );
}
