'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildEvidenceCitationMaterial,
  annotateMain8Text,
  renderEvidenceTrailer,
  attachEvidenceCitations
} = require('../src/runtime/evidence-citation-material');

function externalBinding(overrides = {}) {
  return {
    evidence_binding_id: 'eb_01', claim_id: 'cl_01', candidate_id: 'ev_official', relation: 'SUPPORTS',
    evidence_source: 'EXTERNAL_RETRIEVED_EVIDENCE', source_roles: ['OFFICIAL'], source_family_id: 'nodejs-release-schedule',
    authority_id: 'nodejs.org', provider_id: 'official-web', source_class: 'AUTHORITATIVE', canonical_record_id: 'nodejs-release-schedule-record',
    canonical_locator: { url: 'https://nodejs.org/en/about/previous-releases', locator_type: 'URL', replayable: true },
    title: 'Node.js — Previous Releases', excerpt: 'Node.js 22 is listed in the official release schedule.',
    publisher: { id: 'nodejs.org', name: 'Node.js' }, published_at: null, updated_at: '2026-09-30T00:00:00.000Z',
    retrieved_at: '2026-10-01T12:00:00.000Z', content_hash: 'hash-1', ...overrides
  };
}

function fixture(binding = externalBinding()) {
  return {
    result: {
      judgment: {
        output_language: 'ja',
        '03_facts': { confirmed: [{ claim_id: 'cl_01', text: 'Node.js 22 は公式サポート対象である。' }] },
        '04_crisis': { risks: [] }, '05_opposition': {}, '06_comparison': {}, '07_evidence_status': {}
      },
      task_results: [{ task: { id: 'T01' }, canonical: { records: [{
        claim: { claim_id: 'cl_01', raw_text: 'Node.js 22 は公式サポート対象である。' },
        confirmation: { status: 'CONFIRMED', bindings: [binding] }
      }] } }]
    },
    material: { text: [
      '01 本当の目的\n- Node.js 22を確認する','02 前提不足\n- 基準日: 2026-10-01','03 事実確認\n- Node.js 22 は公式サポート対象である。',
      '04 危機察知\n- 時点を取り違えない。','05 反対視点\n- 反証も確認する。','06 比較案\n- 比較候補なし。',
      '07 根拠成立状態\n- 外部根拠が成立した。','08 主役AI／利用者への再指示\n- URLを再確認できる。'
    ].join('\n---\n') }, prompt: ''
  };
}

test('citation material maps accepted external evidence to claims, sections and replayable source metadata', () => {
  const material = buildEvidenceCitationMaterial(fixture().result);
  assert.equal(material.schema_version, 'astera.evidence-citation.v1');
  assert.equal(material.source_count, 1);
  assert.deepEqual(material.section_source_ids['03_facts'], ['E01']);
  assert.deepEqual(material.section_source_ids['07_evidence_status'], ['E01']);
  assert.deepEqual(material.claim_source_ids.cl_01, ['E01']);
  const source = material.sources[0];
  assert.equal(source.id, 'E01'); assert.equal(source.display_number, 1);
  assert.equal(source.url, 'https://nodejs.org/en/about/previous-releases'); assert.equal(source.source_role, 'OFFICIAL');
  assert.equal(source.authority_id, 'nodejs.org'); assert.equal(source.publisher.name, 'Node.js');
  assert.match(source.excerpt, /official release schedule/); assert.equal(source.verification_status, 'confirmed');
  assert.equal(source.claim_links[0].claim_text, 'Node.js 22 は公式サポート対象である。');
  assert.equal(source.claim_links[0].relation, 'SUPPORTS'); assert.equal(source.claim_links[0].binding_id, 'eb_01');
});

test('NO_MATCH evidence is never exposed as a used citation', () => {
  const material = buildEvidenceCitationMaterial(fixture(externalBinding({ relation: 'NO_MATCH' })).result);
  assert.equal(material.source_count, 0); assert.deepEqual(material.section_source_ids['03_facts'], []);
});

test('citation rendering keeps Main8 at seven separators and appends machine-readable evidence JSON', () => {
  const attached = attachEvidenceCitations(fixture());
  assert.equal((attached.material.main8_text.match(/^---$/gm) || []).length, 7);
  assert.equal((attached.material.text.match(/^---$/gm) || []).length, 7);
  assert.match(attached.material.main8_text, /回答と根拠の対応:/);
  assert.match(attached.material.main8_text, /Node\.js 22 は公式サポート対象である。 → \[E01\]/);
  assert.match(attached.material.evidence_text, /^===ASTERA_EVIDENCE===\n\{/);
  const json = JSON.parse(attached.material.evidence_text.split('\n').slice(1).join('\n'));
  assert.equal(json.sources[0].url, 'https://nodejs.org/en/about/previous-releases');
  assert.equal(json.sources[0].claim_links[0].relation, 'SUPPORTS');
  assert.match(json.sources[0].excerpt, /official release schedule/);
  assert.equal(attached.material.sources[0].id, 'E01');
  assert.deepEqual(attached.result.judgment['03_facts'].source_ids, ['E01']);
  assert.equal(attached.prompt, attached.material.text);
});

test('replayable canonical locator is preserved when no URL exists', () => {
  const material = buildEvidenceCitationMaterial(fixture(externalBinding({
    candidate_id: 'ev_record', canonical_record_id: 'law:2026:123:section-4',
    canonical_locator: { url: null, locator_type: 'RECORD_ID', replayable: true }, title: 'Official record', evidence_binding_id: 'eb_record'
  })).result);
  assert.equal(material.sources[0].url, null);
  const json = JSON.parse(renderEvidenceTrailer(material).split('\n').slice(1).join('\n'));
  assert.equal(json.sources[0].canonical_locator.locator_type, 'RECORD_ID');
  assert.equal(json.sources[0].canonical_record_id, 'law:2026:123:section-4');
});

test('annotateMain8Text does not invent citations for sections without mapped evidence', () => {
  const out = fixture(); const material = buildEvidenceCitationMaterial(out.result);
  const blocks = annotateMain8Text(out.material.text, material, 'ja').split('\n---\n');
  assert.doesNotMatch(blocks[0], /\[E01\]/); assert.match(blocks[2], /\[E01\]/);
  assert.doesNotMatch(blocks[3], /\[E01\]/); assert.match(blocks[6], /\[E01\]/);
});