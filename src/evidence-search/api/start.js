'use strict';

const { assertContainerRuntime } = require('../../runtime/container-boundary');
assertContainerRuntime();

const Logger = require('../../logger');
const EvidenceSearchApiServer = require('./server');
const InformationQualityClient = require('./information-quality-client');
const { loadEvidenceProviders } = require('../providers/config-loader');
const { EvidenceJobStore } = require('../recovery/job-store');
const { DurableEvidenceSpool } = require('../recovery/durable-spool');
const { EvidenceJobManager } = require('../recovery/job-manager');

function startupFailure(message, code) {
  const error = new Error(message);
  error.code = code;
  error.status = 503;
  return error;
}

function assertUsableProviderConfiguration(providers) {
  const configFile = String(process.env.ASTERA_EVIDENCE_PROVIDER_CONFIG || '').trim();
  if (!configFile) {
    throw startupFailure(
      'ASTERA_EVIDENCE_PROVIDER_CONFIG is required for the Evidence Search runtime',
      'EVIDENCE_PROVIDER_CONFIG_REQUIRED'
    );
  }
  if (!Array.isArray(providers)) {
    throw startupFailure(
      'Evidence Search provider configuration did not produce a provider list',
      'EVIDENCE_PROVIDER_CONFIG_INVALID'
    );
  }
  const activeProviderCount = providers.filter((provider) => provider?.certified === true).length;
  if (activeProviderCount === 0) {
    throw startupFailure(
      'Evidence Search requires at least one enabled, certified provider before runtime startup',
      'EVIDENCE_SEARCH_NO_ACTIVE_PROVIDER'
    );
  }
  return activeProviderCount;
}

const logger = new Logger();
const providers = loadEvidenceProviders();
const activeProviderCount = assertUsableProviderConfiguration(providers);
const informationQualityClient = new InformationQualityClient();
const jobStore = new EvidenceJobStore();
const durableSpool = new DurableEvidenceSpool();
const jobManager = new EvidenceJobManager({
  store: jobStore,
  spool: durableSpool
});
const server = new EvidenceSearchApiServer({
  logger,
  jobManager,
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
    active_provider_count: activeProviderCount,
    active_search_mode: 'FREE_ONLY',
    evaluator_mode: 'EVALUATOR_API_7374',
    durable_recovery: true,
    evidence_db: jobStore.filePath,
    durable_spool: durableSpool.root
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
