"use client";

import { useEffect, useRef } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getMidPrice, getSpread } from "@/src/lib/orderbook";
import type { CombinedOrderBook, Outcome, OrderLevel, VenueFilter } from "@/src/types/orderbook";

const VENUE_COLOR: Record<string, string> = {
  kalshi: "#1565C0",
  polymarket: "#D4500C",
};

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

function PriceRow({
  level,
  maxSize,
  side,
  prevSizeRef,
}: {
  level: OrderLevel;
  maxSize: number;
  side: "bid" | "ask";
  prevSizeRef: React.MutableRefObject<Map<string, number>>;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const key = `${level.venue}-${side}-${level.price}`;

  useEffect(() => {
    const prev = prevSizeRef.current.get(key);
    if (prev !== undefined && prev !== level.size && rowRef.current) {
      const cls = level.size > prev ? "animate-flash-green" : "animate-flash-red";
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
    prevSizeRef.current.set(key, level.size);
  });

  const depthPct = maxSize > 0 ? (level.size / maxSize) * 100 : 0;
  const color = VENUE_COLOR[level.venue];
  const depthColor = level.venue === "kalshi" ? "#1565C014" : "#D4500C14";

  return (
    <div
      ref={rowRef}
      className="relative flex items-center px-3 py-[3px] transition-colors shrink-0"
      style={{ height: 28, cursor: "default" }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#F6F3EE"; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
    >
      {/* Depth bar */}
      <div
        className="absolute top-0 bottom-0 pointer-events-none"
        style={{
          [side === "bid" ? "right" : "left"]: 0,
          width: `${depthPct}%`,
          backgroundColor: depthColor,
        }}
      />

      {/* Venue dot */}
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0 mr-2"
        style={{ backgroundColor: color }}
      />

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

      {/* Size with tooltip */}
      <Tooltip>
        <TooltipTrigger>
          <span
            className="text-sm ml-auto cursor-default"
            style={{
              fontFamily: "'DM Mono', monospace",
              fontVariantNumeric: "tabular-nums",
              color: "#7C796F",
            }}
          >
            {formatSize(level.size)}
          </span>
        </TooltipTrigger>
        <TooltipContent side="left" className="text-xs" style={{ fontFamily: "'DM Mono', monospace" }}>
          {level.size.toLocaleString()} shares · {level.venue === "kalshi" ? "Kalshi" : "Polymarket"}
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

  const bids = book.bids;
  const asks = book.asks;

  const maxBidSize = Math.max(...bids.map((b) => b.size), 1);
  const maxAskSize = Math.max(...asks.map((a) => a.size), 1);

  const mid = getMidPrice(book);
  const spread = getSpread(book);
  const isYes = outcome === "YES";

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
        scroll-start at top = most expensive asks out of view (correct default).
      */}
      <div className="flex-1 min-h-0 overflow-y-auto ob-scroll flex flex-col-reverse">
        {asks.length === 0 ? (
          <div
            className="px-3 py-4 text-center text-xs"
            style={{ fontFamily: "'DM Mono', monospace", color: "#A8A59F" }}
          >
            No asks
          </div>
        ) : (
          asks.map((level) => (
            <PriceRow
              key={`ask-${level.venue}-${level.price}`}
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
        {mid != null ? (
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
        {bids.length === 0 ? (
          <div
            className="px-3 py-4 text-center text-xs"
            style={{ fontFamily: "'DM Mono', monospace", color: "#A8A59F" }}
          >
            No bids
          </div>
        ) : (
          bids.map((level) => (
            <PriceRow
              key={`bid-${level.venue}-${level.price}`}
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
