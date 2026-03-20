// src/index.js
// BankNifty AI Signal Generator — Main Entry Point

import 'dotenv/config';
import { UpstoxClient } from './upstox.js';
import { computeIndicators } from './indicators.js';
import { generateSignal } from './signal.js';
import { sendTelegramAlert, logSignal } from './alerts.js';
import { startDashboardServer } from './dashboard-server.js';

// ── Config ────────────────────────────────────────────────────────────────────
const INTERVAL_MS     = parseInt(process.env.SIGNAL_INTERVAL_MS ?? '300000'); // 5 min
const MIN_CONFIDENCE  = parseInt(process.env.MIN_CONFIDENCE ?? '65');
const CANDLE_INTERVAL = process.env.CANDLE_INTERVAL ?? '5minute';

// ── Validate environment ──────────────────────────────────────────────────────
const required = ['UPSTOX_ACCESS_TOKEN', 'ANTHROPIC_API_KEY'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`❌ Missing env variable: ${key}`);
    console.error('   Copy .env.example → .env and fill in your credentials.');
    process.exit(1);
  }
}

// ── State ─────────────────────────────────────────────────────────────────────
const upstox = new UpstoxClient(process.env.UPSTOX_ACCESS_TOKEN);
const dashboard = startDashboardServer(parseInt(process.env.DASHBOARD_PORT ?? '3000'));
let lastPrice = null;
let isRunning = false;

// ── Core: fetch → compute → generate → alert ─────────────────────────────────
async function runSignalCycle() {
  if (isRunning) return; // prevent overlapping cycles
  isRunning = true;

  try {
    // 1. Market hours check (9:15 – 15:30 IST)
    if (!isMarketOpen()) {
      console.log('[Signal] Market closed — skipping cycle');
      return;
    }

    console.log('\n─────────────────────────────────────────');
    console.log(`[Signal] Running cycle @ ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);

    // 2. Fetch candles (last 5 days at chosen interval)
    console.log(`[Upstox] Fetching ${CANDLE_INTERVAL} candles…`);
    const candles = await upstox.getCandles(CANDLE_INTERVAL, 5);
    console.log(`[Upstox] Got ${candles.length} candles. Latest close: ₹${candles[candles.length - 1].close.toLocaleString('en-IN')}`);

    // 3. Fetch options chain
    console.log('[Upstox] Fetching options chain…');
    const optionsData = await upstox.getOptionsChain();
    console.log(`[Upstox] PCR: ${optionsData.pcr} | Max Pain: ₹${optionsData.maxPainStrike?.toLocaleString('en-IN')}`);

    // 4. Compute indicators
    const indicators = computeIndicators(candles);
    const currentPrice = lastPrice ?? candles[candles.length - 1].close;
    console.log(`[Indicators] SuperTrend: ${indicators.supertrend.trend.toUpperCase()} | RSI: ${indicators.rsi.value} | MACD: ${indicators.macd.histogram > 0 ? '▲' : '▼'}`);

    // 5. Ask Claude for signal
    console.log('[Claude] Generating signal…');
    const signal = await generateSignal(indicators, optionsData, currentPrice);

    // Attach raw indicators for dashboard display
    signal._indicators = indicators;
    signal._options = optionsData;

    // 6. Print to console
    printSignal(signal);

    // 7. Log to file (always)
    logSignal(signal);

    // 8. Broadcast to dashboard
    dashboard.broadcast({ type: 'signal', signal });

    // 9. Send Telegram alert (only above min confidence threshold)
    if (signal.signal !== 'HOLD' && signal.confidence >= MIN_CONFIDENCE) {
      await sendTelegramAlert(signal);
    } else if (signal.signal === 'HOLD') {
      console.log(`[Alert] HOLD signal — no Telegram alert sent`);
    } else {
      console.log(`[Alert] Confidence ${signal.confidence}% < threshold ${MIN_CONFIDENCE}% — skipping alert`);
    }

  } catch (err) {
    console.error('[Error]', err.message);
    if (err.stack) console.error(err.stack);
  } finally {
    isRunning = false;
  }
}

// ── Pretty print signal to console ───────────────────────────────────────────
function printSignal(signal) {
  const colors = { BUY: '\x1b[32m', SELL: '\x1b[31m', HOLD: '\x1b[33m' };
  const reset = '\x1b[0m';
  const c = colors[signal.signal] ?? '';

  console.log(`\n${c}┌─────────────────────────────────────┐`);
  console.log(`│  BANKNIFTY ${signal.signal.padEnd(4)} @ ₹${String(signal.price?.toLocaleString('en-IN')).padEnd(10)} │`);
  console.log(`│  Confidence: ${signal.confidence}%  │  ${signal.timeframe.padEnd(22)}│`);
  if (signal.entry)    console.log(`│  Entry:    ₹${String(signal.entry?.toLocaleString('en-IN')).padEnd(25)}│`);
  if (signal.target)   console.log(`│  Target:   ₹${String(signal.target?.toLocaleString('en-IN')).padEnd(25)}│`);
  if (signal.stopLoss) console.log(`│  SL:       ₹${String(signal.stopLoss?.toLocaleString('en-IN')).padEnd(25)}│`);
  console.log(`└─────────────────────────────────────┘${reset}`);
  console.log(`[Reasoning] ${signal.reasoning}`);
  console.log(`[Risk] ${signal.keyRisks}`);
}

// ── Market hours check ────────────────────────────────────────────────────────
function isMarketOpen() {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = ist.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;

  const h = ist.getHours(), m = ist.getMinutes();
  const mins = h * 60 + m;
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🏦 BankNifty AI Signal Generator');
  console.log('══════════════════════════════════');
  console.log(`📊 Interval : ${CANDLE_INTERVAL} candles`);
  console.log(`⏱  Cycle    : Every ${INTERVAL_MS / 60000} minutes`);
  console.log(`🎯 Min Conf : ${MIN_CONFIDENCE}%`);
  console.log(`📱 Telegram : ${process.env.TELEGRAM_BOT_TOKEN ? '✅ Configured' : '❌ Not configured'}`);
  console.log('');

  // Connect WebSocket for live price
  console.log('[Upstox] Connecting live feed…');
  upstox.connectLiveFeed((price) => {
    lastPrice = price;
    dashboard.broadcast({ type: 'price', price });
    process.stdout.write(`\r[Live] BankNifty: ₹${price.toLocaleString('en-IN')}   `);
  });

  // Run first cycle immediately
  await runSignalCycle();

  // Then run on interval
  setInterval(runSignalCycle, INTERVAL_MS);

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[Shutdown] Closing connections…');
    upstox.disconnect();
    process.exit(0);
  });
}

main().catch(console.error);
