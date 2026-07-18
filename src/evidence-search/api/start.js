'use strict';

const Logger = require('../../logger');
const EvidenceSearchApiServer = require('./server');
const InformationQualityClient = require('./information-quality-client');
const { loadEvidenceProviders } = require('../providers/config-loader');

const logger = new Logger();
const providers = loadEvidenceProviders();
const informationQualityClient = new InformationQualityClient();
const server = new EvidenceSearchApiServer({
  logger,
  moduleOptions: {
    providers,
    globalConcurrency: Number(
      process.env.ASTERA_SEARCH_GLOBAL_CONCURRENCY || 8
    ),
    perProviderConcurrency: Number(
      process.env.ASTERA_SEARCH_PER_ADAPTER_CONCURRENCY || 2
    ),
    informationQualityEvaluator: informationQualityClient,
    informationQualityEvaluatorMode: 'EVALUATOR_API_7374'
  }
});

server.start();

logger.write({
  type: 'evidence_search_runtime_initialized',
  text: 'Astera evidence search runtime initialized',
  payload: {
    provider_count: providers.length,
    active_search_mode: 'FREE_ONLY',
    evaluator_mode: 'EVALUATOR_API_7374'
  }
});

let stopping = false;
async function shutdown(signal, exitCode = 0) {
  if (stopping) return;
  stopping = true;
  logger.write({
    type: 'evidence_search_shutdown_requested',
    text: `Shutdown requested by ${signal}`,
    payload: { signal }
  });
  try {
    await server.stop();
  } catch (error) {
    logger.write({
      type: 'evidence_search_shutdown_failed',
      severity: 'error',
      text: 'Evidence search graceful shutdown failed',
      payload: { error }
    });
    await logger.flush?.(5000);
    exitCode = 1;
  }
  process.exit(exitCode);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('uncaughtException', (error) => {
  logger.write({
    type: 'evidence_search_uncaught_exception',
    severity: 'error',
    text: 'Uncaught exception',
    payload: { error }
  });
  void shutdown('uncaughtException', 1);
});
process.on('unhandledRejection', (reason) => {
  logger.write({
    type: 'evidence_search_unhandled_rejection',
    severity: 'error',
    text: 'Unhandled promise rejection',
    payload: { reason }
  });
  void shutdown('unhandledRejection', 1);
});
