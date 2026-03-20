// src/index.js — v2 with 7-pillar trading framework integrated

import 'dotenv/config';
import { UpstoxClient }      from './upstox.js';
import { computeIndicators } from './indicators.js';
import { computeLevels }     from './levels.js';
import { generateSignal }    from './signal.js';
import { sendTelegramAlert, logSignal } from './alerts.js';
import { startDashboardServer }         from './dashboard-server.js';
import {
  recordOI, getOITrend,
  get3LossStatus, getSessionSummary,
  printPreMarketReminder, getTimeZoneWarning,
} from './session.js';

const INTERVAL_MS     = parseInt(process.env.SIGNAL_INTERVAL_MS ?? '300000');
const CANDLE_INTERVAL = process.env.CANDLE_INTERVAL ?? '5minute';

const required = ['UPSTOX_ACCESS_TOKEN', 'ANTHROPIC_API_KEY'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`❌ Missing: ${key} — copy .env.example → .env`);
    process.exit(1);
  }
}

const upstox    = new UpstoxClient(process.env.UPSTOX_ACCESS_TOKEN);
const dashboard = startDashboardServer(parseInt(process.env.DASHBOARD_PORT ?? '3000'));
let lastPrice   = null;
let isRunning   = false;

// ── Core cycle ────────────────────────────────────────────────────────────────
async function runSignalCycle() {
  if (isRunning) return;
  isRunning = true;

  try {
    if (!isMarketOpen()) {
      console.log('[Signal] Market closed — skipping');
      return;
    }

    // Time-of-day + loss protocol state
    const timeWarning = getTimeZoneWarning();
    const lossProtocol = get3LossStatus();
    const sessionState = { timeWarning, lossProtocol };

    if (timeWarning.warning) console.log(`⚠  ${timeWarning.warning}`);
    if (lossProtocol.status !== 'OK') console.log(lossProtocol.message);

    console.log('\n─────────────────────────────────────────');
    console.log(`[Cycle] ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);

    // 1. Candles
    const candles = await upstox.getCandles(CANDLE_INTERVAL, 5);
    console.log(`[Upstox] ${candles.length} candles | close ₹${candles[candles.length-1].close.toLocaleString('en-IN')}`);

    // 2. Options
    const optionsData = await upstox.getOptionsChain();
    console.log(`[Options] PCR:${optionsData.pcr} | MaxPain:₹${optionsData.maxPainStrike?.toLocaleString('en-IN')}`);

    // 3. OI snapshot → trend
    const totalCallOI = optionsData.strikes.reduce((s, x) => s + x.callOI, 0);
    const totalPutOI  = optionsData.strikes.reduce((s, x) => s + x.putOI,  0);
    recordOI(totalCallOI, totalPutOI, optionsData.pcr);
    const oiTrend = getOITrend();
    console.log(`[OI] Call:${oiTrend.callOITrend} Put:${oiTrend.putOITrend} → ${oiTrend.interpretation}`);

    // 4. Indicators
    const indicators  = computeIndicators(candles);
    const currentPrice = lastPrice ?? candles[candles.length - 1].close;

    // 5. Key levels (Pillar 1)
    const levels = computeLevels(candles, currentPrice);
    if (levels.approachingResistance) console.log(`⚡ Approaching resistance: ₹${levels.nearestResistance.price}`);
    if (levels.approachingSupport)    console.log(`⚡ Approaching support:    ₹${levels.nearestSupport.price}`);

    // 6. Generate signal (all pillars embedded)
    console.log('[Claude] Generating signal…');
    const signal = await generateSignal(indicators, optionsData, currentPrice, levels, oiTrend, sessionState);

    // Attach context for dashboard
    signal._indicators  = indicators;
    signal._options     = optionsData;
    signal._levels      = levels;
    signal._oiTrend     = oiTrend;
    signal._session     = getSessionSummary();

    // 7. Print + log + broadcast
    printSignal(signal);
    logSignal(signal);
    dashboard.broadcast({ type: 'signal', signal });

    // 8. Telegram — only BUY/SELL with score 7 and above threshold
    const minConf = lossProtocol.adjustedMinConfidence;
    if (signal.signal !== 'HOLD' && signal.confidence >= minConf && signal.checklistScore === 7) {
      await sendTelegramAlert(signal);
    } else if (signal.signal !== 'HOLD') {
      console.log(`[Alert] Skipped — score:${signal.checklistScore}/7 conf:${signal.confidence}% threshold:${minConf}%`);
    }

  } catch (err) {
    console.error('[Error]', err.message);
  } finally {
    isRunning = false;
  }
}

// ── Console print ─────────────────────────────────────────────────────────────
function printSignal(s) {
  const c = s.signal === 'BUY' ? '\x1b[32m' : s.signal === 'SELL' ? '\x1b[31m' : '\x1b[33m';
  const r = '\x1b[0m';
  const score = s.checklistScore ?? '?';
  const scoreBar = '█'.repeat(score) + '░'.repeat(7 - score);

  console.log(`\n${c}┌──────────────────────────────────────────┐`);
  console.log(`│  ${s.signal.padEnd(4)} @ ₹${String(s.price?.toLocaleString('en-IN')).padEnd(10)} | Conf: ${s.confidence}%${' '.repeat(4)}│`);
  console.log(`│  Entry: ${s.entryType ?? 'N/A'}${' '.repeat(Math.max(0, 34 - (s.entryType?.length ?? 3)))}│`);
  console.log(`│  Level: ${(s.triggeringLevel ?? 'N/A').slice(0, 34).padEnd(34)}│`);
  console.log(`│  Checklist: [${scoreBar}] ${score}/7${' '.repeat(14)}│`);
  if (s.entry)    console.log(`│  Entry  ₹${String(s.entry?.toLocaleString('en-IN')).padEnd(32)}│`);
  if (s.target)   console.log(`│  Target ₹${String(s.target?.toLocaleString('en-IN')).padEnd(32)}│`);
  if (s.stopLoss) console.log(`│  SL     ₹${String(s.stopLoss?.toLocaleString('en-IN')).padEnd(32)}│`);
  if (s.rrRatio)  console.log(`│  R:R    ${String(s.rrRatio).padEnd(34)}│`);
  console.log(`└──────────────────────────────────────────┘${r}`);
  console.log(`[Reason] ${s.reasoning}`);
  if (s.keyRisks) console.log(`[Risk]   ${s.keyRisks}`);
}

// ── Market hours ──────────────────────────────────────────────────────────────
function isMarketOpen() {
  const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = ist.getDay();
  if (day === 0 || day === 6) return false;
  const mins = ist.getHours() * 60 + ist.getMinutes();
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}

// ── Boot ──────────────────────────────────────────────────────────────────────
async function main() {
  printPreMarketReminder();

  console.log('🏦 BankNifty AI Signal Generator v2');
  console.log('══════════════════════════════════════');
  console.log(`Interval : ${CANDLE_INTERVAL} | Cycle: every ${INTERVAL_MS/60000} min`);
  console.log(`Dashboard: http://localhost:${process.env.DASHBOARD_PORT ?? 3000}`);
  console.log('');

  upstox.connectLiveFeed((price) => {
    lastPrice = price;
    dashboard.broadcast({ type: 'price', price });
    process.stdout.write(`\r[Live] ₹${price.toLocaleString('en-IN')}   `);
  });

  await runSignalCycle();
  setInterval(runSignalCycle, INTERVAL_MS);

  process.on('SIGINT', () => {
    console.log('\n[Shutdown] Summary:');
    console.log(getSessionSummary());
    upstox.disconnect();
    process.exit(0);
  });
}

main().catch(console.error);
