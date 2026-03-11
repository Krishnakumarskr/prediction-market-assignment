"use client";

import { MARKET_CONFIG } from "@/src/config/market";
import type { Outcome } from "@/src/types/orderbook";

interface MarketHeaderProps {
  outcome: Outcome;
  yesPrice: number | null;
  noPrice: number | null;
}

function ProbabilityCard({
  label,
  price,
  isActive,
}: {
  label: Outcome;
  price: number | null;
  isActive: boolean;
}) {
  const isYes = label === "YES";
  const color = isYes ? "#166534" : "#991B1B";
  const bg = isYes ? "#DCFCE7" : "#FEE2E2";
  const border = isYes ? "#BBF7D0" : "#FECACA";
  const mutedColor = isYes ? "#4ADE80" : "#FCA5A5";

  return (
    <div
      className="flex flex-col items-center px-5 py-3 rounded-xl transition-all duration-300"
      style={{
        backgroundColor: isActive ? bg : "#F6F3EE",
        border: `1px solid ${isActive ? border : "#E8E4DC"}`,
        minWidth: 80,
      }}
    >
      <span
        className="text-[10px] tracking-widest uppercase font-semibold mb-0.5"
        style={{
          fontFamily: "'DM Mono', monospace",
          color: isActive ? color : "#A8A59F",
        }}
      >
        {label}
      </span>
      <span
        className="text-2xl font-semibold leading-none"
        style={{
          fontFamily: "'DM Mono', monospace",
          fontVariantNumeric: "tabular-nums",
          color: isActive ? color : "#7C796F",
        }}
      >
        {price != null ? `${(price * 100).toFixed(0)}%` : "—"}
      </span>
    </div>
  );
}

export function MarketHeader({ outcome, yesPrice, noPrice }: MarketHeaderProps) {
  return (
    <div className="px-6 pt-5 pb-5 border-b shrink-0" style={{ borderColor: "#DDD9D0", backgroundColor: "#FFFFFF" }}>
      <div className="flex items-center justify-between gap-6">
        {/* Left: title + subtitle */}
        <div className="min-w-0">
          <h1
            className="text-xl font-semibold leading-tight"
            style={{ fontFamily: "'Playfair Display', Georgia, serif", color: "#1A1814" }}
          >
            {MARKET_CONFIG.question}
          </h1>
          <p className="text-sm mt-1" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", color: "#7C796F" }}>
            Aggregated liquidity from{" "}
            <span style={{ color: "#1565C0", fontWeight: 500 }}>Kalshi</span>
            {" "}+{" "}
            <span style={{ color: "#D4500C", fontWeight: 500 }}>Polymarket</span>
          </p>
        </div>

        {/* Right: YES / NO probability cards */}
        <div className="flex items-center gap-2 shrink-0">
          <ProbabilityCard label="YES" price={yesPrice} isActive={outcome === "YES"} />
          <ProbabilityCard label="NO"  price={noPrice}  isActive={outcome === "NO"} />
        </div>
      </div>
    </div>
  );
}
