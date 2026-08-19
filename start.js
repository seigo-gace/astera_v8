'use strict';

const AsteraServer = require('./src/server-with-module-switch');
const SQLiteStore = require('./src/store/sqlite-store');
const Logger = require('./src/logger');

const store = new SQLiteStore(process.env.ASTERA_DB || process.env.KAGURA_DB || 'astera.db');
const logger = new Logger();
const legacyCommerceEnabled = process.env.ASTERA_ENABLE_LEGACY_COMMERCE === '1';
const commerce = {};

if (legacyCommerceEnabled) {
  const StripeClient = require('./src/billing/stripe-client');
  const SubscriptionSync = require('./src/billing/subscription-sync');
  const stripe = new StripeClient({
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || ''
  });
  commerce.stripe = stripe;
  commerce.subSync = new SubscriptionSync(store, stripe);
}

const server = new AsteraServer({
  port: Number(process.env.ASTERA_PORT || process.env.KAGURA_PORT || 7373),
  host: process.env.ASTERA_HOST || process.env.KAGURA_HOST || '127.0.0.1',
  poolSize: Number(process.env.ASTERA_POOL || process.env.KAGURA_POOL || 4),
  store,
  logger,
  ...commerce
});

server.start();

logger.write({
  type: 'runtime_initialized',
  text: 'Astera v8 — Multi-Perspective Cognition Runtime initialized',
  payload: {
    store: store.mode,
    sqlite_error: store.sqliteError || null,
    tgserver_logging: logger.tgsEnabled,
    tgserver_project: logger.projectId,
    evidence_search_proxy: Boolean(server.evidenceClient),
    legacy_commerce_routes: legacyCommerceEnabled
  }
});

let stopping = false;
async function shutdown(signal, exitCode = 0) {
  if (stopping) return;
  stopping = true;
  logger.write({ type: 'shutdown_requested', text: `Shutdown requested by ${signal}`, payload: { signal } });
  try {
    await server.stop();
  } catch (error) {
    logger.write({ type: 'shutdown_failed', severity: 'error', text: 'Graceful shutdown failed', payload: { error } });
    await logger.flush(5000);
    exitCode = 1;
  }
  process.exit(exitCode);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('uncaughtException', (error) => {
  logger.write({ type: 'uncaught_exception', severity: 'error', text: 'Uncaught exception', payload: { error } });
  void shutdown('uncaughtException', 1);
});
process.on('unhandledRejection', (reason) => {
  logger.write({ type: 'unhandled_rejection', severity: 'error', text: 'Unhandled promise rejection', payload: { reason } });
  void shutdown('unhandledRejection', 1);
});
process.on('warning', (warning) => {
  logger.write({ type: 'runtime_warning', severity: 'warn', text: warning.message, payload: { warning } });
});
