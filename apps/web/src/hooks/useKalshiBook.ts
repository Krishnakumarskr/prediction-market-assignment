"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_RECONNECT_DELAY_MS, STALE_THRESHOLD_MS } from "@/src/config/market";
import { normalizeKalshiRawMaps } from "@/src/lib/normalizer";
import { EMPTY_VENUE_BOOK } from "@/src/lib/orderbook";
import type {
  KalshiSnapshotMessage,
  Outcome,
  VenueOrderBook,
} from "@/src/types/orderbook";

// The proxy URL — set NEXT_PUBLIC_KALSHI_PROXY_URL in apps/web/.env to override
const PROXY_URL =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_KALSHI_PROXY_URL) ||
  "ws://localhost:3001";

/**
 * Connects to the local Kalshi proxy (apps/kalshi-proxy) which signs + proxies
 * the authenticated Kalshi WS. Raw dollar maps are kept in refs so outcome
 * toggles instantly re-normalize without reconnecting.
 */
export function useKalshiBook(outcome: Outcome = "YES"): VenueOrderBook {
  const [book, setBook] = useState<VenueOrderBook>(EMPTY_VENUE_BOOK);

  // Raw dollar maps keyed by price string, e.g. "0.2200"
  const rawYesRef = useRef<Map<string, number>>(new Map());
  const rawNoRef = useRef<Map<string, number>>(new Map());

  // Always-current outcome for use inside WS event handlers
  const outcomeRef = useRef<Outcome>(outcome);

  // Re-normalize immediately when outcome toggles — no reconnect needed
  useEffect(() => {
    outcomeRef.current = outcome;
    if (rawYesRef.current.size > 0 || rawNoRef.current.size > 0) {
      const normalized = normalizeKalshiRawMaps(rawYesRef.current, rawNoRef.current, outcome);
      setBook((prev) => ({ ...prev, bids: normalized.bids, asks: normalized.asks }));
    }
  }, [outcome]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const staleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMessageTimeRef = useRef<number>(0);
  const unmountedRef = useRef<boolean>(false);

  const cleanup = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback((attempt: number) => {
    if (unmountedRef.current) return;
    const delay = Math.min(1000 * 2 ** (attempt - 1), MAX_RECONNECT_DELAY_MS);
    reconnectTimeoutRef.current = setTimeout(() => connect(attempt), delay);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useCallback(
    (attempt: number) => {
      if (unmountedRef.current) return;

      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
        wsRef.current = null;
      }

      setBook((prev) => ({ ...prev, status: "connecting" }));
      lastMessageTimeRef.current = Date.now();

      let ws: WebSocket;
      try {
        ws = new WebSocket(PROXY_URL);
      } catch {
        scheduleReconnect(attempt + 1);
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        if (unmountedRef.current) { ws.close(); return; }
        attempt = 0;
        // Proxy streams all messages automatically — no subscribe needed from client
      };

      ws.onmessage = (event: MessageEvent<string>) => {
        if (unmountedRef.current) return;
        lastMessageTimeRef.current = Date.now();

        try {
          const parsed = JSON.parse(event.data) as KalshiSnapshotMessage | { type: string };

          if (parsed.type === "orderbook_snapshot") {
            const snap = (parsed as KalshiSnapshotMessage).msg;

            rawYesRef.current = new Map(
              (snap.yes_dollars_fp ?? []).map(([price, dollars]) => [price, parseFloat(dollars)])
            );
            rawNoRef.current = new Map(
              (snap.no_dollars_fp ?? []).map(([price, dollars]) => [price, parseFloat(dollars)])
            );

            const normalized = normalizeKalshiRawMaps(
              rawYesRef.current,
              rawNoRef.current,
              outcomeRef.current
            );
            setBook({
              bids: normalized.bids,
              asks: normalized.asks,
              lastUpdated: Date.now(),
              status: "live",
            });
          } else if (parsed.type === "close") {
            setBook((prev) => ({ ...prev, status: "stale" }));
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (unmountedRef.current) return;
        setBook((prev) => ({ ...prev, status: "disconnected" }));
        scheduleReconnect(attempt + 1);
      };

      ws.onerror = () => {
        ws.close(); // triggers onclose → scheduleReconnect
      };
    },
    [scheduleReconnect]
  );

  // Stale detection: if no message for STALE_THRESHOLD_MS, mark stale and reconnect
  useEffect(() => {
    staleIntervalRef.current = setInterval(() => {
      if (
        lastMessageTimeRef.current > 0 &&
        Date.now() - lastMessageTimeRef.current > STALE_THRESHOLD_MS
      ) {
        setBook((prev) => {
          if (prev.status === "live" || prev.status === "connecting") {
            return { ...prev, status: "stale" };
          }
          return prev;
        });
        if (
          wsRef.current &&
          (wsRef.current.readyState === WebSocket.OPEN ||
            wsRef.current.readyState === WebSocket.CONNECTING)
        ) {
          wsRef.current.close();
        }
      }
    }, 50000);

    return () => {
      if (staleIntervalRef.current) clearInterval(staleIntervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    connect(0);
    return () => {
      unmountedRef.current = true;
      cleanup();
    };
  }, [connect, cleanup]);

  return book;
}

