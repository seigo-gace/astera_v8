'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const AsteraServer = require('../src/server');
const AsteraEngine = require('../src/astera-engine');
const { defaultMockJapaneseParserClient } = require('./helpers/default-mock-japanese-parser');

const silentLogger = { write() {}, async flush() {} };

function request({ port, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      method: 'POST',
      path: '/process',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

test('real HTTP POST reaches canonical Task flow and returns Main8 material without inventing evidence or a decision', async () => {
  const oldLocalNoAuth = process.env.ASTERA_LOCAL_NO_AUTH;
  process.env.ASTERA_LOCAL_NO_AUTH = '1';

  const evidenceCalls = [];
  const evidenceSearchClient = {
    async search(payload, context) {
      evidenceCalls.push({ payload, context });
      return {
        schema_version: 'astera.evidence-search.result.v1',
        request_id: context.requestId,
        caller_id: context.callerId,
        status: 'REJECTED_SEARCH_NOT_EXECUTED',
        search_state: 'NOT_EXECUTED',
        result_hash: null,
        evidence: [],
        coverage: { discovery_scope_state: 'NOT_EXECUTED' },
        quality: {
          final: {
            status: 'REJECTED_SEARCH_NOT_EXECUTED',
            phase: 'FINAL',
            score_bp: 0,
            blocking_reasons: ['SEARCH_NOT_EXECUTED']
          },
          reinforcement_attempt_count: 0,
          new_corroboration_count: 0
        },
        query_execution: {
          initial: (payload.preplanned_queries || []).map((query) => ({
            query_id: query.query_id,
            claim_id: query.claim_id,
            role: query.role,
            status: 'NOT_EXECUTED',
            provider_records: []
          })),
          reinforcement: []
        },
        provider_execution: { initial: [], reinforcement: [] },
        ai_used: false,
        payment_executed: false
      };
    }
  };

  const engine = new AsteraEngine({
    poolSize: 1,
    logger: silentLogger,
    evidenceSearchClient,
    japaneseParserClient: defaultMockJapaneseParserClient()
  });
  const server = new AsteraServer({ port: 0, host: '127.0.0.1', poolSize: 1, logger: silentLogger, engine });

  try {
    server.start();
    await once(server.server, 'listening');
    const port = server.server.address().port;

    const response = await request({
      port,
      body: {
        question: 'Verify that Node.js 22 is supported in production using official evidence.',
        language: 'en',
        llm: { chain: ['null'] }
      }
    });

    // 1) CONNECTED: an actual HTTP POST crosses AsteraServer into the canonical pipeline.
    assert.equal(response.status, 200);
    assert.match(response.headers['content-type'], /text\/plain/);
    assert.equal(evidenceCalls.length, 1);
    assert.equal(evidenceCalls[0].payload.search.free_projection, true);
    assert.equal(evidenceCalls[0].payload.search.free_current, true);
    assert.equal(evidenceCalls[0].payload.paid_search.enabled, false);

    // 2) RESULT: the HTTP response is the canonical fixed Main8 material, not an internal JSON dump or domain-template spill.
    assert.match(response.body, /01 True Objective/);
    assert.match(response.body, /03 Fact Check/);
    assert.match(response.body, /07 Evidence Status/);
    assert.match(response.body, /08 Re-instruction to Main AI \/ User/);
    assert.doesNotMatch(response.body, /"result"\s*:/);
    assert.doesNotMatch(response.body, /"prompt"\s*:/);
    assert.doesNotMatch(response.body, /candidate_id|material_state|comparison_state|confirmed_claim_ids|undetermined_claim_ids|support_evidence_refs|counter_evidence_refs|missing_evidence_refs|Task Wave|Lens=|SearchExecution=|EvidenceQuality=|MATERIAL_ONLY|INSUFFICIENT_/i);
    assert.doesNotMatch(response.body, /Data Loss|Downtime|Recall|保証不履行|現行維持|段階移行|修理|交換/);

    // 3) EFFECT: unavailable evidence remains visibly unresolved in reader-facing language instead of becoming a confirmed fact or leaking internal enums.
    assert.match(response.body, /External search was not executed|external evidence is not currently established/i);
    assert.match(response.body, /remain(?:s)? unresolved|unresolved rather than being promoted|must remain unresolved/i);
    assert.match(response.body, /counter-evidence|failure conditions|mismatched version|time scope/i);
    assert.doesNotMatch(response.body, /REJECTED_SEARCH_NOT_EXECUTED|UNDETERMINED|SearchExecution=|EvidenceQuality=/);
    assert.doesNotMatch(response.body, /selected_candidate\s*=\s*[^-]/i);

    // 4) NEXT HANDOFF: all eight material sections are present for the external consumer/user to continue from.
    assert.equal((response.body.match(/^---$/gm) || []).length, 7);
  } finally {
    await engine.destroy?.();
    await server.stop();
    if (oldLocalNoAuth === undefined) delete process.env.ASTERA_LOCAL_NO_AUTH;
    else process.env.ASTERA_LOCAL_NO_AUTH = oldLocalNoAuth;
  }
});