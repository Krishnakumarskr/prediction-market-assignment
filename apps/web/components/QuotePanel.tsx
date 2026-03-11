"use client";

import { useMemo, useState } from "react";
import { calculateFill } from "@/src/lib/quoteEngine";
import type { CombinedOrderBook, FillResult, Outcome, SingleVenueFill, VenueOrderBook } from "@/src/types/orderbook";

interface QuotePanelProps {
  combinedBook: CombinedOrderBook;
  kalshiBook: VenueOrderBook;
  polymarketBook: VenueOrderBook;
  outcome: Outcome;
  onOutcomeChange: (o: Outcome) => void;
}

const KALSHI_COLOR = "#1565C0";
const PM_COLOR = "#D4500C";

function formatUsd(n: number): string {
  return "$" + n.toFixed(2);
}

function formatShares(n: number): string {
  return n.toFixed(2);
}

function formatPrice(p: number): string {
  return (p * 100).toFixed(2) + "¢";
}

function formatPct(n: number): string {
  return (n * 100).toFixed(2) + "%";
}

function VenueComparisonRow({
  label,
  color,
  bgColor,
  borderColor,
  fill,
  isBest,
}: {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  fill: SingleVenueFill | null;
  isBest: boolean;
}) {
  return (
    <div
      className="flex items-center px-3 py-2.5 rounded-lg"
      style={{
        backgroundColor: isBest ? bgColor : "#F6F3EE",
        border: `1px solid ${isBest ? borderColor : "#E8E4DC"}`,
      }}
    >
      <div className="flex items-center gap-1.5 w-28 shrink-0">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span
          className="text-[10px] tracking-widest font-semibold"
          style={{ fontFamily: "'DM Mono', monospace", color }}
        >
          {label}
        </span>
      </div>

      {fill ? (
        <div className="flex items-baseline gap-2 ml-auto">
          <span
            className="text-sm font-semibold"
            style={{ fontFamily: "'DM Mono', monospace", color: "#1A1814" }}
          >
            {formatShares(fill.shares)} sh
          </span>
          <span
            className="text-xs"
            style={{ fontFamily: "'DM Mono', monospace", color: "#7C796F" }}
          >
            @ {formatPrice(fill.avgPrice)}
          </span>
        </div>
      ) : (
        <span
          className="text-xs ml-auto"
          style={{ fontFamily: "'DM Mono', monospace", color: "#A8A59F" }}
        >
          no liquidity
        </span>
      )}

      {isBest && (
        <span
          className="ml-2 text-[9px] tracking-widest px-1.5 py-0.5 rounded font-bold"
          style={{ backgroundColor: "#D1FAE5", color: "#065F46" }}
        >
          BEST
        </span>
      )}
    </div>
  );
}

function FillBreakdown({ result, outcome }: { result: FillResult; outcome: Outcome }) {
  const kalshi = result.byVenue.kalshi;
  const pm = result.byVenue.polymarket;
  const totalShares = result.totalShares;

  const kalshiPct = totalShares > 0 ? (kalshi.shares / totalShares) * 100 : 0;
  const pmPct = totalShares > 0 ? (pm.shares / totalShares) * 100 : 0;

  // Determine which single venue gives more shares
  const kalshiShares = result.kalshiOnly?.shares ?? 0;
  const pmShares = result.polymarketOnly?.shares ?? 0;
  const bestSingleVenueShares = Math.max(kalshiShares, pmShares);
  const bestSingleVenueLabel = kalshiShares >= pmShares ? "Kalshi" : "Polymarket";
  const extraShares = totalShares - bestSingleVenueShares;

  // Which row is "best" among single venues
  const kalshiBest = kalshiShares > 0 && kalshiShares >= pmShares;
  const pmBest = pmShares > 0 && pmShares > kalshiShares;

  return (
    <div className="space-y-4">
      {/* Smart routing summary */}
      <div
        className="rounded-lg p-3.5"
        style={{ backgroundColor: "#F6F3EE", border: "1px solid #E8E4DC" }}
      >
        <div className="flex justify-between items-baseline">
          <span
            className="text-2xl font-semibold"
            style={{ fontFamily: "'DM Mono', monospace", color: "#1A1814" }}
          >
            {formatShares(result.totalShares)}
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded font-semibold"
            style={{
              fontFamily: "'DM Mono', monospace",
              backgroundColor: outcome === "YES" ? "#DCFCE7" : "#FEE2E2",
              color: outcome === "YES" ? "#166534" : "#991B1B",
            }}
          >
            {outcome} shares
          </span>
        </div>
        <div className="flex justify-between items-baseline mt-1.5">
          <span
            className="text-sm"
            style={{ fontFamily: "'DM Mono', monospace", color: "#7C796F" }}
          >
            avg {formatPrice(result.avgPrice)}
          </span>
          <span
            className="text-sm"
            style={{ fontFamily: "'DM Mono', monospace", color: "#7C796F" }}
          >
            {formatUsd(result.totalCost)} spent
          </span>
        </div>
      </div>

      {/* Single-venue comparison */}
      <div>
        <p
          className="text-[10px] tracking-widest uppercase mb-2"
          style={{ fontFamily: "'DM Mono', monospace", color: "#A8A59F" }}
        >
          Compare venues
        </p>
        <div className="space-y-1.5">
          <VenueComparisonRow
            label="KALSHI"
            color={KALSHI_COLOR}
            bgColor="#EFF6FF"
            borderColor="#BFDBFE"
            fill={result.kalshiOnly}
            isBest={kalshiBest}
          />
          <VenueComparisonRow
            label="POLYMARKET"
            color={PM_COLOR}
            bgColor="#FFF7ED"
            borderColor="#FED7AA"
            fill={result.polymarketOnly}
            isBest={pmBest}
          />
        </div>
      </div>

      {/* Smart routing improvement callout */}
      {extraShares > 0.01 && bestSingleVenueShares > 0 && (
        <div
          className="rounded-lg px-3.5 py-3"
          style={{
            backgroundColor: "#F0FDF4",
            border: "1px solid #BBF7D0",
          }}
        >
          <div className="flex items-start gap-2">
            <div>
              <p
                className="text-xs font-semibold leading-snug"
                style={{ color: "#166534", fontFamily: "'DM Mono', monospace" }}
              >
                Smart routing gets you{" "}
                <span style={{ fontSize: "0.875rem" }}>+{formatShares(extraShares)} shares</span>
                {" "}more
              </p>
              <p
                className="text-[11px] mt-0.5"
                style={{ color: "#15803D", fontFamily: "'DM Mono', monospace" }}
              >
                vs buying on {bestSingleVenueLabel} alone
                {result.savingsVsKalshi != null && result.savingsVsKalshi > 0.001 &&
                  result.savingsVsPolymarket != null && result.savingsVsPolymarket > 0.001 ? (
                    <span> · saves {formatPct(Math.max(result.savingsVsKalshi, result.savingsVsPolymarket))} on avg price</span>
                  ) : result.savingsVsKalshi != null && result.savingsVsKalshi > 0.001 ? (
                    <span> · saves {formatPct(result.savingsVsKalshi)} on avg price</span>
                  ) : result.savingsVsPolymarket != null && result.savingsVsPolymarket > 0.001 ? (
                    <span> · saves {formatPct(result.savingsVsPolymarket)} on avg price</span>
                  ) : null}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Venue split bar */}
      {(kalshi.shares > 0 || pm.shares > 0) && (
        <div>
          <p
            className="text-[10px] tracking-widest uppercase mb-2"
            style={{ fontFamily: "'DM Mono', monospace", color: "#A8A59F" }}
          >
            Fill split
          </p>
          <div className="flex rounded-full overflow-hidden h-1.5 mb-2.5">
            {kalshiPct > 0 && (
              <div
                style={{
                  width: `${kalshiPct}%`,
                  backgroundColor: KALSHI_COLOR,
                  transition: "width 0.3s ease",
                }}
              />
            )}
            {pmPct > 0 && (
              <div
                style={{
                  width: `${pmPct}%`,
                  backgroundColor: PM_COLOR,
                  transition: "width 0.3s ease",
                }}
              />
            )}
          </div>
          <div className="flex gap-2">
            {kalshi.shares > 0 && (
              <div
                className="flex-1 rounded-lg p-2.5"
                style={{
                  backgroundColor: "#EFF6FF",
                  border: `1px solid #BFDBFE`,
                }}
              >
                <div
                  className="text-[10px] tracking-widest mb-1 font-semibold"
                  style={{ fontFamily: "'DM Mono', monospace", color: KALSHI_COLOR }}
                >
                  KALSHI · {kalshiPct.toFixed(0)}%
                </div>
                <div
                  className="text-sm font-medium"
                  style={{ fontFamily: "'DM Mono', monospace", color: "#1A1814" }}
                >
                  {formatShares(kalshi.shares)} sh
                </div>
                <div
                  className="text-xs"
                  style={{ fontFamily: "'DM Mono', monospace", color: "#7C796F" }}
                >
                  {formatUsd(kalshi.cost)}
                </div>
              </div>
            )}
            {pm.shares > 0 && (
              <div
                className="flex-1 rounded-lg p-2.5"
                style={{
                  backgroundColor: "#FFF7ED",
                  border: `1px solid #FED7AA`,
                }}
              >
                <div
                  className="text-[10px] tracking-widest mb-1 font-semibold"
                  style={{ fontFamily: "'DM Mono', monospace", color: PM_COLOR }}
                >
                  POLYMARKET · {pmPct.toFixed(0)}%
                </div>
                <div
                  className="text-sm font-medium"
                  style={{ fontFamily: "'DM Mono', monospace", color: "#1A1814" }}
                >
                  {formatShares(pm.shares)} sh
                </div>
                <div
                  className="text-xs"
                  style={{ fontFamily: "'DM Mono', monospace", color: "#7C796F" }}
                >
                  {formatUsd(pm.cost)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function QuotePanel({
  combinedBook,
  kalshiBook,
  polymarketBook,
  outcome,
  onOutcomeChange,
}: QuotePanelProps) {
  const [budgetStr, setBudgetStr] = useState<string>("");

  const budget = useMemo(() => {
    const n = parseFloat(budgetStr);
    return isNaN(n) || n <= 0 ? 0 : n;
  }, [budgetStr]);

  const fillResult = useMemo(() => {
    if (budget === 0) return null;
    return calculateFill(
      combinedBook.asks,
      kalshiBook.asks,
      polymarketBook.asks,
      budget
    );
  }, [budget, combinedBook.asks, kalshiBook.asks, polymarketBook.asks]);

  const hasLiquidity = combinedBook.asks.length > 0;
  const isYes = outcome === "YES";
  const outcomeColor = isYes ? "#166534" : "#991B1B";

  // Best ask price for the current outcome
  const bestAsk = combinedBook.asks[0]?.price ?? null;

  return (
    <div
      className="rounded-xl p-5 space-y-5"
      style={{
        backgroundColor: "#FFFFFF",
        border: "1px solid #DDD9D0",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      {/* Header */}
      <div>
        <p
          className="text-[10px] tracking-widest uppercase mb-3"
          style={{ fontFamily: "'DM Mono', monospace", color: "#7C796F" }}
        >
          Quote Engine
        </p>

        {/* YES / NO outcome toggle */}
        <div
          className="flex p-1 mb-4 rounded-lg"
          style={{ backgroundColor: "#F0EDE6", border: "1px solid #DDD9D0" }}
        >
          {(["YES", "NO"] as Outcome[]).map((o) => {
            const active = outcome === o;
            const color = o === "YES" ? "#166534" : "#991B1B";
            const bg = o === "YES" ? "#DCFCE7" : "#FEE2E2";
            const activeBorder = o === "YES" ? "#BBF7D0" : "#FECACA";
            return (
              <button
                key={o}
                onClick={() => onOutcomeChange(o)}
                className="flex-1 py-2 px-3 rounded-md transition-all duration-150 flex items-center justify-center gap-2"
                style={{
                  fontFamily: "'DM Mono', monospace",
                  backgroundColor: active ? bg : "transparent",
                  color: active ? color : "#7C796F",
                  border: active ? `1px solid ${activeBorder}` : "1px solid transparent",
                  cursor: "pointer",
                  outline: "none",
                  boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                }}
              >
                <span className="text-sm font-semibold tracking-widest">{o}</span>
                {active && bestAsk != null && (
                  <span
                    className="text-xs font-normal"
                    style={{ color, opacity: 0.75 }}
                  >
                    {formatPrice(bestAsk)}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Budget input */}
        <div className="space-y-1.5">
          <label
            className="text-xs"
            style={{ fontFamily: "'DM Sans', system-ui, sans-serif", color: "#7C796F" }}
          >
            Budget (USD)
          </label>
          <div className="relative">
            <span
              className="absolute left-3 top-1/2 -translate-y-1/2 text-sm"
              style={{ fontFamily: "'DM Mono', monospace", color: "#7C796F" }}
            >
              $
            </span>
            <input
              type="number"
              min="0"
              step="any"
              placeholder="100"
              value={budgetStr}
              onChange={(e) => setBudgetStr(e.target.value)}
              className="w-full pl-7 pr-3 py-2 text-sm rounded-lg outline-none transition-colors"
              style={{
                fontFamily: "'DM Mono', monospace",
                backgroundColor: "#F6F3EE",
                border: "1px solid #DDD9D0",
                color: "#1A1814",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = outcomeColor; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "#DDD9D0"; }}
            />
          </div>
          <p
            className="text-[11px]"
            style={{ fontFamily: "'DM Sans', system-ui, sans-serif", color: "#7C796F" }}
          >
            Buying{" "}
            <span
              className="font-semibold px-1 rounded"
              style={{
                color: outcomeColor,
                backgroundColor: isYes ? "#DCFCE7" : "#FEE2E2",
              }}
            >
              {outcome}
            </span>{" "}
            shares via smart order routing
          </p>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, backgroundColor: "#E8E4DC" }} />

      {/* Fill result or empty state */}
      {budget === 0 ? (
        <div className="py-6 text-center">
          <p
            className="text-sm"
            style={{ fontFamily: "'DM Sans', system-ui, sans-serif", color: "#7C796F" }}
          >
            Enter an amount to see fill preview
          </p>
          {!hasLiquidity && (
            <p
              className="text-xs mt-1"
              style={{ fontFamily: "'DM Mono', monospace", color: "#A8A59F" }}
            >
              Waiting for order book data…
            </p>
          )}
        </div>
      ) : fillResult && fillResult.totalShares > 0 ? (
        <FillBreakdown result={fillResult} outcome={outcome} />
      ) : (
        <div className="py-6 text-center">
          <p
            className="text-sm"
            style={{ fontFamily: "'DM Sans', system-ui, sans-serif", color: "#7C796F" }}
          >
            Insufficient liquidity for this amount
          </p>
        </div>
      )}
    </div>
  );
}
