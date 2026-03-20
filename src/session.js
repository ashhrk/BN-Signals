// src/session.js
// Pillar 2 (OI trend tracking) + Pillar 7 (3-loss protocol + psychology reminders)
//
// Holds in-memory state for the current trading session:
//   - OI snapshots every cycle → trend (rising / falling / flat)
//   - Consecutive loss counter → 3-loss protocol enforcement
//   - Session P&L summary

const MAX_OI_HISTORY = 20; // keep last 20 snapshots (~100 mins at 5-min cycles)

// ── OI history ───────────────────────────────────────────────────────────────
const oiHistory = []; // { timestamp, callOI, putOI, pcr }

export function recordOI(callOI, putOI, pcr) {
  oiHistory.push({ timestamp: new Date(), callOI, putOI, pcr });
  if (oiHistory.length > MAX_OI_HISTORY) oiHistory.shift();
}

export function getOITrend() {
  if (oiHistory.length < 3) return { callOITrend: 'insufficient data', putOITrend: 'insufficient data', pcrTrend: 'insufficient data' };

  const recent = oiHistory.slice(-3);   // last 3 snapshots
  const older  = oiHistory.slice(-6, -3); // 3 before that

  if (older.length < 3) return { callOITrend: 'not enough history', putOITrend: 'not enough history', pcrTrend: 'not enough history' };

  const avg = (arr, key) => arr.reduce((s, o) => s + o[key], 0) / arr.length;

  const callRecent = avg(recent, 'callOI');
  const callOlder  = avg(older,  'callOI');
  const putRecent  = avg(recent, 'putOI');
  const putOlder   = avg(older,  'putOI');
  const pcrRecent  = avg(recent, 'pcr');
  const pcrOlder   = avg(older,  'pcr');

  const dir = (r, o) => r > o * 1.01 ? 'RISING' : r < o * 0.99 ? 'FALLING' : 'FLAT';

  return {
    callOITrend: dir(callRecent, callOlder),
    putOITrend:  dir(putRecent, putOlder),
    pcrTrend:    dir(pcrRecent, pcrOlder),
    // Derived interpretation (Skill #4 — OI-level confluence)
    interpretation: interpretOITrend(dir(callRecent, callOlder), dir(putRecent, putOlder)),
    snapshots: oiHistory.slice(-6).map((o) => ({
      time: o.timestamp.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }),
      callOI: o.callOI,
      putOI: o.putOI,
      pcr: o.pcr,
    })),
  };
}

function interpretOITrend(callTrend, putTrend) {
  if (callTrend === 'RISING'  && putTrend === 'FLAT')    return 'BULLISH ACCUMULATION — call buyers entering';
  if (callTrend === 'FALLING' && putTrend === 'RISING')  return 'BEARISH SHIFT — call buyers exiting, put buyers entering';
  if (callTrend === 'FALLING' && putTrend === 'FLAT')    return 'BULLISH MOMENTUM SLOWING — be cautious on calls';
  if (callTrend === 'RISING'  && putTrend === 'RISING')  return 'NEUTRAL — both sides building, expect range';
  if (callTrend === 'FLAT'    && putTrend === 'RISING')  return 'MILDLY BEARISH — put accumulation';
  if (callTrend === 'FALLING' && putTrend === 'FALLING') return 'UNWINDING — both sides exiting, low conviction';
  return 'NEUTRAL';
}

// ── Session loss tracking (Pillar 7 — 3-loss protocol) ───────────────────────
let consecutiveLosses = 0;
let sessionTrades     = [];
let baseMinConfidence = parseInt(process.env.MIN_CONFIDENCE ?? '65');

export function recordTradeResult(signal, actualExitPrice) {
  const isLoss = actualExitPrice < signal.entry
    ? signal.signal === 'BUY'
    : signal.signal === 'SELL';

  if (isLoss) {
    consecutiveLosses++;
  } else {
    consecutiveLosses = 0; // reset streak on any win
  }

  sessionTrades.push({
    timestamp: new Date().toISOString(),
    signal:    signal.signal,
    entry:     signal.entry,
    exitPrice: actualExitPrice,
    isLoss,
    consecutiveLossesAfter: consecutiveLosses,
  });

  return get3LossStatus();
}

export function get3LossStatus() {
  if (consecutiveLosses === 0) {
    return { status: 'OK', message: null, adjustedMinConfidence: baseMinConfidence };
  }
  if (consecutiveLosses === 1) {
    return {
      status: 'WARNING_1',
      message: '⚠ 1st consecutive loss. Review the trade. Take a 30-min break before next entry.',
      adjustedMinConfidence: baseMinConfidence,
    };
  }
  if (consecutiveLosses === 2) {
    return {
      status: 'WARNING_2',
      message: '⚠⚠ 2nd consecutive loss. 1-hour break mandatory. Ask yourself: Am I trading emotionally?',
      adjustedMinConfidence: baseMinConfidence + 10, // raise bar slightly
    };
  }
  // 3+ losses
  return {
    status: 'STOP',
    message: '🛑 3-LOSS PROTOCOL: STOP TRADING for today. Review all 3 trades. Come back tomorrow fresh.',
    adjustedMinConfidence: 85, // only extremely high-confidence signals allowed
  };
}

export function getSessionSummary() {
  const wins   = sessionTrades.filter((t) => !t.isLoss).length;
  const losses = sessionTrades.filter((t) =>  t.isLoss).length;
  return {
    totalTrades:        sessionTrades.length,
    wins,
    losses,
    consecutiveLosses,
    winRate:            sessionTrades.length ? +(wins / sessionTrades.length * 100).toFixed(1) : 0,
    lossProtocolStatus: get3LossStatus().status,
  };
}

// ── Psychology pre-market reminder ───────────────────────────────────────────
export function printPreMarketReminder() {
  console.log('\n╔═══════════════════════════════════════════╗');
  console.log('║     PRE-MARKET PSYCHOLOGY CHECKLIST       ║');
  console.log('╠═══════════════════════════════════════════╣');
  console.log('║  ☐ Slept 7+ hours?                        ║');
  console.log('║  ☐ Eaten breakfast?                       ║');
  console.log('║  ☐ Not in revenge mode from yesterday?    ║');
  console.log('║  ☐ Can accept a loss today?               ║');
  console.log('║  ☐ Trading for profit, not boredom?       ║');
  console.log('╠═══════════════════════════════════════════╣');
  console.log('║  If ANY = NO → Consider sitting out today ║');
  console.log('╚═══════════════════════════════════════════╝\n');
}

// ── Time-of-day guard (Pillar 7) ─────────────────────────────────────────────
export function getTimeZoneWarning() {
  const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const mins = ist.getHours() * 60 + ist.getMinutes();

  if (mins >= 9 * 60 + 15 && mins < 9 * 60 + 30) {
    return { zone: 'OPEN_VOLATILITY', warning: 'First 15 mins — high noise zone. Wait for 9:30 AM before entering.' };
  }
  if (mins >= 15 * 60 && mins <= 15 * 60 + 30) {
    return { zone: 'CLOSE_ZONE', warning: 'Last 30 mins — close existing positions only. No new entries.' };
  }
  return { zone: 'NORMAL', warning: null };
}
