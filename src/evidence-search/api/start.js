'use strict';

const EvidenceSearchApiServer = require('./server');
const { loadEvidenceProviders } = require('../providers/config-loader');
const { EvidenceJobStore } = require('../recovery/job-store');
const { DurableEvidenceSpool } = require('../recovery/durable-spool');
const { EvidenceJobManager } = require('../recovery/job-manager');
const { evaluateInformationQuality } = require('../../quality-completion-evaluator');
const { WorkerBridge, NodeWorkerPoolAdapter } = require('../../runtime/worker-bridge');

const workerBridge = new WorkerBridge({
  defaultTimeoutMs: Number(process.env.ASTERA_EVIDENCE_WORKER_TIMEOUT_MS || 60_000),
  adapters: {
    'node-worker': new NodeWorkerPoolAdapter({
      maximumWorkers: Number(process.env.ASTERA_EVIDENCE_WORKER_CONCURRENCY || 2),
      maximumQueueSize: Number(process.env.ASTERA_EVIDENCE_WORKER_MAXIMUM_QUEUE || 256),
      tasks: {
        'projection-score': {
          modulePath: require.resolve('../providers/json-projection-provider'),
          exportName: 'scoreProjectionCandidatesWorker'
        },
        'spool-encode': {
          modulePath: require.resolve('../recovery/durable-spool'),
          exportName: 'encodeCheckpointWorker'
        },
        'spool-decode': {
          modulePath: require.resolve('../recovery/durable-spool'),
          exportName: 'decodeCheckpointWorker'
        }
      }
    })
  }
});

const providers = loadEvidenceProviders();
const informationQualityEvaluator = Object.freeze({
  async evaluate(request) {
    return evaluateInformationQuality(request);
  }
});
const jobStore = new EvidenceJobStore();
const durableSpool = new DurableEvidenceSpool({ workerBridge });
const jobManager = new EvidenceJobManager({ store: jobStore, spool: durableSpool });
const server = new EvidenceSearchApiServer({
  jobManager,
  moduleOptions: {
    providers,
    workerBridge,
    globalConcurrency: Number(process.env.ASTERA_SEARCH_GLOBAL_CONCURRENCY || 8),
    perProviderConcurrency: Number(process.env.ASTERA_SEARCH_PER_ADAPTER_CONCURRENCY || 2),
    informationQualityEvaluator,
    informationQualityEvaluatorMode: 'IN_PROCESS_QCE_INFORMATION_QUALITY'
  }
});

server.start();

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await server.stop();
  } finally {
    await workerBridge.close();
    process.stderr.write(`Astera evidence search API stopped: ${signal}\n`);
  }
}

process.once('SIGINT', () => { void shutdown('SIGINT'); });
process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
