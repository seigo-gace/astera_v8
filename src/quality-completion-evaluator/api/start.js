#!/usr/bin/env node
'use strict';

const { assertContainerRuntime } = require('../../runtime/container-boundary');
assertContainerRuntime();

const EvaluatorApiServer = require('./server-with-internal');
const SQLiteStore = require('../../store/sqlite-store');

const store = new SQLiteStore(
  process.env.ASTERA_DB || 'astera.db'
);
const api = new EvaluatorApiServer({ store });
api.start();

async function shutdown() {
  await api.stop();
  process.exit(0);
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
