/**
 * Kalshi WebSocket Proxy
 *
 * Signs the Kalshi WS handshake with RSA-PSS and connects server-side
 * (Node.js can set custom headers; browsers cannot).
 *
 * Exposes a local unauthenticated WebSocket on ws://localhost:3001 that
 * the Next.js browser client connects to without any auth.
 *
 * Reads env vars from ../web/.env (or process.env if already set):
 *   NEXT_PUBLIC_KALSHI_API_KEY   — Kalshi Key ID
 *   KALSHI_PRIVATE_KEY           — PEM RSA private key (newlines as \n)
 *   KALSHI_TICKER                — Market ticker (default: KXRECOGPERSONIRAN-26)
 *   PROXY_PORT                   — Local WS port (default: 3001)
 */

import { createSign, constants } from "crypto";
import { createServer } from "http";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { WebSocket, WebSocketServer } from "ws";
import dotenv from "dotenv";

dotenv.config();

const KEY_ID = process.env.KALSHI_API_KEY;

// Private key: prefer base64-encoded (no multi-line .env issues),
// fall back to raw PEM with literal \n sequences.
function loadPrivateKey() {
  if (process.env.KALSHI_PRIVATE_KEY_BASE64) {
    return Buffer.from(process.env.KALSHI_PRIVATE_KEY_BASE64, "base64").toString("utf8");
  }
  if (process.env.KALSHI_PRIVATE_KEY) {
    return process.env.KALSHI_PRIVATE_KEY.replace(/\\n/g, "\n");
  }
  return null;
}

const PRIVATE_KEY = loadPrivateKey();
const TICKER = process.env.KALSHI_TICKER ?? "KXRECOGPERSONIRAN-26";
const PORT = parseInt(process.env.PROXY_PORT ?? "3001", 10);

const KALSHI_WS_URL = "wss://api.elections.kalshi.com/trade-api/ws/v2";
const KALSHI_WS_PATH = "/trade-api/ws/v2";
const MAX_RECONNECT_DELAY_MS = 30_000;
const PING_INTERVAL_MS = 10_000; // match Kalshi's server-side heartbeat cadence

if (!KEY_ID || !PRIVATE_KEY) {
  console.error(
    "[kalshi-proxy] Set KALSHI_API_KEY and KALSHI_PRIVATE_KEY_BASE64 in apps/kalshi-proxy/.env"
  );
  process.exit(1);
}

// ─── In-memory orderbook state ─────────────────────────────────────────────

// Raw price → quantity maps, keyed by price string (e.g. "0.2200").
// Populated from orderbook_snapshot, patched by each orderbook_delta.
const rawYes = new Map(); // yes-side bids
const rawNo = new Map();  // no-side bids

let latestTicker = null;

// Build a snapshot payload from current in-memory maps and broadcast it.
// This is what browser clients always receive — never raw deltas.
function buildSnapshotPayload() {
  return JSON.stringify({
    type: "orderbook_snapshot",
    msg: {
      market_ticker: latestTicker,
      yes_dollars_fp: Array.from(rawYes.entries()).map(([price, qty]) => [price, qty.toFixed(2)]),
      no_dollars_fp: Array.from(rawNo.entries()).map(([price, qty]) => [price, qty.toFixed(2)]),
    },
  });
}

// Cached snapshot string — replayed immediately to new browser connections.
let latestSnapshot = null;

// ─── Local WebSocket server ────────────────────────────────────────────────

const httpServer = createServer();
const wss = new WebSocketServer({ server: httpServer });

function broadcast(data) {
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

wss.on("connection", (client) => {
  console.log("[kalshi-proxy] Browser client connected");
  // Immediately replay the latest snapshot so the client has data right away
  if (latestSnapshot && client.readyState === WebSocket.OPEN) {
    client.send(latestSnapshot);
  }
  client.on("close", () => console.log("[kalshi-proxy] Browser client disconnected"));
});

httpServer.listen(PORT, () => {
  console.log(`[kalshi-proxy] Listening on ws://localhost:${PORT}`);
  connectToKalshi(0);
});

// ─── Kalshi connection ─────────────────────────────────────────────────────

function sign(timestampMs) {
  const message = `${timestampMs}GET${KALSHI_WS_PATH}`;
  const signer = createSign("SHA256");
  signer.update(message);
  return signer.sign(
    {
      key: PRIVATE_KEY,
      padding: constants.RSA_PKCS1_PSS_PADDING,
      saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
    },
    "base64"
  );
}

function connectToKalshi(attempt) {
  const timestampMs = Date.now();
  let signature;
  try {
    signature = sign(timestampMs);
  } catch (err) {
    console.error("[kalshi-proxy] Signing failed:", err.message);
    scheduleReconnect(attempt + 1);
    return;
  }

  console.log(`[kalshi-proxy] Connecting to Kalshi (attempt ${attempt})…`);

  const ws = new WebSocket(KALSHI_WS_URL, {
    headers: {
      "KALSHI-ACCESS-KEY": KEY_ID,
      "KALSHI-ACCESS-TIMESTAMP": String(timestampMs),
      "KALSHI-ACCESS-SIGNATURE": signature,
    },
  });

  let pingInterval = null;

  ws.on("open", () => {
    console.log("[kalshi-proxy] Connected to Kalshi — subscribing to", TICKER);
    ws.send(
      JSON.stringify({
        id: 1,
        cmd: "subscribe",
        params: {
          channels: ["orderbook_delta"],
          market_ticker: TICKER,
          initial_dump: true
        },
      })
    );

    // Send a WebSocket ping frame every 10s so the connection stays alive.
    // The ws library responds to server-initiated pings automatically;
    // we also ping proactively to handle any intermediary idle timeouts.
    pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping("heartbeat");
      }
    }, PING_INTERVAL_MS);
  });

  ws.on("pong", () => {
    // Server responded to our ping — connection is healthy
    console.log('received pong')
  });

  ws.on("message", (raw) => {
    const str = raw.toString();
    try {
      const parsed = JSON.parse(str);

      if (parsed.type === "orderbook_snapshot") {
        // Rebuild in-memory maps from the full snapshot
        const msg = parsed.msg;
        latestTicker = msg.market_ticker;
        rawYes.clear();
        rawNo.clear();
        for (const [price, qty] of (msg.yes_dollars_fp ?? [])) {
          const q = parseFloat(qty);
          if (q > 0) rawYes.set(price, q);
        }
        for (const [price, qty] of (msg.no_dollars_fp ?? [])) {
          const q = parseFloat(qty);
          if (q > 0) rawNo.set(price, q);
        }
        latestSnapshot = buildSnapshotPayload();
        console.log("[kalshi-proxy] Snapshot cached for", latestTicker);
        broadcast(latestSnapshot);

      } else if (parsed.type === "orderbook_delta") {
        // Patch the single changed level in-place
        const msg = parsed.msg;
        const map = msg.side === "yes" ? rawYes : rawNo;
        const current = map.get(msg.price_dollars) ?? 0;
        const next = current + parseFloat(msg.delta_fp);
        if (next <= 0) {
          map.delete(msg.price_dollars);
        } else {
          map.set(msg.price_dollars, next);
        }
        latestSnapshot = buildSnapshotPayload();
        console.log('new data broadcasted!');
        broadcast(latestSnapshot);
      }
    } catch { /* ignore parse errors */ }
  });

  ws.on("close", (code, reason) => {
    clearInterval(pingInterval);
    console.warn(`[kalshi-proxy] Kalshi WS closed (${code} ${reason}) — reconnecting…`);
    broadcast(JSON.stringify({ type: "close" }));
    scheduleReconnect(attempt + 1);
  });

  ws.on("error", (err) => {
    console.error("[kalshi-proxy] Kalshi WS error:", err.message);
    // onclose fires after onerror — reconnect handled there
  });
}

function scheduleReconnect(attempt) {
  const delay = Math.min(1000 * 2 ** (attempt - 1), MAX_RECONNECT_DELAY_MS);
  console.log(`[kalshi-proxy] Reconnecting in ${delay}ms…`);
  setTimeout(() => connectToKalshi(attempt), delay);
}
