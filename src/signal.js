// src/signal.js
// Sends all data to Claude. System prompt encodes the full 7-pillar trading framework.

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an expert BankNifty index trader and technical analyst with deep knowledge of NSE markets (India).

You operate using a strict 7-pillar framework. Follow every rule below without exception.

PILLAR 1 — KEY LEVELS (Pre-identified S/R)
Only signal if price is within 0.5% of a pre-identified level OR a confirmed breakout.
Always state which level triggered the signal.
Yesterday's High = strong resistance. Yesterday's Low = strong support. Yesterday's Close = pivot.

PILLAR 2 — OI CONFLUENCE (Not Blind Trading)
- Call OI RISING = bullish accumulation
- Call OI FALLING at resistance = HIGH PROBABILITY REJECTION — prefer puts
- Put OI RISING + Call OI FALLING = bearish shift
RULE: Never signal BUY when call OI is falling at resistance.
RULE: Never signal SELL when put OI is falling at support.

PILLAR 3 — THE 3-ENTRY FRAMEWORK (ONLY these 3 entries are permitted)
ENTRY 1 — BOUNCE FROM SUPPORT (70% win rate): Price at support + holds + closes 0.3-0.5% above + OI confirms → BUY calls
ENTRY 2 — REJECTION AT RESISTANCE (65% win rate): Price at resistance + rejection candle + call OI flat or falling → SELL calls / BUY puts
ENTRY 3 — BREAKOUT ABOVE LEVEL (60% win rate): Closes above resistance + volume above avg + call OI rising → BUY calls
RULE: If condition does NOT match one of these 3 → HOLD. No FOMO entries.

PILLAR 4 — TARGET SETTING (Mathematical, minimum 1:2 R:R)
Method 1: Distance to next S/R level. Method 2: Entry + (SL distance x 2).
Use the most conservative. Do not signal if R:R < 1:2.

PILLAR 5 — STOP LOSS PLACEMENT (50pts BEYOND the level, not AT it)
Bounce: SL = 50pts below support. Rejection: SL = 50pts above resistance.

PILLAR 6 — TIME-OF-DAY RULES
9:15-9:30: No new entries (noise). 3:00-3:30 PM: Close only, no new entries.

7-POINT ENTRY CHECKLIST (all 7 must be YES to signal BUY or SELL):
1. Level identified before price reached it?
2. Price within 0.5% of level?
3. Entry type is one of the 3 framework types?
4. OI confirms direction?
5. R:R >= 1:2?
6. SL and target both defined?
7. Not in a no-trade time zone?

Respond ONLY with this exact JSON (no markdown, no extra text):
{
  "signal": "BUY" | "SELL" | "HOLD",
  "entryType": "BOUNCE_FROM_SUPPORT" | "REJECTION_AT_RESISTANCE" | "BREAKOUT" | "HOLD",
  "triggeringLevel": "<level name and price>",
  "confidence": <0-100>,
  "entry": <price or null>,
  "target": <price or null>,
  "stopLoss": <price or null>,
  "rrRatio": "<e.g. 1:2.3>",
  "timeframe": "scalp (5-15 min)" | "intraday (30-60 min)" | "avoid",
  "checklist": {
    "levelIdentifiedBefore": true | false,
    "priceWithin05pctOfLevel": true | false,
    "entryTypeIsOneOfThree": true | false,
    "oiConfirmsDirection": true | false,
    "rrAtLeast1to2": true | false,
    "slAndTargetDefined": true | false,
    "notInNoTradeZone": true | false
  },
  "checklistScore": <0-7>,
  "reasoning": "<2-3 sentences citing specific levels and OI data>",
  "keyRisks": "<specific risk>",
  "indicators": {
    "trend": "bullish" | "bearish" | "neutral",
    "momentum": "strong" | "moderate" | "weak",
    "volatility": "high" | "normal" | "low"
  }
}
IMPORTANT: Output BUY or SELL ONLY if checklistScore = 7. Any score < 7 = HOLD.`;

export async function generateSignal(indicators, optionsData, currentPrice, levels, oiTrend, sessionState) {
  const userMessage = buildPrompt(indicators, optionsData, currentPrice, levels, oiTrend, sessionState);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1200,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const raw     = response.content[0].text.trim();
  const cleaned = raw.replace(/```json|```/g, '').trim();
  const signal  = JSON.parse(cleaned);

  signal.timestamp = new Date().toISOString();
  signal.price     = currentPrice;

  // 3-loss protocol override
  if (sessionState?.lossProtocol?.status === 'STOP' && signal.signal !== 'HOLD') {
    signal.signal    = 'HOLD';
    signal.reasoning = `[3-LOSS PROTOCOL ACTIVE] ${sessionState.lossProtocol.message}`;
    signal.confidence = 0;
  }

  return signal;
}

function buildPrompt(ind, opt, price, levels, oiTrend, sessionState) {
  const tw = sessionState?.timeWarning;
  const lp = sessionState?.lossProtocol;

  return `
BANKNIFTY REAL-TIME ANALYSIS — ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
Current Price: ₹${price.toLocaleString('en-IN')} | Candle: ${process.env.CANDLE_INTERVAL || '5minute'}
${tw?.warning ? `⚠ TIME WARNING: ${tw.warning}` : ''}
${lp?.status !== 'OK' ? `🛑 SESSION: ${lp?.message}` : ''}

── KEY S/R LEVELS (Pillar 1) ──
Yesterday: Open ₹${levels?.yesterday?.open ?? 'N/A'} | High ₹${levels?.yesterday?.high ?? 'N/A'} | Low ₹${levels?.yesterday?.low ?? 'N/A'} | Close ₹${levels?.yesterday?.close ?? 'N/A'}
Today so far: High ₹${levels?.today?.high ?? 'N/A'} | Low ₹${levels?.today?.low ?? 'N/A'}
Nearest Resistance: ₹${levels?.nearestResistance?.price ?? 'N/A'} (${levels?.nearestResistance?.name ?? ''}) — ${levels?.distToResistancePct ?? '--'}% away
Nearest Support   : ₹${levels?.nearestSupport?.price    ?? 'N/A'} (${levels?.nearestSupport?.name    ?? ''}) — ${levels?.distToSupportPct    ?? '--'}% away
${levels?.approachingResistance ? '⚡ PRICE APPROACHING RESISTANCE — watch for rejection' : ''}
${levels?.approachingSupport    ? '⚡ PRICE APPROACHING SUPPORT    — watch for bounce'    : ''}
Suggested Entry: ${levels?.suggestedEntryType ?? 'WAIT'} (${levels?.entryWinRate ?? '--'}% win rate)
Pre-calc SL (Bounce): ₹${levels?.stopLoss?.forBounce ?? 'N/A'} | SL (Rejection): ₹${levels?.stopLoss?.forRejection ?? 'N/A'}
Conservative Target: ₹${levels?.targets?.conservative ?? 'N/A'}

── OI TREND (Pillar 2) ──
Call OI: ${oiTrend?.callOITrend ?? 'N/A'} | Put OI: ${oiTrend?.putOITrend ?? 'N/A'} | PCR: ${oiTrend?.pcrTrend ?? 'N/A'}
Interpretation: ${oiTrend?.interpretation ?? 'N/A'}
OI History: ${(oiTrend?.snapshots ?? []).map(s => `${s.time} PCR:${s.pcr}`).join(' → ') || 'building...'}
Live PCR: ${opt.pcr} | Max Pain: ₹${opt.maxPainStrike?.toLocaleString('en-IN')} | Expiry: ${opt.expiry}
vs Max Pain: ${price > opt.maxPainStrike ? `₹${(price - opt.maxPainStrike).toLocaleString('en-IN')} above` : `₹${(opt.maxPainStrike - price).toLocaleString('en-IN')} below`}

── TREND ──
SuperTrend: ${ind.supertrend.trend.toUpperCase()} @ ₹${ind.supertrend.value}${ind.supertrend.flipped ? ' ⚡FLIPPED' : ''}
EMA 9/21/50: ₹${ind.ema.ema9} / ₹${ind.ema.ema21} / ₹${ind.ema.ema50} | Stack: ${ind.ema.bullishStack ? 'BULLISH' : 'NOT bullish'}
EMA Cross: ${ind.ema.ema9CrossEma21 ? 'BULLISH' : ind.ema.ema9BelowEma21 ? 'BEARISH' : 'none'}
VWAP: ₹${ind.vwap.value} — Price ${ind.vwap.priceAbove ? 'ABOVE' : 'BELOW'}

── MOMENTUM ──
RSI: ${ind.rsi.value} ${ind.rsi.overbought ? '(OVERBOUGHT)' : ind.rsi.oversold ? '(OVERSOLD)' : '(neutral)'}
MACD: ${ind.macd.macd} | Sig: ${ind.macd.signal} | Hist: ${ind.macd.histogram} | ${ind.macd.bullishCross ? 'BULLISH CROSS' : ind.macd.bearishCross ? 'BEARISH CROSS' : 'no cross'}
Stoch: K=${ind.stochastic.k} D=${ind.stochastic.d} ${ind.stochastic.overbought ? '(OB)' : ind.stochastic.oversold ? '(OS)' : ''}

── VOLATILITY ──
BB: ₹${ind.bollingerBands.upper} / ₹${ind.bollingerBands.middle} / ₹${ind.bollingerBands.lower} | BW: ${ind.bollingerBands.bandwidth}%${ind.bollingerBands.squeeze ? ' SQUEEZE' : ''}
ATR: ₹${ind.atr.value} (${ind.atr.atrPercent}%)
Volume: ${ind.volume.current.toLocaleString('en-IN')} vs avg ${ind.volume.avg20.toLocaleString('en-IN')} ${ind.volume.aboveAvg ? '→ HIGH VOLUME' : ''}

Apply all 7 pillars. Score the checklist. BUY/SELL only if checklistScore = 7.
`.trim();
}
