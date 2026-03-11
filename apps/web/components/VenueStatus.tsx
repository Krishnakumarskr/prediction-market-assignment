"use client";

import type { Venue, VenueOrderBook } from "@/src/types/orderbook";

interface VenueStatusProps {
  venue: Venue;
  book: VenueOrderBook;
}

const VENUE_COLORS: Record<Venue, string> = {
  kalshi: "#1565C0",
  polymarket: "#D4500C",
};

const STATUS_DOT: Record<string, { bg: string; shadow?: string; pulse: boolean }> = {
  live: { bg: "#16A34A", shadow: "0 0 5px rgba(22,163,74,0.5)", pulse: true },
  stale: { bg: "#CA8A04", pulse: false },
  disconnected: { bg: "#DC2626", pulse: false },
  connecting: { bg: "#94A3B8", pulse: true },
};

function formatLastUpdated(ts: number): string {
  if (ts === 0) return "—";
  const elapsed = Math.round((Date.now() - ts) / 1000);
  if (elapsed < 60) return `${elapsed}s ago`;
  return `${Math.round(elapsed / 60)}m ago`;
}

export function VenueStatus({ venue, book }: VenueStatusProps) {
  const color = VENUE_COLORS[venue];
  const dot = STATUS_DOT[book.status] ?? STATUS_DOT["connecting"]!;
  const label = venue === "kalshi" ? "KALSHI" : "POLYMARKET";

  return (
    <div className="flex items-center gap-2">
      <span
        className={dot.pulse ? "animate-pulse-glow" : ""}
        style={{
          display: "inline-block",
          width: 7,
          height: 7,
          borderRadius: "50%",
          backgroundColor: dot.bg,
          boxShadow: dot.shadow,
          flexShrink: 0,
        }}
      />
      <span
        className="text-xs tracking-widest font-semibold"
        style={{ fontFamily: "'DM Mono', monospace", color }}
      >
        {label}
      </span>
      <span
        className="text-xs"
        style={{ fontFamily: "'DM Sans', system-ui, sans-serif", color: "#7C796F" }}
      >
        {book.status === "live" && "live"}
        {book.status === "stale" && `stale · ${formatLastUpdated(book.lastUpdated)}`}
        {book.status === "disconnected" && "disconnected"}
        {book.status === "connecting" && "connecting…"}
      </span>
    </div>
  );
}
