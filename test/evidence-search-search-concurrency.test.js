'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createFreeOfficialLiveProvider } = require('../src/evidence-search/providers/free-official-live-provider');
const { createPassTargetFallbackProvider } = require('../src/evidence-search/providers/pass-target-fallback-provider');
const { createGeneralWebSearchProvider } = require('../src/evidence-search/providers/general-web-search-provider');
const { KbTargetRegistry } = require('../src/evidence-search/core/kb-target-registry');

function concurrencyGate(required = 2) {
  let active = 0;
  let maxActive = 0;
  let started = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  return {
    async enter() {
      active += 1;
      started += 1;
      maxActive = Math.max(maxActive, active);
      if (started >= required) release();
      await gate;
      active -= 1;
    },
    maxActive: () => maxActive
  };
}

function target(targetId, host, kb = targetId) {
  return Object.freeze({
    target_id: targetId,
    kb,
    official_url: `https://${host}/docs`,
    host,
    genres: Object.freeze(['G29']),
    recorded_accesses: Object.freeze(['FREE_NO_AUTH']),
    recorded_statuses: Object.freeze(['PASS']),
    target_state: 'PUBLIC_NO_AUTH',
    automatic_search_eligible: true
  });
}

test('free official HTTP provider executes independent queries concurrently and preserves query order', async () => {
  const gate = concurrencyGate(2);
  const provider = createFreeOfficialLiveProvider({
    provider_id: 'parallel-official-test',
    source_family_id: 'parallel-official-test',
    allowed_hosts: ['api.example.com'],
    query_concurrency: 4,
    endpoints: [{
      endpoint_id: 'parallel-search',
      url_template: 'https://api.example.com/search?q={query}',
      response_format: 'JSON',
      records_path: 'results',
      field_map: { canonical_record_id: 'id', canonical_url: 'url', title: 'title', excerpt: 'summary' }
    }],
    transport: async (url) => {
      await gate.enter();
      return {
        url,
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(JSON.stringify({ results: [{ id: url, url, title: 'result', summary: 'parallel official result' }] }))
      };
    }
  });

  const result = await provider.search({
    domain_lens: { id: 'G29' },
    query_set: [
      { query_id: 'q1', text: 'alpha' },
      { query_id: 'q2', text: 'beta' }
    ]
  }, { deadline_at: Date.now() + 5000 });

  assert.ok(gate.maxActive() >= 2);
  assert.equal(result.usage.requests, 2);
  assert.deepEqual(result.query_results.map((item) => item.query_id), ['q1', 'q2']);
  assert.ok(result.query_results.every((item) => item.retrieval_status === 'FOUND'));
});

test('663-KB fallback executes query-target jobs concurrently', async () => {
  const targets = [target('target-one', 'one.example'), target('target-two', 'two.example')];
  const registry = new KbTargetRegistry(targets, { source_record_count: 2, base_target_count: 2, runtime_target_count: 0 });
  const gate = concurrencyGate(2);
  const provider = createPassTargetFallbackProvider({
    registry,
    target_ids: targets.map((item) => item.target_id),
    limit: 2,
    search_concurrency: 4,
    transport: async (url) => {
      await gate.enter();
      return {
        url,
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(JSON.stringify({ alpha: 'alpha evidence', beta: 'beta evidence' }))
      };
    }
  });

  const result = await provider.search({
    domain_lens: { id: 'G29' },
    query_set: [{ query_id: 'q1', text: 'alpha' }]
  }, { remaining_ms: () => 5000 });

  assert.ok(gate.maxActive() >= 2);
  assert.equal(result.usage.requests, 2);
  assert.equal(result.query_results[0].retrieval_status, 'FOUND');
  assert.equal(result.query_results[0].completed_endpoint_count, 2);
});

test('663-KB fallback reuses one target seed page across concurrent query roles', async () => {
  const onlyTarget = target('target-cache', 'cache.example');
  const registry = new KbTargetRegistry([onlyTarget], { source_record_count: 1, base_target_count: 1, runtime_target_count: 0 });
  let requests = 0;
  const provider = createPassTargetFallbackProvider({
    registry,
    target_ids: [onlyTarget.target_id],
    limit: 1,
    search_concurrency: 4,
    transport: async (url) => {
      requests += 1;
      return {
        url,
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(JSON.stringify({ alpha: 'alpha evidence', beta: 'beta evidence' }))
      };
    }
  });

  const result = await provider.search({
    domain_lens: { id: 'G29' },
    query_set: [
      { query_id: 'q1', text: 'alpha' },
      { query_id: 'q2', text: 'beta' }
    ]
  }, { remaining_ms: () => 5000 });

  assert.equal(requests, 1);
  assert.equal(result.usage.requests, 1);
  assert.equal(result.usage.seed_cache_entries, 1);
  assert.deepEqual(result.query_results.map((item) => item.retrieval_status), ['FOUND', 'FOUND']);
});

test('general web runs query discovery concurrently and reuses identical destination fetches', async () => {
  const gate = concurrencyGate(2);
  let pageRequests = 0;
  const destination = 'https://source.example/reference';
  const searchHtml = `<a class="result__a" href="${destination}">Source Reference</a>`;
  const provider = createGeneralWebSearchProvider({
    query_concurrency: 4,
    resultLimit: 1,
    searchGet: async () => {
      await gate.enter();
      return { status: 200, headers: { 'content-type': 'text/html' }, body: Buffer.from(searchHtml) };
    },
    pageGet: async (url) => {
      pageRequests += 1;
      return {
        url,
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        body: Buffer.from('<html><head><title>Actual source</title></head><body>This is a sufficiently long actual source page used to prove parallel general web discovery while the destination response is reused safely across multiple query roles.</body></html>')
      };
    }
  });

  const result = await provider.search({
    domain_lens: { id: 'G29' },
    query_set: [
      { query_id: 'q1', text: 'alpha source' },
      { query_id: 'q2', text: 'beta source' }
    ]
  }, {});

  assert.ok(gate.maxActive() >= 2);
  assert.equal(pageRequests, 1);
  assert.equal(result.usage.page_cache_entries, 1);
  assert.deepEqual(result.query_results.map((item) => item.query_id), ['q1', 'q2']);
  assert.deepEqual(result.query_results.map((item) => item.retrieval_status), ['FOUND', 'FOUND']);
  assert.ok(result.candidates.every((item) => item.retrieval_trace.search_result_used_as_evidence === false));
});
