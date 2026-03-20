// src/alerts.js — v2 with full trade journal (Pillar 6)

import TelegramBot from 'node-telegram-bot-api';
import { mkdirSync, appendFileSync } from 'fs';

let bot = null;
function getBot() {
  if (!bot && process.env.TELEGRAM_BOT_TOKEN) bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
  return bot;
}

// ── Telegram alert ─────────────────────────────────────────────────────────
export async function sendTelegramAlert(signal) {
  const b = getBot();
  if (!b || !process.env.TELEGRAM_CHAT_ID) { console.log('[Telegram] Not configured'); return; }

  const e = { BUY: '🟢', SELL: '🔴', HOLD: '⚪' }[signal.signal] ?? '⚪';
  const score = signal.checklistScore ?? '?';
  const scoreBar = '✅'.repeat(score) + '⬜'.repeat(7 - score);

  const checklistLines = signal.checklist ? [
    `${signal.checklist.levelIdentifiedBefore    ? '✅' : '❌'} Level identified before price reached it`,
    `${signal.checklist.priceWithin05pctOfLevel  ? '✅' : '❌'} Price within 0.5% of level`,
    `${signal.checklist.entryTypeIsOneOfThree    ? '✅' : '❌'} Entry type is one of the 3 framework types`,
    `${signal.checklist.oiConfirmsDirection      ? '✅' : '❌'} OI confirms direction`,
    `${signal.checklist.rrAtLeast1to2            ? '✅' : '❌'} R:R ≥ 1:2`,
    `${signal.checklist.slAndTargetDefined       ? '✅' : '❌'} SL and target defined`,
    `${signal.checklist.notInNoTradeZone         ? '✅' : '❌'} Not in no-trade time zone`,
  ].join('\n') : 'N/A';

  const msg = [
    `${e} *BANKNIFTY ${signal.signal}* ${e}`,
    ``,
    `💰 *Price:* ₹${fmt(signal.price)}`,
    `🎯 *Confidence:* ${signal.confidence}%`,
    `📋 *Entry Type:* ${signal.entryType ?? 'N/A'}`,
    `📍 *Triggering Level:* ${signal.triggeringLevel ?? 'N/A'}`,
    `⏱ *Timeframe:* ${signal.timeframe}`,
    ``,
    signal.entry    ? `📍 *Entry:*    ₹${fmt(signal.entry)}`    : null,
    signal.target   ? `🎯 *Target:*   ₹${fmt(signal.target)}`   : null,
    signal.stopLoss ? `🛑 *Stop Loss:* ₹${fmt(signal.stopLoss)}` : null,
    signal.rrRatio  ? `📊 *R:R:* ${signal.rrRatio}` : null,
    ``,
    `*7-Point Checklist:* ${scoreBar} ${score}/7`,
    checklistLines,
    ``,
    `📝 *Analysis:*`,
    signal.reasoning,
    ``,
    `⚠️ *Risk:* ${signal.keyRisks}`,
    ``,
    `🕐 ${new Date(signal.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`,
    ``,
    `_⚠ Educational purposes only. Not financial advice._`,
  ].filter((l) => l !== null).join('\n');

  await b.sendMessage(process.env.TELEGRAM_CHAT_ID, msg, { parse_mode: 'Markdown' });
  console.log(`[Telegram] Sent: ${signal.signal} @ ₹${signal.price}`);
}

// ── Trade journal logger (Pillar 6) ─────────────────────────────────────────
export function logSignal(signal, logDir = './logs') {
  try {
    mkdirSync(logDir, { recursive: true });
  } catch (_) {}

  const date = new Date().toISOString().split('T')[0];

  // JSONL for machine reading / dashboard
  const jsonEntry = {
    // Pillar 6 trade log fields
    date,
    time:            new Date(signal.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }),
    signal:          signal.signal,
    entryType:       signal.entryType ?? null,
    triggeringLevel: signal.triggeringLevel ?? null,
    price:           signal.price,
    entry:           signal.entry ?? null,
    target:          signal.target ?? null,
    stopLoss:        signal.stopLoss ?? null,
    rrRatio:         signal.rrRatio ?? null,
    confidence:      signal.confidence,
    checklistScore:  signal.checklistScore ?? null,
    checklist:       signal.checklist ?? null,
    timeframe:       signal.timeframe,
    reasoning:       signal.reasoning,
    keyRisks:        signal.keyRisks,
    trend:           signal.indicators?.trend,
    momentum:        signal.indicators?.momentum,
    volatility:      signal.indicators?.volatility,
    // Session context
    sessionSummary:  signal._session ?? null,
  };

  appendFileSync(`${logDir}/signals-${date}.jsonl`, JSON.stringify(jsonEntry) + '\n');

  // Human-readable daily log (mirrors your trade log template exactly)
  const readable = [
    `──────────────────────────────────────────`,
    `Date       : ${date}`,
    `Time       : ${jsonEntry.time} IST`,
    `Signal     : ${signal.signal}`,
    `Entry Type : ${signal.entryType ?? 'N/A'}  [Bounce=70% | Rejection=65% | Breakout=60%]`,
    `Level      : ${signal.triggeringLevel ?? 'N/A'}`,
    `Entry      : ₹${signal.entry?.toLocaleString('en-IN') ?? 'N/A'}`,
    `SL         : ₹${signal.stopLoss?.toLocaleString('en-IN') ?? 'N/A'}`,
    `Target     : ₹${signal.target?.toLocaleString('en-IN') ?? 'N/A'}`,
    `R:R        : ${signal.rrRatio ?? 'N/A'}`,
    `Confidence : ${signal.confidence}%`,
    `Checklist  : ${signal.checklistScore ?? '?'}/7  ${signal.checklist ? Object.entries(signal.checklist).map(([k,v]) => v ? '✓' : '✗').join('') : 'N/A'}`,
    `Reasoning  : ${signal.reasoning}`,
    `Risk       : ${signal.keyRisks}`,
    `Trend      : ${signal.indicators?.trend} | Momentum: ${signal.indicators?.momentum} | Vol: ${signal.indicators?.volatility}`,
    ``,
  ].join('\n');

  appendFileSync(`${logDir}/journal-${date}.txt`, readable);
}

const fmt = (n) => n != null ? Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '──';
