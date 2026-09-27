'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const http = require('node:http');
const EvidenceSearchApiServer = require('../src/evidence-search/api/server');
const EvidenceSearchClient = require('../src/evidence-search/api/client');
const {
  createInternalHeaders
} = require('../src/evidence-search/api/internal-auth');
const {
  createJsonProjectionProvider
} = require('../src/evidence-search/providers/json-projection-provider');

const SECRET = 'test-only-internal-secret-not-for-production-0000000000000000';
const EXECUTION_TIME = '2026-07-18T02:00:00.000Z';

const logger = {
  write() {},
  async flush() {}
};

function record(id, authority, role, family, capability) {
  return {
    canonical_record_id: id,
    canonical_url: `https://official.example/${id}`,
    authority_id: authority,
    publisher_id: authority,
    publisher_name: authority,
    source_role: role,
    source_family_id: family,
    capability_id: capability,
    title: `ASTERA free evidence verification by ${authority}`,
    excerpt: `${authority} independently confirms ASTERA free evidence search in record ${id}.`,
    language: 'en',
    updated_at: EXECUTION_TIME,
    version: '1.0.0',
    revision_id: `${id}-r1`,
    retrieval_trace: { current_pointer_verified: true },
    rights: { access: 'public', reuse: 'allowed' },
    fields: { claim: 'ASTERA free evidence search is implemented' },
    lineage_fingerprint: {
      authority_id: authority,
      publisher_id: authority,
      origin_record_id: id,
      publication_event_id: `${id}-publication`
    }
  };
}

function providers() {
  return [
    createJsonProjectionProvider({
      provider_id: 'projection-api',
      source_class: 'FREE_PROJECTION',
      source_family_id: 'projection-family',
      capabilities: ['NO_REINFORCEMENT'],
      domains: ['G29'],
      records: [record(
        'projection-record',
        'projection-authority',
        'PRIMARY',
        'projection-family',
        'projection_search'
      )]
    }),
    createJsonProjectionProvider({
      provider_id: 'official-api',
      source_class: 'FREE_OFFICIAL_LIVE',
      source_family_id: 'official-family',
      capabilities: ['NO_REINFORCEMENT'],
      domains: ['G29'],
      records: [record(
        'official-record',
        'official-authority',
        'OFFICIAL',
        'official-family',
        'current_official'
      )]
    }),
    createJsonProjectionProvider({
      provider_id: 'reinforcement-api',
      source_class: 'FREE_OFFICIAL_LIVE',
      source_family_id: 'reinforcement-family',
      capabilities: ['REINFORCEMENT_ONLY'],
      domains: ['G29'],
      records: [record(
        'reinforcement-record',
        'reinforcement-authority',
        'OFFICIAL',
        'reinforcement-family',
        'independent_origin'
      )]
    })
  ];
}

function payload() {
  return {
    as_of: EXECUTION_TIME,
    question: 'ASTERA free evidence search verified record',
    domain_lens: { id: 'G29', taxonomy_version: '1.0.0' },
    conditions: [{
      condition_id: 'core-claim',
      class: 'CORE',
      field: 'fields.claim',
      operator: 'EQ',
      expected_value: 'ASTERA free evidence search is implemented',
      required: true
    }],
    search: { free_projection: true, free_current: true },
    paid_search: { enabled: false },
    deadline_ms: 8000
  };
}

async function startServer(options = {}) {
  const server = new EvidenceSearchApiServer({
    port: 0,
    host: '127.0.0.1',
    logger,
    internalSecret: SECRET,
    moduleOptions: { providers: providers() },
    ...options
  });
  server.start();
  await once(server.server, 'listening');
  const address = server.server.address();
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

test('aborts the module context signal when the signed HTTP caller disconnects', async () => {
  let capturedSignal;
  let releaseModule;
  let markModuleStarted;
  const moduleStarted = new Promise((resolve) => {
    markModuleStarted = resolve;
  });
  const moduleRelease = new Promise((resolve) => {
    releaseModule = resolve;
  });
  const module = {
    async execute(moduleRequest) {
      assert.equal(moduleRequest.operation, 'SEARCH_EVIDENCE');
      capturedSignal = moduleRequest.context.signal;
      markModuleStarted();
      await moduleRelease;
      return {
        status: 'OK',
        operation: 'SEARCH_EVIDENCE',
        result: {
          status: 'FINAL_VALID',
          evidence: [],
          quality: {
            initial: { score_bp: 10_000 },
            final: { score_bp: 10_000 },
            reinforcement_attempt_count: 0
          },
          duration_ms: 0
        }
      };
    }
  };
  const runtime = await startServer({ module });
  let clientRequest;
  let clientSocket;

  try {
    const body = JSON.stringify(payload());
    const headers = createInternalHeaders({
      body,
      secret: SECRET,
      service: 'astera-main',
      callerId: 'caller-cancel-test',
      requestId: 'request-cancel-test'
    });
    const serverSocketClosed = new Promise((resolve) => {
      runtime.server.server.once('connection', (socket) => socket.once('close', resolve));
    });

    clientRequest = http.request(`${runtime.baseUrl}/internal/v1/evidence/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...headers
      }
    });
    clientRequest.on('error', () => {});
    clientRequest.on('response', (response) => response.resume());
    clientRequest.once('socket', (socket) => {
      clientSocket = socket;
    });
    clientRequest.end(body);

    await moduleStarted;
    clientRequest.destroy();
    clientSocket?.destroy();
    await serverSocketClosed;
    await new Promise((resolve) => setImmediate(resolve));

    assert.ok(
      capturedSignal,
      'module context must include an AbortSignal for caller disconnects'
    );
    assert.equal(
      capturedSignal.aborted,
      true,
      'module context signal must abort after the HTTP caller disconnects'
    );
  } finally {
    clientRequest?.destroy();
    clientSocket?.destroy();
    releaseModule();
    await new Promise((resolve) => setImmediate(resolve));
    await runtime.server.stop();
  }
});

test('routes caller cancellation to jobManager.fail instead of completing a rejection', async () => {
  let completeCalls = 0;
  let failedError;
  let markModuleStarted;
  let markJobFailed;
  const moduleStarted = new Promise((resolve) => {
    markModuleStarted = resolve;
  });
  const jobFailed = new Promise((resolve) => {
    markJobFailed = resolve;
  });
  const jobManager = {
    begin() {
      return {
        job: { job_id: 'cancel-job', state: 'RECEIVED' },
        reusedTerminal: false
      };
    },
    checkpoint(job) {
      return { ...job, state: 'AUTHENTICATED' };
    },
    lifecycle() {
      return async () => {};
    },
    complete() {
      completeCalls += 1;
      throw new Error('jobManager.complete must not run after caller cancellation');
    },
    fail(job, error) {
      failedError = error;
      const failed = { ...job, state: 'ERROR', error_code: error.code };
      markJobFailed(failed);
      return failed;
    }
  };
  const module = {
    async execute(moduleRequest) {
      const { signal } = moduleRequest.context;
      markModuleStarted();
      await new Promise((resolve, reject) => {
        const rejectCancelled = () => {
          const error = new Error('evidence search cancelled by caller');
          error.code = 'SEARCH_CANCELLED';
          error.status = 499;
          reject(error);
        };
        if (signal.aborted) return rejectCancelled();
        signal.addEventListener('abort', rejectCancelled, { once: true });
      });
      throw new Error('unreachable after cancellation');
    }
  };
  const runtime = await startServer({
    module,
    jobManager,
    closeJobManagerOnStop: false
  });
  let clientRequest;
  let clientSocket;

  try {
    const body = JSON.stringify(payload());
    const headers = createInternalHeaders({
      body,
      secret: SECRET,
      service: 'astera-main',
      callerId: 'caller-job-cancel-test',
      requestId: 'request-job-cancel-test'
    });
    const serverSocketClosed = new Promise((resolve) => {
      runtime.server.server.once('connection', (socket) => socket.once('close', resolve));
    });
    clientRequest = http.request(`${runtime.baseUrl}/internal/v1/evidence/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...headers
      }
    });
    clientRequest.on('error', () => {});
    clientRequest.once('socket', (socket) => {
      clientSocket = socket;
    });
    clientRequest.end(body);

    await moduleStarted;
    clientRequest.destroy();
    clientSocket?.destroy();

    const failedJob = await jobFailed;
    await serverSocketClosed;
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(failedJob.state, 'ERROR');
    assert.equal(failedJob.error_code, 'SEARCH_CANCELLED');
    assert.equal(failedError.code, 'SEARCH_CANCELLED');
    assert.equal(failedError.status, 499);
    assert.equal(completeCalls, 0);
  } finally {
    clientRequest?.destroy();
    clientSocket?.destroy();
    await runtime.server.stop();
  }
});

test('does not abort the module context after a normal 200 response closes', async () => {
  let capturedSignal;
  const module = {
    async execute(moduleRequest) {
      capturedSignal = moduleRequest.context.signal;
      return {
        status: 'OK',
        operation: 'SEARCH_EVIDENCE',
        result: {
          status: 'FINAL_VALID',
          evidence: [],
          quality: {
            initial: { score_bp: 10_000 },
            final: { score_bp: 10_000 },
            reinforcement_attempt_count: 0
          },
          duration_ms: 0
        }
      };
    }
  };
  const runtime = await startServer({ module });
  let clientRequest;
  let clientSocketClosed;

  try {
    const body = JSON.stringify(payload());
    const headers = createInternalHeaders({
      body,
      secret: SECRET,
      service: 'astera-main',
      callerId: 'caller-normal-close-test',
      requestId: 'request-normal-close-test'
    });
    const response = await new Promise((resolve, reject) => {
      clientRequest = http.request(`${runtime.baseUrl}/internal/v1/evidence/search`, {
        method: 'POST',
        agent: false,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Connection: 'close',
          ...headers
        }
      }, (incoming) => {
        incoming.resume();
        incoming.once('end', () => resolve(incoming));
      });
      clientRequest.once('socket', (socket) => {
        clientSocketClosed = once(socket, 'close');
      });
      clientRequest.once('error', reject);
      clientRequest.end(body);
    });

    assert.equal(response.statusCode, 200);
    await clientSocketClosed;
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(capturedSignal, 'module context must include an AbortSignal');
    assert.equal(
      capturedSignal.aborted,
      false,
      'normal response completion must not be treated as caller cancellation'
    );
  } finally {
    clientRequest?.destroy();
    await runtime.server.stop();
  }
});

test('signed client reaches the isolated free evidence search API', async () => {
  const runtime = await startServer();
  try {
    const client = new EvidenceSearchClient({
      baseUrl: runtime.baseUrl,
      internalSecret: SECRET,
      timeoutMs: 8000
    });
    const result = await client.search(payload(), {
      callerId: 'caller-api-test',
      requestId: 'request-api-test'
    });

    assert.equal(result.status, 'FINAL_VALID');
    assert.equal(result.caller_id, 'caller-api-test');
    assert.equal(result.request_id, 'request-api-test');
    assert.equal(result.evidence.length, 3);
    assert.equal(result.quality.reinforcement_attempt_count, 1);
    assert.equal(result.quality.new_corroboration_count, 1);
    assert.equal(result.ai_used, false);
    assert.equal(result.payment_executed, false);
    assert.deepEqual(result.paid_usage_reports, []);
  } finally {
    await runtime.server.stop();
  }
});

test('internal request replay is rejected after the first accepted request', async () => {
  const runtime = await startServer();
  try {
    const body = JSON.stringify(payload());
    const headers = createInternalHeaders({
      body,
      secret: SECRET,
      service: 'astera-main',
      callerId: 'caller-replay-test',
      requestId: 'request-replay-test',
      nonce: 'fixed-replay-nonce',
      now: Date.now(),
      ttlMs: 60_000
    });
    const first = await fetch(`${runtime.baseUrl}/internal/v1/evidence/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body
    });
    assert.equal(first.status, 200);

    const second = await fetch(`${runtime.baseUrl}/internal/v1/evidence/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body
    });
    assert.equal(second.status, 403);
    const rejected = await second.json();
    assert.equal(rejected.code, 'INTERNAL_REPLAY_DETECTED');
  } finally {
    await runtime.server.stop();
  }
});

test('tampered body is rejected before the search module runs', async () => {
  const runtime = await startServer();
  try {
    const signedBody = JSON.stringify(payload());
    const headers = createInternalHeaders({
      body: signedBody,
      secret: SECRET,
      service: 'astera-main',
      callerId: 'caller-tamper-test',
      requestId: 'request-tamper-test'
    });
    const tamperedBody = JSON.stringify({ ...payload(), question: 'tampered' });
    const response = await fetch(`${runtime.baseUrl}/internal/v1/evidence/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: tamperedBody
    });
    assert.equal(response.status, 403);
    const rejected = await response.json();
    assert.equal(rejected.code, 'INTERNAL_BODY_HASH_MISMATCH');
  } finally {
    await runtime.server.stop();
  }
});
