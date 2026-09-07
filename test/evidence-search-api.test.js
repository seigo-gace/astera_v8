'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
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

async function startServer() {
  const server = new EvidenceSearchApiServer({
    port: 0,
    host: '127.0.0.1',
    logger,
    internalSecret: SECRET,
    moduleOptions: { providers: providers() }
  });
  server.start();
  await once(server.server, 'listening');
  const address = server.server.address();
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

test('signed client reaches the isolated free evidence search API', async () => {
  const runtime = await startServer();
  try {
    const client = new EvidenceSearchClient({
      baseUrl: runtime.baseUrl,
      internalSecret: SECRET,
      timeoutMs: 8000
    });
    const result = await client.search(payload(), {
      tenantId: 'tenant-api-test',
      requestId: 'request-api-test'
    });

    assert.equal(result.status, 'FINAL_VALID');
    assert.equal(result.tenant_id, 'tenant-api-test');
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
      tenantId: 'tenant-replay-test',
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
      tenantId: 'tenant-tamper-test',
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
