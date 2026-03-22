import { startDashboardServer } from './src/dashboard-server.js';

console.log('=================================================');
console.log('📱 MOBILE APP TESTER 📱');
console.log('=================================================');
console.log('1. Starting temporary testing server on Port 3000...');

const dashboard = startDashboardServer(3000);

console.log('2. OPEN YOUR EXPO GO APP AND CONNECT IT NOW!');
console.log('   (Waiting 8 seconds for you to connect...)');

setTimeout(() => {
  console.log('\n3. Pushing live BankNifty price to your phone...');
  dashboard.broadcast({ type: 'price', price: 48550.25 });
}, 8000);

setInterval(() => {
  console.log('4. Pushing a perfect 7/7 BUY Signal to your phone...');
  dashboard.broadcast({
    type: 'signal',
    signal: {
      signal: 'BUY',
      checklistScore: 7,
      triggeringLevel: 'Yesterday High Breakout @ 48500',
      reasoning: 'Massive squeeze breakout on 5-min chart. Call OI writers trapped and covering heavily. Price action confirmed above volume node.',
      entry: 48550,
      target: 48800,
      stopLoss: 48500,
      timestamp: new Date().toISOString(),
      optionSuggestion: {
        contractName: 'BANKNIFTY 53400 CE 31MAR26',
        type: 'CE',
        strikePrice: 53400,
        expiry: '31MAR26',
        estimatedPremium: '₹150-180',
        rationale: 'ATM Call for explosive directional momentum towards next resistance.'
      }
    }
  });
  console.log('✅ SIGNAL BLASTED! Check your phone.');
}, 5000);
