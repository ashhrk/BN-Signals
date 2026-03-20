// src/indicators.js
// Computes all technical indicators from OHLCV candles

import {
  EMA,
  RSI,
  BollingerBands,
  MACD,
  Stochastic,
  ATR,
} from 'technicalindicators';

export function computeIndicators(candles) {
  if (candles.length < 50) {
    throw new Error(`Need at least 50 candles, got ${candles.length}`);
  }

  const closes = candles.map((c) => c.close);
  const highs  = candles.map((c) => c.high);
  const lows   = candles.map((c) => c.low);
  const volumes = candles.map((c) => c.volume);

  // ── EMAs ──────────────────────────────────────────────────────────────────
  const ema9  = EMA.calculate({ period: 9,  values: closes });
  const ema21 = EMA.calculate({ period: 21, values: closes });
  const ema50 = EMA.calculate({ period: 50, values: closes });

  // ── RSI ───────────────────────────────────────────────────────────────────
  const rsi = RSI.calculate({ period: 14, values: closes });

  // ── Bollinger Bands ───────────────────────────────────────────────────────
  const bb = BollingerBands.calculate({
    period: 20, stdDev: 2, values: closes,
  });

  // ── MACD ──────────────────────────────────────────────────────────────────
  const macd = MACD.calculate({
    fastPeriod: 12, slowPeriod: 26, signalPeriod: 9,
    SimpleMAOscillator: false, SimpleMASignal: false,
    values: closes,
  });

  // ── Stochastic ────────────────────────────────────────────────────────────
  const stoch = Stochastic.calculate({
    high: highs, low: lows, close: closes,
    period: 14, signalPeriod: 3,
  });

  // ── ATR (volatility) ──────────────────────────────────────────────────────
  const atr = ATR.calculate({ period: 14, high: highs, low: lows, close: closes });

  // ── VWAP (session-based, resets daily) ───────────────────────────────────
  const vwap = calcVWAP(candles);

  // ── SuperTrend ────────────────────────────────────────────────────────────
  const supertrend = calcSuperTrend(candles, 10, 3);

  // ── Grab the latest values ────────────────────────────────────────────────
  const last = (arr) => arr[arr.length - 1];
  const prev = (arr) => arr[arr.length - 2];

  const currentPrice = last(closes);
  const latestBB     = last(bb);
  const latestMACD   = last(macd);
  const latestStoch  = last(stoch);
  const latestST     = last(supertrend);
  const latestATR    = last(atr);

  return {
    price: currentPrice,
    ema: {
      ema9:  +last(ema9).toFixed(2),
      ema21: +last(ema21).toFixed(2),
      ema50: +last(ema50).toFixed(2),
      ema9CrossEma21: last(ema9) > last(ema21) && prev(ema9) <= prev(ema21),
      ema9BelowEma21: last(ema9) < last(ema21) && prev(ema9) >= prev(ema21),
      bullishStack: last(ema9) > last(ema21) && last(ema21) > last(ema50),
    },
    rsi: {
      value: +last(rsi).toFixed(2),
      overbought: last(rsi) > 70,
      oversold:   last(rsi) < 30,
      neutral:    last(rsi) >= 40 && last(rsi) <= 60,
    },
    bollingerBands: {
      upper: +latestBB.upper.toFixed(2),
      middle: +latestBB.middle.toFixed(2),
      lower: +latestBB.lower.toFixed(2),
      bandwidth: +(((latestBB.upper - latestBB.lower) / latestBB.middle) * 100).toFixed(2),
      priceNearUpper: currentPrice > latestBB.upper * 0.998,
      priceNearLower: currentPrice < latestBB.lower * 1.002,
      squeeze: ((latestBB.upper - latestBB.lower) / latestBB.middle) < 0.02,
    },
    macd: {
      macd:      +(latestMACD?.MACD ?? 0).toFixed(2),
      signal:    +(latestMACD?.signal ?? 0).toFixed(2),
      histogram: +(latestMACD?.histogram ?? 0).toFixed(2),
      bullishCross: (latestMACD?.MACD ?? 0) > (latestMACD?.signal ?? 0) &&
                    (prev(macd)?.MACD ?? 0) <= (prev(macd)?.signal ?? 0),
      bearishCross: (latestMACD?.MACD ?? 0) < (latestMACD?.signal ?? 0) &&
                    (prev(macd)?.MACD ?? 0) >= (prev(macd)?.signal ?? 0),
    },
    stochastic: {
      k: +(latestStoch?.k ?? 0).toFixed(2),
      d: +(latestStoch?.d ?? 0).toFixed(2),
      overbought: (latestStoch?.k ?? 0) > 80,
      oversold:   (latestStoch?.k ?? 0) < 20,
    },
    supertrend: {
      trend:     latestST.trend,        // 'bullish' | 'bearish'
      value:     +latestST.value.toFixed(2),
      flipped:   latestST.trend !== last([...supertrend].slice(0, -1))?.trend,
    },
    atr: {
      value: +latestATR.toFixed(2),
      atrPercent: +((latestATR / currentPrice) * 100).toFixed(2),
    },
    vwap: {
      value: +vwap.toFixed(2),
      priceAbove: currentPrice > vwap,
    },
    volume: {
      current: last(volumes),
      avg20: +(volumes.slice(-20).reduce((a, b) => a + b, 0) / 20).toFixed(0),
      aboveAvg: last(volumes) > (volumes.slice(-20).reduce((a, b) => a + b, 0) / 20) * 1.5,
    },
  };
}

// ── VWAP ─────────────────────────────────────────────────────────────────────
function calcVWAP(candles) {
  // Reset at start of each session (9:15 AM IST)
  const sessionStart = new Date(candles[candles.length - 1].timestamp);
  sessionStart.setHours(9, 15, 0, 0);

  const sessionCandles = candles.filter((c) => c.timestamp >= sessionStart);
  if (!sessionCandles.length) return candles[candles.length - 1].close;

  let cumTPV = 0;
  let cumVol = 0;
  for (const c of sessionCandles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumTPV += tp * c.volume;
    cumVol += c.volume;
  }
  return cumVol > 0 ? cumTPV / cumVol : candles[candles.length - 1].close;
}

// ── SuperTrend ───────────────────────────────────────────────────────────────
function calcSuperTrend(candles, period = 10, multiplier = 3) {
  const atr = ATR.calculate({
    period,
    high:  candles.map((c) => c.high),
    low:   candles.map((c) => c.low),
    close: candles.map((c) => c.close),
  });

  const result = [];
  let prevUpper = 0, prevLower = 0, prevTrend = 'bullish';

  for (let i = period; i < candles.length; i++) {
    const atrVal = atr[i - period];
    const hl2 = (candles[i].high + candles[i].low) / 2;
    const close = candles[i].close;

    let upper = hl2 + multiplier * atrVal;
    let lower = hl2 - multiplier * atrVal;

    upper = (upper < prevUpper || candles[i - 1]?.close > prevUpper) ? upper : prevUpper;
    lower = (lower > prevLower || candles[i - 1]?.close < prevLower) ? lower : prevLower;

    const trend = prevTrend === 'bullish'
      ? (close < lower ? 'bearish' : 'bullish')
      : (close > upper ? 'bullish' : 'bearish');

    result.push({ trend, value: trend === 'bullish' ? lower : upper });
    prevUpper = upper;
    prevLower = lower;
    prevTrend = trend;
  }

  return result;
}
