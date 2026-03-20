# BankNifty AI Signal Generator

> An AI-powered intraday signal bot for the BankNifty index — built with Node.js, Upstox API, Claude AI, and a real-time terminal dashboard.

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![Claude AI](https://img.shields.io/badge/Claude-Sonnet_4-D97757?style=flat-square&logo=anthropic&logoColor=white)
![Upstox](https://img.shields.io/badge/Upstox-API_v2-6244BB?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)
![Disclaimer](https://img.shields.io/badge/Disclaimer-Not_Financial_Advice-red?style=flat-square)

---

## What this is

This bot watches BankNifty in real time, computes 10+ technical indicators, reads the options chain, and asks Claude AI to generate a structured BUY / SELL / HOLD signal — but only after passing a strict 7-point entry checklist derived from a professional intraday trading framework.

It is **not** a fully automated trading system. It generates signals that you execute manually on Groww or Upstox. The discipline layer stays with you; the analysis layer is automated.

---

## Demo

```
┌──────────────────────────────────────────┐
│  BUY  @ ₹48,520       | Conf: 82%        │
│  Entry: BOUNCE_FROM_SUPPORT              │
│  Level: Yesterday's Low at ₹48,200       │
│  Checklist: [███████] 7/7                │
│  Entry  ₹48,520                          │
│  Target ₹48,920                          │
│  SL     ₹48,150                          │
│  R:R    1:2.3                            │
└──────────────────────────────────────────┘
[Reason] Price bounced cleanly off yesterday's low with
         high volume. SuperTrend bullish, VWAP above,
         call OI rising — all 7 checklist items pass.
[Risk]   Global cues could cause gap-down reversal.
```

---

## Architecture

```
Upstox WebSocket (live price feed)
Upstox REST API  (5-min OHLCV candles + options chain)
        │
        ▼
Indicator Engine
  EMA 9/21/50 · RSI · MACD · Bollinger Bands
  SuperTrend · Stochastic · ATR · VWAP
        │
        ▼
Levels Engine  (Pillar 1)
  Yesterday OHLC → today's S/R levels
  Proximity detection · SL/target pre-calc
        │
        ▼
Session Engine  (Pillar 7)
  OI trend tracking · 3-loss protocol
  Time-of-day guards · Psychology reminders
        │
        ▼
Claude AI  (claude-sonnet-4)
  7-pillar system prompt · 7-point checklist
  Entry type classification · R:R validation
        │
        ├──▶ Telegram Alert  (BUY/SELL only, score 7/7)
        ├──▶ JSON signal log  (every signal)
        ├──▶ Human-readable trade journal
        └──▶ Live WebSocket dashboard  (localhost:3000)
```

---

## Features

### Signal generation
- BUY / SELL / HOLD signals with confidence percentage
- Signals locked behind a **7-point entry checklist** — all 7 must pass before Claude can output BUY or SELL
- Entry classified as one of three types: Bounce from Support (70% hist. win rate), Rejection at Resistance (65%), or Breakout (60%)
- Triggering level always identified — no "entering mid-move" signals
- R:R ratio calculated and enforced at minimum 1:2

### Technical analysis (10 indicators)
| Indicator | Role |
|---|---|
| SuperTrend (10, 3) | Primary trend filter — never trade against it |
| EMA 9 / 21 / 50 | Trend direction, crossovers, bullish/bearish stack |
| VWAP | Intraday price anchor, session-reset at 9:15 AM IST |
| RSI (14) | Overbought / oversold momentum |
| MACD (12/26/9) | Momentum crossovers, histogram direction |
| Stochastic (14/3) | Short-term momentum extremes |
| Bollinger Bands (20, 2) | Volatility, squeeze detection |
| ATR (14) | Volatility measurement, position sizing reference |
| Put-Call Ratio | Options sentiment (bullish > 1.2, bearish < 0.8) |
| Max Pain | Options gravitational price level |

### Key levels engine (Pillar 1)
- Auto-computes yesterday's Open, High, Low, Close as today's S/R levels
- Detects when price is within 0.5% of any level (approaching alert)
- Pre-calculates stop losses (50 pts beyond the level, not at it)
- Pre-calculates targets using 2 methods, picks the more conservative

### OI trend tracking (Pillar 2)
- Stores OI snapshots every 5 minutes throughout the session
- Derives call OI trend (RISING / FALLING / FLAT) from recent vs older snapshots
- Generates plain-English interpretation: "Bearish shift — call buyers exiting, put buyers entering"
- Claude uses the OI trend, not just the live PCR, for confluence checks

### Session protection (Pillar 7)
- **3-loss protocol**: 1 loss → 30-min warning, 2 losses → 1-hour warning + raise confidence threshold, 3 losses → force HOLD on all signals for the day
- **Time-of-day guards**: no signals 9:15–9:30 AM (open noise zone), close-only mode 3:00–3:30 PM
- **Pre-market checklist** printed in terminal every morning at startup

### Real-time dashboard
- Dark terminal aesthetic, live WebSocket connection
- Live BankNifty price with green/red colour flash on every tick
- Active signal banner with entry type badge, 7-box checklist visualiser, entry/target/SL/R:R chips
- Key S/R levels panel — levels pulse when price is approaching
- OI trend panel with timestamped snapshot table
- Session stats panel (win rate, consecutive losses, protocol status, per-item checklist detail)
- Signal history table with per-row 7-box score bars
- Confidence trend chart coloured by signal type

### Logging
- `logs/signals-YYYY-MM-DD.jsonl` — machine-readable, one signal per line
- `logs/journal-YYYY-MM-DD.txt` — human-readable trade journal matching the standard template

---

## File structure

```
banknifty-signal/
├── src/
│   ├── index.js            ← Main orchestrator
│   ├── upstox.js           ← Upstox REST + WebSocket client
│   ├── indicators.js       ← All 10 technical indicator calculations
│   ├── levels.js           ← Key S/R level detection (Pillar 1)
│   ├── session.js          ← OI tracking + 3-loss protocol (Pillar 7)
│   ├── signal.js           ← Claude AI integration + 7-pillar prompt
│   ├── alerts.js           ← Telegram alerts + trade journal logger
│   └── dashboard-server.js ← Express + WebSocket server
├── dashboard.html          ← Live trading dashboard (served at :3000)
├── get-token.js            ← Daily OAuth token generator
├── test-telegram.js        ← Test your Telegram integration
├── logs/                   ← Auto-created, signal history lives here
├── .env.example
├── .env                    ← Your credentials (never commit this)
└── package.json
```

---

## Quick start

### Prerequisites
- Node.js 18 or higher
- Upstox account with developer access
- Anthropic API key
- Telegram bot (optional, for mobile alerts)

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/banknifty-signal.git
cd banknifty-signal
npm install
```

### 2. Configure credentials

```bash
cp .env.example .env
```

Open `.env` and fill in:

```env
UPSTOX_API_KEY=your_api_key
UPSTOX_API_SECRET=your_api_secret
UPSTOX_ACCESS_TOKEN=         # generated fresh each morning
ANTHROPIC_API_KEY=your_key
TELEGRAM_BOT_TOKEN=          # optional
TELEGRAM_CHAT_ID=            # optional
CANDLE_INTERVAL=5minute
SIGNAL_INTERVAL_MS=300000
MIN_CONFIDENCE=65
DASHBOARD_PORT=3000
```

### 3. Get your Upstox access token

Upstox tokens expire every night at midnight. Run this each morning before 9:15 AM:

```bash
node get-token.js
```

This opens the Upstox login page in your browser, catches the OAuth callback on localhost, exchanges the code for an access token, and writes it to `.env` automatically. Takes about 30 seconds.

### 4. Start the bot

```bash
npm start
```

Open `http://localhost:3000` for the live dashboard.

### 5. Test Telegram integration

```bash
node test-telegram.js
```

---

## Getting your Upstox API credentials

1. Go to [developer.upstox.com](https://developer.upstox.com) and log in with your Upstox account
2. Click **My Apps → Create New App**
3. Set the redirect URL to exactly `http://localhost:3000/callback`
4. Copy the **API Key** and **API Secret** into your `.env` file

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `UPSTOX_API_KEY` | required | From Upstox developer portal |
| `UPSTOX_API_SECRET` | required | From Upstox developer portal |
| `UPSTOX_ACCESS_TOKEN` | required (daily) | Generated by `node get-token.js` |
| `ANTHROPIC_API_KEY` | required | From [console.anthropic.com](https://console.anthropic.com) |
| `TELEGRAM_BOT_TOKEN` | optional | From @BotFather on Telegram |
| `TELEGRAM_CHAT_ID` | optional | Your Telegram chat ID |
| `CANDLE_INTERVAL` | `5minute` | `1minute`, `5minute`, `15minute`, `30minute`, `1hour` |
| `SIGNAL_INTERVAL_MS` | `300000` | How often to generate signals (ms). 300000 = 5 min |
| `MIN_CONFIDENCE` | `65` | Minimum confidence % to send a Telegram alert |
| `DASHBOARD_PORT` | `3000` | Port for the web dashboard |

---

## The 7-pillar trading framework

This bot implements a structured intraday framework. Claude AI is given all 7 pillars as hard rules in its system prompt — it cannot output BUY or SELL unless all 7 checklist items pass.

| Pillar | What it enforces |
|---|---|
| 1 · Key levels | Only enter near a pre-identified S/R level — no mid-move FOMO entries |
| 2 · OI confluence | Call OI falling at resistance = likely rejection; never buy into falling call OI |
| 3 · Entry framework | Signal must match one of 3 entry types: Bounce (70%), Rejection (65%), Breakout (60%) |
| 4 · Target science | Mathematical targets using S/R spacing or 1:2 R:R — pick the most conservative |
| 5 · SL placement | SL goes 50 pts beyond the level, not at it — room for noise, no fake-out exits |
| 6 · Time-of-day | No entries 9:15–9:30 AM (noise); close-only mode 3:00–3:30 PM |
| 7 · Session psychology | 3-loss protocol, pre-market checklist, consecutive loss tracking |

---

## Daily routine

```
8:45 AM   node get-token.js     # refresh expired token
9:00 AM   npm start             # start bot + dashboard
9:00 AM   open localhost:3000   # open dashboard in browser
9:15 AM   market opens          # bot waits out the first 15 min (noise zone)
9:30 AM+  signals begin         # Telegram alerts + dashboard updates
3:30 PM   market closes         # bot stops generating signals
          Ctrl+C                # session summary printed to terminal
Evening   review logs/journal-YYYY-MM-DD.txt
```

---

## Common issues

**"Need at least 50 candles"** — Use a wider interval (`15minute`) or increase the `days` parameter in `getCandles()`.

**WebSocket disconnects frequently** — Normal outside market hours. The client auto-reconnects every 5 seconds.

**Token expired / 401 errors** — Upstox tokens expire at midnight IST. Run `node get-token.js` each morning.

**Options chain returns empty** — The Upstox options chain endpoint only works during market hours (9:15–15:30 IST, weekdays).

**No signals arriving** — Check the terminal. If the 7-point checklist score is consistently below 7, market conditions may not match any of the 3 entry types. This is by design — the bot waits for high-probability setups.

---

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ (ES modules) |
| AI engine | Anthropic Claude Sonnet 4 |
| Market data | Upstox API v2 (REST + WebSocket) |
| Indicators | `technicalindicators` npm package |
| Dashboard server | Express.js + `ws` WebSocket |
| Dashboard UI | Vanilla HTML/CSS/JS + Chart.js |
| Alerts | Telegram Bot API (`node-telegram-bot-api`) |
| Auth | Upstox OAuth 2.0 |

---

## Disclaimer

This project is for **educational and research purposes only**. It does not constitute financial advice. Trading BankNifty options involves substantial risk of loss — you can lose your entire invested capital. Past signal accuracy does not guarantee future results.

Always consult a SEBI-registered investment advisor before trading with real money. The authors and contributors of this project are not responsible for any financial losses incurred from using this software.

---

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

---

## License

MIT — see [LICENSE](LICENSE) for details.
