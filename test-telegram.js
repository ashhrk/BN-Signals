import 'dotenv/config';
import { sendTelegramAlert } from './src/alerts.js';

async function test() {
  console.log("Testing Telegram alert...");
  await sendTelegramAlert({
    signal: "BUY",
    price: 48500,
    confidence: 99,
    entryType: "BOUNCE_FROM_SUPPORT",
    triggeringLevel: "Yesterday's Low",
    entry: 48500,
    target: 48800,
    stopLoss: 48400,
    rrRatio: "1:3",
    timeframe: "intraday (30-60 min)",
    checklistScore: 7,
    checklist: {
      levelIdentifiedBefore: true,
      priceWithin05pctOfLevel: true,
      entryTypeIsOneOfThree: true,
      oiConfirmsDirection: true,
      rrAtLeast1to2: true,
      slAndTargetDefined: true,
      notInNoTradeZone: true
    },
    reasoning: "Test alert triggered manually to confirm Telegram integration is working.",
    keyRisks: "None. This is just a test.",
    timestamp: new Date().toISOString()
  });
  console.log("Test alert sent! Check your Telegram app on your mobile.");
}

test();
