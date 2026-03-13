"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_RECONNECT_DELAY_MS,
  POLYMARKET_WS_URL,
  STALE_THRESHOLD_MS,
} from "@/src/config/market";
import {
  applyPolymarketDelta,
  normalizePolymarketSnapshot,
} from "@/src/lib/normalizer";
import { EMPTY_VENUE_BOOK } from "@/src/lib/orderbook";
import type {
  OrderLevel,
  Outcome,
  PolymarketBookEvent,
  PolymarketPriceChangeEvent,
  VenueOrderBook,
} from "@/src/types/orderbook";

// tokenIds[0] = YES outcome token, tokenIds[1] = NO outcome token
const TOKEN_IDS: Record<Outcome, string> = {
  YES: "35782709243786983035694178955131584324960374432781357142873120580614410145650",
  NO: "16507531654323613440839711226389584097745237130431039493320761537250304112351",
};

export function usePolymarketBook(outcome: Outcome = "YES"): VenueOrderBook {
  const [book, setBook] = useState<VenueOrderBook>(EMPTY_VENUE_BOOK);

  const tokenId = TOKEN_IDS[outcome];

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const staleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMessageTimeRef = useRef<number>(0);
  const unmountedRef = useRef<boolean>(false);
  const currentLevelsRef = useRef<{ bids: OrderLevel[]; asks: OrderLevel[] }>({
    bids: [],
    asks: [],
  });

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
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (staleIntervalRef.current) {
      clearInterval(staleIntervalRef.current);
      staleIntervalRef.current = null;
    }
  }, []);

  const connect = useCallback(
    (id: string, attempt: number) => {
      if (unmountedRef.current) return;

      const doConnect = () => {
        if (unmountedRef.current) return;
        setBook((prev) => ({ ...prev, status: "connecting" }));

        let ws: WebSocket;
        try {
          ws = new WebSocket(POLYMARKET_WS_URL);
        } catch {
          scheduleReconnect(id, attempt);
          return;
        }
        wsRef.current = ws;

        ws.onopen = () => {
          if (unmountedRef.current) { ws.close(); return; }
          ws.send(
            JSON.stringify({
              assets_ids: [id],
              type: "market",
              initial_dump: true,
              level: 2,
            })
          );
          lastMessageTimeRef.current = Date.now();

          // PING heartbeat every 10s
          pingIntervalRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send("PING");
          }, 10_000);
        };

        ws.onmessage = (event: MessageEvent) => {
          if (unmountedRef.current) return;
          const raw = event.data as string;
          if (raw === "PONG") return;

          lastMessageTimeRef.current = Date.now();

          try {
            const parsed = JSON.parse(raw);
            const events = Array.isArray(parsed) ? parsed : [parsed];

            for (const msg of events) {
              if (msg.event_type === "book") {
                console.log(msg);
                const snapshot = normalizePolymarketSnapshot(
                  msg as PolymarketBookEvent
                );
                currentLevelsRef.current = snapshot;
                setBook({
                  bids: snapshot.bids,
                  asks: snapshot.asks,
                  lastUpdated: Date.now(),
                  status: "live",
                });
              }
            }
          } catch {
            // ignore malformed
          }
        };

        ws.onclose = () => {
          if (unmountedRef.current) return;
          if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
            pingIntervalRef.current = null;
          }
          setBook((prev) => ({ ...prev, status: "disconnected" }));
          scheduleReconnect(id, attempt + 1);
        };

        ws.onerror = () => {
          ws.close();
        };
      };

      const delay = attempt === 0 ? 0 : Math.min(1000 * 2 ** (attempt - 1), MAX_RECONNECT_DELAY_MS);
      if (delay === 0) {
        doConnect();
      } else {
        reconnectTimeoutRef.current = setTimeout(doConnect, delay);
      }
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const scheduleReconnect = (id: string, attempt: number) => {
    const delay = Math.min(1000 * 2 ** (attempt - 1), MAX_RECONNECT_DELAY_MS);
    reconnectTimeoutRef.current = setTimeout(() => connect(id, attempt), delay);
  };

  // Stale detection
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
    }, 5000);

    return () => {
      if (staleIntervalRef.current) clearInterval(staleIntervalRef.current);
    };
  }, []);

  // Reconnect whenever the token changes (outcome toggle)
  useEffect(() => {
    unmountedRef.current = false;
    // Reset book state when switching tokens
    setBook(EMPTY_VENUE_BOOK);
    currentLevelsRef.current = { bids: [], asks: [] };
    connect(tokenId, 0);

    return () => {
      unmountedRef.current = true;
      cleanup();
    };
  }, [tokenId, connect, cleanup]);

  return book;
}
