"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DFLOW_WS_URL,
  MARKET_CONFIG,
  MAX_RECONNECT_DELAY_MS,
  STALE_THRESHOLD_MS,
} from "@/src/config/market";
import { normalizeDFlowMessage } from "@/src/lib/normalizer";
import { EMPTY_VENUE_BOOK } from "@/src/lib/orderbook";
import type { DFlowOrderbookMessage, Outcome, VenueOrderBook } from "@/src/types/orderbook";

export function useKalshiBook(outcome: Outcome = "YES"): VenueOrderBook {
  const [book, setBook] = useState<VenueOrderBook>(EMPTY_VENUE_BOOK);

  // Ref for use inside the WebSocket message handler (avoids closure staleness)
  const outcomeRef = useRef<Outcome>(outcome);

  // Cache the last raw DFlow message so we can immediately re-normalize it when
  // outcome toggles — no need to wait for the next WebSocket message from DFlow.
  const lastRawMessageRef = useRef<DFlowOrderbookMessage | null>(null);

  // When outcome changes: sync the ref AND immediately re-normalize the cached message
  useEffect(() => {
    outcomeRef.current = outcome;
    if (lastRawMessageRef.current) {
      const normalized = normalizeDFlowMessage(lastRawMessageRef.current, outcome);
      setBook((prev) => ({
        ...prev,
        bids: normalized.bids,
        asks: normalized.asks,
      }));
    } else {
      // No data yet — clear any stale state from the previous outcome
      setBook(EMPTY_VENUE_BOOK);
    }
  }, [outcome]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const staleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMessageTimeRef = useRef<number>(0);
  const attemptRef = useRef<number>(0);
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
    if (staleIntervalRef.current) {
      clearInterval(staleIntervalRef.current);
      staleIntervalRef.current = null;
    }
  }, []);

  const connect = useCallback(
    (attempt: number) => {
      if (unmountedRef.current) return;

      const delay = attempt === 0 ? 0 : Math.min(1000 * 2 ** (attempt - 1), MAX_RECONNECT_DELAY_MS);

      const doConnect = () => {
        if (unmountedRef.current) return;

        // Close any existing connection before opening a new one
        if (wsRef.current) {
          wsRef.current.onopen = null;
          wsRef.current.onmessage = null;
          wsRef.current.onclose = null;
          wsRef.current.onerror = null;
          wsRef.current.close();
          wsRef.current = null;
        }

        setBook((prev) => ({ ...prev, status: "connecting" }));

        let ws: WebSocket;
        try {
          ws = new WebSocket(DFLOW_WS_URL);
        } catch {
          scheduleReconnect(attempt);
          return;
        }

        wsRef.current = ws;

        ws.onopen = () => {
          console.log('web socket open, sending orderbook subscription')
          if (unmountedRef.current) { ws.close(); return; }
          attemptRef.current = 0;
          ws.send(
            JSON.stringify({
              type: "subscribe",
              channel: "orderbook",
              tickers: [MARKET_CONFIG.kalshi.ticker],
              initial_dump: true,
            })
          );
          // Record connect time so stale detection can fire if no data arrives
          lastMessageTimeRef.current = Date.now();
          // Stay in 'connecting' — only move to 'live' once real data arrives
        };

        ws.onmessage = (event: MessageEvent) => {
          if (unmountedRef.current) return;
          lastMessageTimeRef.current = Date.now();

          try {
            const parsed = JSON.parse(event.data as string) as DFlowOrderbookMessage;
            if (parsed.channel === "orderbook" && parsed.type === "orderbook") {
              // Cache raw message for instant re-normalization on outcome toggle
              lastRawMessageRef.current = parsed;
              const normalized = normalizeDFlowMessage(parsed, outcomeRef.current);
              setBook({
                bids: normalized.bids,
                asks: normalized.asks,
                lastUpdated: Date.now(),
                status: "live",
              });
            }
          } catch {
            // ignore malformed messages
          }
        };

        ws.onclose = () => {
          if (unmountedRef.current) return;
          setBook((prev) => ({ ...prev, status: "disconnected" }));
          scheduleReconnect(attempt + 1);
        };

        ws.onerror = () => {
          ws.close(); // triggers onclose for reconnect
        };
      };

      if (delay === 0) {
        doConnect();
      } else {
        reconnectTimeoutRef.current = setTimeout(doConnect, delay);
      }
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const scheduleReconnect = (attempt: number) => {
    const delay = Math.min(1000 * 2 ** (attempt - 1), MAX_RECONNECT_DELAY_MS);
    reconnectTimeoutRef.current = setTimeout(() => connect(attempt), delay);
  };

  // Stale detection: fires if data stops arriving on a live connection,
  // OR if the connection was accepted but never sent any orderbook data.
  // Closes the socket so onclose → scheduleReconnect takes over.
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
        // Force a reconnect by closing the silent/stale socket
        if (
          wsRef.current &&
          (wsRef.current.readyState === WebSocket.OPEN ||
            wsRef.current.readyState === WebSocket.CONNECTING)
        ) {
          wsRef.current.close();
        }
      }
    }, 5000);

    return () => {
      if (staleIntervalRef.current) clearInterval(staleIntervalRef.current);
    };
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
