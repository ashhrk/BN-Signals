// src/levels.js
// Pillar 1 — Pre-market level identification (Skills #1 & #2)
//
// Computes yesterday's OHLC as today's key S/R levels.
// Detects which level price is currently approaching.
// Classifies the likely entry type at each level.

export function computeLevels(candles, currentPrice) {
  // ── Separate today's candles from yesterday's ────────────────────────────
  const now = new Date();
  const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

  const todayDate = istNow.toISOString().split('T')[0];
  const yesterdayDate = new Date(istNow - 86400000).toISOString().split('T')[0];

  // Filter candles by date (using IST timestamp)
  const byDate = (candle, dateStr) => {
    const d = new Date(candle.timestamp.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    return d.toISOString().split('T')[0] === dateStr;
  };

  const todayCandles = candles.filter((c) => byDate(c, todayDate));
  const yestCandles  = candles.filter((c) => byDate(c, yesterdayDate));

  // Fallback: use last 75 candles as "yesterday" if date filter returns nothing
  const yest = yestCandles.length >= 5 ? yestCandles : candles.slice(-75, -candles.length + 25);

  // ── Yesterday OHLC ────────────────────────────────────────────────────────
  const yOpen  = yest[0]?.open  ?? null;
  const yClose = yest[yest.length - 1]?.close ?? null;
  const yHigh  = yest.length ? Math.max(...yest.map((c) => c.high))  : null;
  const yLow   = yest.length ? Math.min(...yest.map((c) => c.low))   : null;

  // ── Today's session high/low (so far) ────────────────────────────────────
  const todayHigh = todayCandles.length ? Math.max(...todayCandles.map((c) => c.high)) : currentPrice;
  const todayLow  = todayCandles.length ? Math.min(...todayCandles.map((c) => c.low))  : currentPrice;

  // ── Build ordered level list ──────────────────────────────────────────────
  const rawLevels = [
    { name: "Yesterday's high",  price: yHigh,  type: 'resistance' },
    { name: "Yesterday's close", price: yClose, type: yClose > currentPrice ? 'resistance' : 'support' },
    { name: "Yesterday's open",  price: yOpen,  type: yOpen  > currentPrice ? 'resistance' : 'support' },
    { name: "Yesterday's low",   price: yLow,   type: 'support' },
    { name: "Today's high",      price: todayHigh, type: 'resistance' },
    { name: "Today's low",       price: todayLow,  type: 'support' },
  ].filter((l) => l.price !== null);

  // Deduplicate levels that are within 0.1% of each other
  const levels = [];
  for (const level of rawLevels.sort((a, b) => a.price - b.price)) {
    const isDupe = levels.some((l) => Math.abs(l.price - level.price) / level.price < 0.001);
    if (!isDupe) levels.push(level);
  }

  // ── Proximity detection (Skill #2) ───────────────────────────────────────
  // "Near" = within 0.5% of level (your note says 0.3–0.5%)
  const NEAR_PCT = 0.005;

  const nearestResistance = levels
    .filter((l) => l.price > currentPrice)
    .sort((a, b) => a.price - b.price)[0] ?? null;

  const nearestSupport = levels
    .filter((l) => l.price <= currentPrice)
    .sort((a, b) => b.price - a.price)[0] ?? null;

  const distToResistance = nearestResistance
    ? ((nearestResistance.price - currentPrice) / currentPrice)
    : null;
  const distToSupport = nearestSupport
    ? ((currentPrice - nearestSupport.price) / currentPrice)
    : null;

  const approachingResistance = distToResistance !== null && distToResistance < NEAR_PCT;
  const approachingSupport    = distToSupport    !== null && distToSupport    < NEAR_PCT;

  // ── Entry type suggestion based on proximity ──────────────────────────────
  // From your 3-entry framework: bounce (70%), rejection (65%), breakout (60%)
  let suggestedEntryType = 'WAIT';
  let entryWinRate = null;

  if (approachingSupport) {
    suggestedEntryType = 'BOUNCE_FROM_SUPPORT';
    entryWinRate = 70;
  } else if (approachingResistance) {
    suggestedEntryType = 'REJECTION_AT_RESISTANCE';
    entryWinRate = 65;
  }

  // ── SL calculation (Pillar 5 — SL beyond the level, not at it) ───────────
  // Your rule: place SL 50pts beyond the level to avoid fake-outs
  const SL_BUFFER_PTS = 50;

  const slForBounce    = nearestSupport    ? nearestSupport.price    - SL_BUFFER_PTS : null;
  const slForRejection = nearestResistance ? nearestResistance.price + SL_BUFFER_PTS : null;

  // ── Target calculations (Pillar 4 — 3 methods, use most conservative) ─────
  let targets = null;

  if (nearestSupport && nearestResistance) {
    const srSpacing = nearestResistance.price - nearestSupport.price;

    // Method 1: S/R spacing — target = next level from entry
    const method1 = nearestSupport.price + srSpacing;

    // Method 2: Risk-based 1:2 R:R from a bounce entry
    const risk = nearestSupport.price - slForBounce;
    const method2 = nearestSupport.price + risk * 2;

    // Most conservative = smallest
    const conservative = Math.min(method1, method2);

    targets = {
      method1_sr:       +method1.toFixed(2),
      method2_risk_rr:  +method2.toFixed(2),
      conservative:     +conservative.toFixed(2),
      rrRatioAtMethod2: '1:2',
    };
  }

  return {
    yesterday: { open: yOpen, high: yHigh, low: yLow, close: yClose },
    today:     { high: todayHigh, low: todayLow },
    levels,          // full sorted list
    nearestResistance,
    nearestSupport,
    distToResistancePct: distToResistance ? +(distToResistance * 100).toFixed(2) : null,
    distToSupportPct:    distToSupport    ? +(distToSupport    * 100).toFixed(2) : null,
    approachingResistance,
    approachingSupport,
    suggestedEntryType,
    entryWinRate,
    stopLoss: {
      forBounce:    slForBounce    ? +slForBounce.toFixed(2)    : null,
      forRejection: slForRejection ? +slForRejection.toFixed(2) : null,
    },
    targets,
  };
}
