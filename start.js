'use strict';

const KaguraServer = require('./src/server');
const SQLiteStore = require('./src/store/sqlite-store');
const StripeClient = require('./src/billing/stripe-client');
const SubscriptionSync = require('./src/billing/subscription-sync');

const store = new SQLiteStore(process.env.ASTERA_DB || process.env.KAGURA_DB || 'astera.db');
const stripe = new StripeClient({
  secretKey: process.env.STRIPE_SECRET_KEY || '',
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || ''
});
const subSync = new SubscriptionSync(store, stripe);

const server = new KaguraServer({
  port: Number(process.env.ASTERA_PORT || process.env.KAGURA_PORT || 7373),
  host: process.env.ASTERA_HOST || process.env.KAGURA_HOST || '127.0.0.1',
  poolSize: Number(process.env.ASTERA_POOL || process.env.KAGURA_POOL || 4),
  store,
  stripe,
  subSync
});

server.start();

console.log(`
╔════════════════════════════════════════════════════════╗
║  Astera v8 — Multi-Perspective Cognition Runtime      ║
║  問いを星図に変える。                                 ║
║  powered by V8 Worker threads                         ║
╠════════════════════════════════════════════════════════╣
║  5視点: 真実 / 危機 / 多角 / 反対 / 比較              ║
║  LLM: provider-independent / BYOK                     ║
║  Store: ${store.mode.padEnd(40, ' ')}║
╚════════════════════════════════════════════════════════╝
`);

process.on('SIGINT', async () => {
  await server.stop();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await server.stop();
  process.exit(0);
});
