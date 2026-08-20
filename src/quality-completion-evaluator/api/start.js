#!/usr/bin/env node
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

assertDockerProductionResidency('Astera Evaluator API', 'ASTERA_ALLOW_HOST_START');

const EvaluatorApiServer = require('./server');
const SQLiteStore = require('../../store/sqlite-store');

const store = new SQLiteStore(process.env.ASTERA_DB || process.env.KAGURA_DB || 'astera.db');
const api = new EvaluatorApiServer({ store });
api.start();

async function shutdown() {
  await api.stop();
  process.exit(0);
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
