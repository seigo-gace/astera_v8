'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const createEvidenceSearchModule = require('../src/evidence-search');
const { createJsonProjectionProvider } = require('../src/evidence-search/providers/json-projection-provider');

const EXECUTION_TIME = '2026-07-18T01:45:00.000Z';

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
    title: 'ASTERA evidence search uses Node.js 22',
    excerpt: 'ASTERA evidence search uses Node.js 22 without AI.',
    language: 'en',
    updated_at: EXECUTION_TIME,
    version: '22.0.0',
    revision_id: `${id}-r1`,
    retrieval_trace: { current_pointer_verified: true },
    rights: { access: 'public', reuse: 'allowed' },
    fields: { domain_id: 'G29', claim: 'ASTERA uses Node.js 22' },
    lineage_fingerprint: {
      authority_id: authority,
      publisher_id: authority,
      origin_record_id: id,
      publication_event_id: `${id}-publication`
    }
  };
}

async function writeProjection(root, name, records) {
  const file = path.join(root, `${name}.json`);
  await fs.writeFile(file, JSON.stringify(records), 'utf8');
  return file;
}

test('user can search local specialist projections and receive final verified evidence through one connection', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'astera-evidence-user-'));
  try {
    const primaryFile = await writeProjection(root, 'primary', [
      record('primary-record', 'primary-authority', 'PRIMARY', 'primary-family', 'projection_search')
    ]);
    const officialFile = await writeProjection(root, 'official', [
      record('official-record', 'official-authority', 'OFFICIAL', 'official-family', 'current_official')
    ]);
    const reinforcementFile = await writeProjection(root, 'reinforcement', [
      record('reinforcement-record', 'independent-authority', 'OFFICIAL', 'independent-family', 'independent_origin')
    ]);

    const module = createEvidenceSearchModule({
      providers: [
        createJsonProjectionProvider({ provider_id: 'primary-file', filePath: primaryFile, source_class: 'FREE_PROJECTION', source_family_id: 'primary-family', capabilities: ['NO_REINFORCEMENT'], domains: ['G29'] }),
        createJsonProjectionProvider({ provider_id: 'official-file', filePath: officialFile, source_class: 'FREE_OFFICIAL_LIVE', source_family_id: 'official-family', capabilities: ['NO_REINFORCEMENT'], domains: ['G29'] }),
        createJsonProjectionProvider({ provider_id: 'reinforcement-file', filePath: reinforcementFile, source_class: 'FREE_OFFICIAL_LIVE', source_family_id: 'independent-family', capabilities: ['REINFORCEMENT_ONLY'], domains: ['G29'] })
      ]
    });

    const response = await module.execute({
      schema_version: 'astera.evidence-search.module-request.v1',
      operation: 'SEARCH_EVIDENCE',
      context: {
        request_id: 'user-journey-001',
        tenant_id: 'user-tenant',
        execution_time: EXECUTION_TIME,
        effective_as_of: EXECUTION_TIME
      },
      payload: {
        request_id: 'user-journey-001',
        tenant_id: 'user-tenant',
        question: 'ASTERA evidence search uses Node.js 22',
        domain_lens: { id: 'G29', taxonomy_version: '1.0.0' },
        conditions: [{ condition_id: 'runtime', class: 'CORE', field: 'fields.claim', operator: 'EQ', expected_value: 'ASTERA uses Node.js 22', required: true }],
        search: { free_projection: true, free_current: true },
        paid_search: { enabled: false },
        deadline_ms: 8000
      }
    });

    assert.equal(response.result.status, 'FINAL_VALID');
    assert.equal(response.result.quality.reinforcement_attempt_count, 1);
    assert.equal(response.result.quality.new_corroboration_count, 1);
    assert.equal(response.result.evidence.length, 3);
    assert.equal(response.result.ai_used, false);
    assert.equal(response.result.payment_executed, false);
    assert.equal(response.result.provider_execution.initial.length, 2);
    assert.equal(response.result.provider_execution.reinforcement.length, 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('user receives a deterministic rejection instead of an empty success', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'astera-evidence-user-fail-'));
  try {
    const emptyFile = await writeProjection(root, 'empty', []);
    const module = createEvidenceSearchModule({
      providers: [createJsonProjectionProvider({ provider_id: 'empty-file', filePath: emptyFile, source_class: 'FREE_PROJECTION', capabilities: ['NO_REINFORCEMENT'], domains: ['G29'] })]
    });

    const response = await module.execute({
      schema_version: 'astera.evidence-search.module-request.v1',
      operation: 'SEARCH_EVIDENCE',
      context: { request_id: 'user-journey-empty', tenant_id: 'user-tenant', execution_time: EXECUTION_TIME, effective_as_of: EXECUTION_TIME },
      payload: {
        question: 'information that does not exist',
        domain_lens: { id: 'G29' },
        conditions: [{ condition_id: 'missing', class: 'CORE', field: 'text', operator: 'CONTAINS', expected_value: 'information that does not exist' }],
        search: { free_projection: true, free_current: false },
        paid_search: { enabled: false }
      }
    });

    assert.notEqual(response.result.status, 'FINAL_VALID');
    assert.ok(response.result.quality.initial.blocking_reasons.includes('NO_EVIDENCE_CANDIDATE'));
    assert.equal(response.result.evidence.length, 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
