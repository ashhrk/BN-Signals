// src/upstox.js
// Handles all Upstox API calls: historical candles + live WebSocket quotes

import axios from 'axios';
import WebSocket from 'ws';

const BASE_URL = 'https://api.upstox.com/v2';

// BankNifty instrument key on Upstox
const BANKNIFTY_KEY = 'NSE_INDEX|Nifty Bank';

export class UpstoxClient {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.headers = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    };
    this.ws = null;
    this.livePrice = null;
  }

  // ── Historical OHLCV candles ─────────────────────────────────────────────
  async getCandles(interval = '5minute', days = 5) {
    const toDate = new Date().toISOString().split('T')[0];
    const fromDate = new Date(Date.now() - days * 86400000)
      .toISOString()
      .split('T')[0];

    const url =
      `${BASE_URL}/historical-candle/${encodeURIComponent(BANKNIFTY_KEY)}` +
      `/${interval}/${toDate}/${fromDate}`;

    const { data } = await axios.get(url, { headers: this.headers });

    // Upstox returns: [timestamp, open, high, low, close, volume, oi]
    return data.data.candles.map((c) => ({
      timestamp: new Date(c[0]),
      open: c[1],
      high: c[2],
      low: c[3],
      close: c[4],
      volume: c[5],
      oi: c[6],
    }));
  }

  // ── Options chain (PCR + max pain) ──────────────────────────────────────
  async getOptionsChain() {
    const expiry = getNextExpiry(); // nearest Thursday
    const url = `${BASE_URL}/option/chain`;
    const params = {
      instrument_key: BANKNIFTY_KEY,
      expiry_date: expiry,
    };

    const { data } = await axios.get(url, { headers: this.headers, params });
    const chain = data.data;

    let totalCallOI = 0;
    let totalPutOI = 0;
    const strikes = [];

    for (const item of chain) {
      const callOI = item.call_options?.market_data?.oi ?? 0;
      const putOI = item.put_options?.market_data?.oi ?? 0;
      totalCallOI += callOI;
      totalPutOI += putOI;
      strikes.push({
        strike: item.strike_price,
        callOI,
        putOI,
        callIV: item.call_options?.option_greeks?.iv ?? 0,
        putIV: item.put_options?.option_greeks?.iv ?? 0,
      });
    }

    const pcr = totalPutOI / (totalCallOI || 1);
    const maxPainStrike = calcMaxPain(strikes);

    return { pcr: +pcr.toFixed(3), maxPainStrike, strikes, expiry };
  }

  // ── Live WebSocket feed ──────────────────────────────────────────────────
  async connectLiveFeed(onPrice) {
    // Step 1: get a short-lived WebSocket auth URL from Upstox
    const { data } = await axios.get(`https://api.upstox.com/v3/feed/market-data-feed/authorize`, {
      headers: this.headers,
    });
    const wsUrl = data.data.authorized_redirect_uri;

    this.ws = new WebSocket(wsUrl, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    this.ws.on('open', () => {
      console.log('[Upstox WS] Connected');
      // Subscribe to BankNifty index
      const sub = {
        guid: 'banknifty-live',
        method: 'sub',
        data: {
          mode: 'ltpc',
          instrumentKeys: [BANKNIFTY_KEY],
        },
      };
      this.ws.send(Buffer.from(JSON.stringify(sub)));
    });

    this.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        const feeds = msg?.feeds ?? {};
        const ltp = feeds[BANKNIFTY_KEY]?.ltpc?.ltp;
        if (ltp) {
          this.livePrice = ltp;
          onPrice(ltp);
        }
      } catch (_) {}
    });

    this.ws.on('error', (err) => console.error('[Upstox WS] Error:', err.message));
    this.ws.on('close', () => {
      console.warn('[Upstox WS] Disconnected — reconnecting in 5s');
      setTimeout(() => this.connectLiveFeed(onPrice), 5000);
    });
  }

  disconnect() {
    this.ws?.close();
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getNextExpiry() {
  const d = new Date();
  // BankNifty expires every Wednesday; find the next one
  const day = d.getDay(); // 0=Sun … 6=Sat
  const daysUntilWed = (3 - day + 7) % 7 || 7;
  const expiry = new Date(d.getTime() + daysUntilWed * 86400000);
  return expiry.toISOString().split('T')[0];
}

function calcMaxPain(strikes) {
  // Max pain = strike where total option buyers lose the most
  let minLoss = Infinity;
  let maxPainStrike = strikes[0]?.strike ?? 0;

  for (const target of strikes) {
    let totalLoss = 0;
    for (const s of strikes) {
      if (s.strike < target.strike) totalLoss += (target.strike - s.strike) * s.callOI;
      if (s.strike > target.strike) totalLoss += (s.strike - target.strike) * s.putOI;
    }
    if (totalLoss < minLoss) {
      minLoss = totalLoss;
      maxPainStrike = target.strike;
    }
  }
  return maxPainStrike;
}
