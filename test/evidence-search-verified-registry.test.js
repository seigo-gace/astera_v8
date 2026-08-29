'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createFreeOfficialLiveProvider } = require('../src/evidence-search/providers/free-official-live-provider');
const { createSearchDetailJsonProvider } = require('../src/evidence-search/providers/search-detail-json-provider');
const { PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_PREVERIFIED_WAVE3 } = require('../src/evidence-search/providers/public-specialist-provider-definitions-preverified-wave3');
const { loadEvidenceProviders, readConfig } = require('../src/evidence-search/providers/config-loader');

const configFile = path.join(__dirname, '..', 'config', 'evidence-providers.public.json');
const VERIFIED_IDS = Object.freeze([
  'jpl-sbdb-verified',
  'gwosc-v2-verified',
  'clinvar-esummary-verified',
  'cpsc-recalls-api-verified',
  'eric-api-verified',
  'egov-laws-v2-verified',
  'itis-anymatch-verified'
]);

function definition(providerId) {
  const value = PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_PREVERIFIED_WAVE3.find((provider) => provider.provider_id === providerId);
  assert.ok(value, `missing provider definition: ${providerId}`);
  return value;
}

function plan(query) {
  return { request_id: 'verified-registry-test', domain_lens: { id: 'G19' }, query_set: [{ query_id: 'q1', role: 'PRIMARY', text: query }] };
}

function context() {
  return { deadline_at: Date.now() + 5000, signal: new AbortController().signal };
}

test('verified provider wave is reverse-bound through the public source catalog', () => {
  const { parsed } = readConfig(configFile);
  const rawIds = parsed.providers.map((provider) => provider.provider_id);
  assert.equal(rawIds.length, new Set(rawIds).size);
  const loadedIds = new Set(loadEvidenceProviders({ configFile }).map((provider) => provider.provider_id));
  for (const providerId of VERIFIED_IDS) assert.ok(loadedIds.has(providerId), providerId);
});

test('JPL SBDB verified provider maps a unique small-body record', async () => {
  const raw = definition('jpl-sbdb-verified');
  const provider = createFreeOfficialLiveProvider({
    ...raw,
    transport: async (url) => ({
      url,
      status: 200,
      body: Buffer.from(JSON.stringify({ object: { spkid: '2000433', fullname: '433 Eros (1898 DQ)', des: '433', kind: 'an', neo: true, pha: false, orbit_class: { name: 'Amor' } }, orbit: { orbit_id: '614' } }))
    })
  });
  const result = await provider.search(plan('Eros'), context());
  assert.equal(result.query_results[0].retrieval_status, 'FOUND');
  assert.equal(result.candidates[0].canonical_record_id, '2000433');
  assert.equal(result.candidates[0].title, '433 Eros (1898 DQ)');
});

test('GWOSC v2 verified provider maps actual event-version search records', async () => {
  const raw = definition('gwosc-v2-verified');
  const provider = createFreeOfficialLiveProvider({
    ...raw,
    transport: async (url) => ({
      url,
      status: 200,
      body: Buffer.from(JSON.stringify({ results: [{ name: 'GW150914', shortName: 'GW150914-v4', gps: 1126259462.4, version: 4, catalog: 'GWTC-2.1-confident', detectors: ['H1','L1'], doi: 'https://doi.org/10.7935/qf3a-3z67', detail_url: 'https://gwosc.org/api/v2/event-versions/GW150914-v4?format=api' }] }))
    })
  });
  const result = await provider.search(plan('GW150914'), context());
  assert.equal(result.query_results[0].retrieval_status, 'FOUND');
  assert.equal(result.candidates[0].canonical_record_id, 'GW150914-v4');
  assert.equal(result.candidates[0].canonical_url, 'https://gwosc.org/api/v2/event-versions/GW150914-v4?format=api');
});

test('ClinVar verified provider follows ESearch id into ESummary record', async () => {
  const raw = definition('clinvar-esummary-verified');
  const requested = [];
  const provider = createSearchDetailJsonProvider({
    ...raw,
    source_class: 'FREE_OFFICIAL_LIVE',
    transport: async (url) => {
      requested.push(url);
      if (url.includes('/esearch.fcgi')) return { url, status: 200, body: Buffer.from(JSON.stringify({ esearchresult: { idlist: ['65533'] } })) };
      return { url, status: 200, body: Buffer.from(JSON.stringify({ result: { uids: ['65533'], '65533': { uid: '65533', obj_type: 'single nucleotide variant', accession: 'VCV000065533', accession_version: 'VCV000065533.11', title: 'NM_000081.4(LYST):c.1540C>T (p.Arg514Ter)', clinical_significance: { description: 'Pathogenic' }, genes: [{ symbol: 'LYST' }], trait_set: [{ trait_name: 'Chediak-Higashi syndrome' }] } } })) };
    }
  });
  const result = await provider.search(plan('FGFR3'), context());
  assert.equal(requested.length, 2);
  assert.equal(result.query_results[0].retrieval_status, 'FOUND');
  assert.equal(result.candidates[0].canonical_record_id, '65533');
  assert.equal(result.candidates[0].title, 'NM_000081.4(LYST):c.1540C>T (p.Arg514Ter)');
});

test('e-Gov keyword provider emits law records from items', async () => {
  const raw = definition('egov-laws-v2-verified');
  const provider = createFreeOfficialLiveProvider({
    ...raw,
    transport: async (url) => ({
      url,
      status: 200,
      body: Buffer.from(JSON.stringify({ total_count: 1, items: [{ law_info: { law_id: '322AC0000000049', law_num: '昭和二十二年法律第四十九号', promulgation_date: '1947-04-07' }, revision_info: { law_revision_id: '322AC0000000049_20250601_504AC0000000068', law_title: '労働基準法', amendment_enforcement_date: '2025-06-01' }, sentences: [{ position: 'MainProvision-Article[1]', text: '労働条件は...' }] }] }))
    })
  });
  const result = await provider.search({ ...plan('労働'), domain_lens: { id: 'G08' } }, context());
  assert.equal(result.query_results[0].retrieval_status, 'FOUND');
  assert.equal(result.candidates[0].canonical_record_id, '322AC0000000049');
  assert.equal(result.candidates[0].title, '労働基準法');
});

test('CPSC, ERIC and ITIS verified provider contracts remain direct JSON routes', () => {
  const cpsc = definition('cpsc-recalls-api-verified');
  const eric = definition('eric-api-verified');
  const itis = definition('itis-anymatch-verified');
  assert.match(cpsc.endpoints[0].url_template, /RestWebServices\/Recall\?ProductName=/);
  assert.equal(eric.endpoints[0].records_path, 'response.docs');
  assert.match(eric.endpoints[0].url_template, /api\.ies\.ed\.gov\/eric/);
  assert.equal(itis.endpoints[0].records_path, 'anyMatchList');
  assert.match(itis.endpoints[0].url_template, /searchForAnyMatch/);
});
