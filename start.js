'use strict';

const fs = require('node:fs');

function assertDockerProductionResidency(serviceName, allowEnvVar) {
  if (process.env[allowEnvVar] === '1') return;
  const inDocker =
    fs.existsSync('/.dockerenv') ||
    process.env.DOCKER_CONTAINER === 'true' ||
    String(process.env.container || '').toLowerCase() === 'docker';
  if (!inDocker) {
    console.error(`[${serviceName}] 本番常駐は Docker Compose 経由のみ許可されています (docker compose up -d --build)。`);
    console.error(`[${serviceName}] 開発・検証のみホスト起動する場合は ${allowEnvVar}=1 を設定してください。`);
    process.exit(1);
  }
}

assertDockerProductionResidency('Astera v8', 'ASTERA_ALLOW_HOST_START');

const AsteraServer = require('./src/server');
const AsteraEngine = require('./src/astera-engine');
const { createEvidenceSearchClient } = require('./src/evidence-search/api/runtime-client');
const Logger = require('./src/logger');

const logger = new Logger();
const evidenceSearchClient = createEvidenceSearchClient({ logger });
const engine = new AsteraEngine({
  poolSize: Number(process.env.ASTERA_POOL || process.env.KAGURA_POOL || 4),
  logger,
  evidenceSearchClient
});

const server = new AsteraServer({
  port: Number(process.env.ASTERA_PORT || process.env.KAGURA_PORT || 7373),
  host: process.env.ASTERA_HOST || process.env.KAGURA_HOST || '127.0.0.1',
  poolSize: Number(process.env.ASTERA_POOL || process.env.KAGURA_POOL || 4),
  logger,
  engine
});

server.start();

logger.write({
  type: 'runtime_initialized',
  text: 'Astera v8 — Multi-Perspective Cognition Runtime initialized',
  payload: {
    tgserver_logging: logger.tgsEnabled,
    tgserver_project: logger.projectId,
    evidence_search_client: Boolean(evidenceSearchClient)
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
