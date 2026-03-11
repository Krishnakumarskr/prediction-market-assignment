"use client";

import { useEffect, useMemo, useRef } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { aggregateLevels, getMidPrice, getSpread } from "@/src/lib/orderbook";
import type { AggregatedLevel, CombinedOrderBook, Outcome, VenueFilter } from "@/src/types/orderbook";

const KALSHI_COLOR = "#1565C0";
const PM_COLOR = "#D4500C";
const KALSHI_BG = "#1565C014";
const PM_BG = "#D4500C14";

interface OrderBookTableProps {
  book: CombinedOrderBook;
  filter: VenueFilter;
  onFilterChange: (f: VenueFilter) => void;
  outcome: Outcome;
}

function formatPrice(p: number): string {
  return (p * 100).toFixed(1) + "¢";
}

function formatSize(s: number): string {
  if (s >= 1_000_000) return (s / 1_000_000).toFixed(2) + "M";
  if (s >= 1_000) return (s / 1_000).toFixed(1) + "K";
  return s.toFixed(0);
}

function VenueIndicator({ kalshiSize, polySize }: { kalshiSize: number; polySize: number }) {
  if (kalshiSize > 0 && polySize > 0) {
    return (
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0 mr-2"
        style={{
          background: `linear-gradient(to right, ${KALSHI_COLOR} 50%, ${PM_COLOR} 50%)`,
        }}
      />
    );
  }
  return (
    <span
      className="w-1.5 h-1.5 rounded-full shrink-0 mr-2"
      style={{ backgroundColor: kalshiSize > 0 ? KALSHI_COLOR : PM_COLOR }}
    />
  );
}

function AggregatedPriceRow({
  level,
  maxSize,
  side,
  prevSizeRef,
}: {
  level: AggregatedLevel;
  maxSize: number;
  side: "bid" | "ask";
  prevSizeRef: React.MutableRefObject<Map<string, number>>;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const key = `${side}-${level.price}`;

  useEffect(() => {
    const prev = prevSizeRef.current.get(key);
    if (prev !== undefined && prev !== level.totalSize && rowRef.current) {
      const cls = level.totalSize > prev ? "animate-flash-green" : "animate-flash-red";
      rowRef.current.classList.remove("animate-flash-green", "animate-flash-red");
      void rowRef.current.offsetWidth;
      rowRef.current.classList.add(cls);
      const tid = setTimeout(() => {
        rowRef.current?.classList.remove(cls);
      }, 500);
      return () => clearTimeout(tid);
    }
  });

  useEffect(() => {
    prevSizeRef.current.set(key, level.totalSize);
  });

  const depthPct = maxSize > 0 ? (level.totalSize / maxSize) * 100 : 0;
  const hasBoth = level.kalshiSize > 0 && level.polySize > 0;

  // Split gradient: kalshi (blue) on the left portion, polymarket (orange) on the right
  const kalshiFrac = level.totalSize > 0 ? (level.kalshiSize / level.totalSize) * 100 : 100;
  const depthBackground = hasBoth
    ? `linear-gradient(to right, ${KALSHI_BG} ${kalshiFrac}%, ${PM_BG} ${kalshiFrac}%)`
    : level.kalshiSize > 0
    ? KALSHI_BG
    : PM_BG;

  return (
    <div
      ref={rowRef}
      className="relative flex items-center px-3 py-[3px] transition-colors shrink-0"
      style={{ height: 28, cursor: "default" }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#F6F3EE"; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
    >
      {/* Split depth bar */}
      <div
        className="absolute top-0 bottom-0 pointer-events-none"
        style={{
          [side === "bid" ? "right" : "left"]: 0,
          width: `${depthPct}%`,
          background: depthBackground,
          transition: "width 0.2s ease",
        }}
      />

      {/* Venue indicator: single dot or split-color circle */}
      <VenueIndicator kalshiSize={level.kalshiSize} polySize={level.polySize} />

      {/* Price */}
      <span
        className="text-sm w-14 shrink-0"
        style={{
          fontFamily: "'DM Mono', monospace",
          fontVariantNumeric: "tabular-nums",
          color: side === "bid" ? "#166534" : "#991B1B",
          fontWeight: 500,
        }}
      >
        {formatPrice(level.price)}
      </span>

      {/* Size with per-venue breakdown tooltip */}
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="text-sm ml-auto cursor-default"
            style={{
              fontFamily: "'DM Mono', monospace",
              fontVariantNumeric: "tabular-nums",
              color: "#7C796F",
            }}
          >
            {formatSize(level.totalSize)}
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="left"
          className="text-xs"
          style={{ fontFamily: "'DM Mono', monospace", minWidth: 160 }}
        >
          <div className="space-y-1">
            {level.kalshiSize > 0 && (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: KALSHI_COLOR }} />
                  <span style={{ color: KALSHI_COLOR }}>Kalshi</span>
                </div>
                <span>{level.kalshiSize.toLocaleString()}</span>
              </div>
            )}
            {level.polySize > 0 && (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PM_COLOR }} />
                  <span style={{ color: PM_COLOR }}>Polymarket</span>
                </div>
                <span>{level.polySize.toLocaleString()}</span>
              </div>
            )}
            {hasBoth && (
              <div
                className="flex items-center justify-between gap-3 pt-1"
                style={{ borderTop: "1px solid #E8E4DC" }}
              >
                <span style={{ color: "#7C796F" }}>Total</span>
                <span>{level.totalSize.toLocaleString()}</span>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

const FILTER_LABELS: Record<VenueFilter, string> = {
  combined: "Combined",
  kalshi: "Kalshi",
  polymarket: "Polymarket",
};

const FILTER_ACTIVE_STYLE: Record<VenueFilter, { bg: string; color: string; border: string }> = {
  combined: { bg: "#E8E4DC", color: "#1A1814", border: "#C8C4BC" },
  kalshi: { bg: "#EFF6FF", color: "#1565C0", border: "#BFDBFE" },
  polymarket: { bg: "#FFF7ED", color: "#D4500C", border: "#FED7AA" },
};

export function OrderBookTable({ book, filter, onFilterChange, outcome }: OrderBookTableProps) {
  const prevSizeRef = useRef<Map<string, number>>(new Map());

  const aggBids = useMemo(() => aggregateLevels(book.bids), [book.bids]);
  const aggAsks = useMemo(() => aggregateLevels(book.asks), [book.asks]);

  const maxBidSize = Math.max(...aggBids.map((b) => b.totalSize), 1);
  const maxAskSize = Math.max(...aggAsks.map((a) => a.totalSize), 1);

  const mid = getMidPrice(book);
  const spread = getSpread(book);
  const isYes = outcome === "YES";

  const isBookCrossed =
    book.bids.length > 0 &&
    book.asks.length > 0 &&
    book.bids[0].price >= book.asks[0].price;

  return (
    // h-full so it fills the grid cell; flex-col so sections stack and scroll independently
    <div
      className="h-full flex flex-col rounded-xl overflow-hidden"
      style={{
        backgroundColor: "#FFFFFF",
        border: "1px solid #DDD9D0",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      {/* ── Fixed header ── */}
      <div
        className="flex items-center justify-between px-3 py-3 border-b shrink-0"
        style={{ borderColor: "#E8E4DC" }}
      >
        <div className="flex items-center gap-2">
          <h2
            className="text-[10px] tracking-widest uppercase"
            style={{ fontFamily: "'DM Mono', monospace", color: "#7C796F" }}
          >
            Order Book
          </h2>
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-widest"
            style={{
              fontFamily: "'DM Mono', monospace",
              backgroundColor: isYes ? "#DCFCE7" : "#FEE2E2",
              color: isYes ? "#166534" : "#991B1B",
            }}
          >
            {outcome}
          </span>
        </div>

        <div
          className="flex p-0.5 rounded-lg gap-0.5"
          style={{ backgroundColor: "#F0EDE6", border: "1px solid #DDD9D0" }}
        >
          {(["combined", "kalshi", "polymarket"] as VenueFilter[]).map((v) => {
            const active = filter === v;
            const s = FILTER_ACTIVE_STYLE[v];
            return (
              <button
                key={v}
                onClick={() => onFilterChange(v)}
                className="h-6 px-2 rounded-md text-[11px] font-medium transition-all duration-100"
                style={{
                  fontFamily: "'DM Mono', monospace",
                  backgroundColor: active ? s.bg : "transparent",
                  color: active ? s.color : "#7C796F",
                  border: active ? `1px solid ${s.border}` : "1px solid transparent",
                  cursor: "pointer",
                  outline: "none",
                }}
              >
                {FILTER_LABELS[v]}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Fixed column headers ── */}
      <div className="flex items-center px-3 py-1.5 border-b shrink-0" style={{ borderColor: "#F0EDE6" }}>
        <span className="w-1.5 mr-2" />
        <span
          className="text-[10px] tracking-widest w-14"
          style={{ fontFamily: "'DM Mono', monospace", color: "#A8A59F" }}
        >
          PRICE
        </span>
        <span
          className="text-[10px] tracking-widest ml-auto"
          style={{ fontFamily: "'DM Mono', monospace", color: "#A8A59F" }}
        >
          SIZE
        </span>
      </div>

      {/*
        ── Asks: flex-1 scrollable ──
        flex-col-reverse: lowest ask (index 0) appears at the bottom, nearest the spread.
        Overflow goes upward — scrolling reveals more expensive asks.
      */}
      <div className="flex-1 min-h-0 overflow-y-auto ob-scroll flex flex-col-reverse">
        {aggAsks.length === 0 ? (
          <div
            className="px-3 py-4 text-center text-xs"
            style={{ fontFamily: "'DM Mono', monospace", color: "#A8A59F" }}
          >
            No asks
          </div>
        ) : (
          aggAsks.map((level) => (
            <AggregatedPriceRow
              key={`ask-${level.price}`}
              level={level}
              maxSize={maxAskSize}
              side="ask"
              prevSizeRef={prevSizeRef}
            />
          ))
        )}
      </div>

      {/* ── Fixed mid / spread row ── */}
      <div
        className="flex items-center justify-center gap-3 py-2 border-y shrink-0"
        style={{ backgroundColor: "#FAFAF6", borderColor: "#E8E4DC" }}
      >
        {isBookCrossed ? (
          <span
            className="text-xs px-2 py-0.5 rounded"
            style={{
              fontFamily: "'DM Mono', monospace",
              color: "#991B1B",
              backgroundColor: "#FEE2E2",
              border: "1px solid #FECACA",
            }}
          >
            crossed market
          </span>
        ) : mid != null ? (
          <>
            <span
              className="text-xs"
              style={{ fontFamily: "'DM Mono', monospace", color: "#7C796F" }}
            >
              mid{" "}
              <span style={{ color: "#1A1814", fontWeight: 500 }}>{formatPrice(mid)}</span>
            </span>
            {spread != null && spread >= 0 && (
              <>
                <span style={{ color: "#DDD9D0", fontSize: 10 }}>|</span>
                <span
                  className="text-xs"
                  style={{ fontFamily: "'DM Mono', monospace", color: "#7C796F" }}
                >
                  spread{" "}
                  <span style={{ color: "#1A1814", fontWeight: 500 }}>{formatPrice(spread)}</span>
                </span>
              </>
            )}
          </>
        ) : (
          <span
            className="text-xs"
            style={{ fontFamily: "'DM Mono', monospace", color: "#A8A59F" }}
          >
            —
          </span>
        )}
      </div>

      {/* ── Bids: flex-1 scrollable ── */}
      <div className="flex-1 min-h-0 overflow-y-auto ob-scroll">
        {aggBids.length === 0 ? (
          <div
            className="px-3 py-4 text-center text-xs"
            style={{ fontFamily: "'DM Mono', monospace", color: "#A8A59F" }}
          >
            No bids
          </div>
        ) : (
          aggBids.map((level) => (
            <AggregatedPriceRow
              key={`bid-${level.price}`}
              level={level}
              maxSize={maxBidSize}
              side="bid"
              prevSizeRef={prevSizeRef}
            />
          ))
        )}
      </div>
    </div>
  );
}
