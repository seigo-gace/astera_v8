'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPostJsonProvider } = require('../src/evidence-search/providers/post-json-provider');
const { PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_RUNTIME_WAVE4 } = require('../src/evidence-search/providers/public-specialist-provider-definitions-runtime-wave4');
const { readConfig, loadEvidenceProviders } = require('../src/evidence-search/providers/config-loader');
const { loadEvidenceSourceCatalog } = require('../src/evidence-search/providers/source-catalog');
const path = require('node:path');

const configFile = path.join(__dirname, '..', 'config', 'evidence-providers.public.json');

function definition() {
  const value = PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_RUNTIME_WAVE4.find((provider) => provider.provider_id === 'nih-reporter-project-search');
  assert.ok(value);
  return value;
}

function plan(text) {
  return { request_id: 'nih-reporter-test', domain_lens: { id: 'G37' }, query_set: [{ query_id: 'q1', role: 'PRIMARY', text }] };
}

function context() {
  return { deadline_at: Date.now() + 5000, signal: new AbortController().signal };
}

test('NIH RePORTER POST adapter sends canonical query as advanced text search and maps project result', async () => {
  let request = null;
  const raw = definition();
  const provider = createPostJsonProvider({
    ...raw,
    transport: async (url, payload) => {
      request = { url, payload };
      return {
        url,
        status: 200,
        body: Buffer.from(JSON.stringify({
          meta: { total: 1, offset: 0, limit: 10 },
          results: [{
            appl_id: 10878415,
            project_num: '1R24GM154192-01',
            project_title: 'NCCAT: National Center for CryoEM Access and Training',
            abstract_text: 'A research project for cryoEM access and training.',
            fiscal_year: 2026,
            award_amount: 7709519,
            organization: { org_name: 'Example University' },
            principal_investigators: [{ full_name: 'DOE, JANE' }],
            project_start_date: '2026-01-01T00:00:00Z',
            project_end_date: '2026-12-31T00:00:00Z',
            project_detail_url: 'https://reporter.nih.gov/project-details/10878415'
          }]
        }))
      };
    }
  });
  const result = await provider.search(plan('brain disorder'), context());
  assert.equal(request.url, 'https://api.reporter.nih.gov/v2/projects/search');
  assert.equal(request.payload.criteria.advanced_text_search.operator, 'and');
  assert.equal(request.payload.criteria.advanced_text_search.search_field, 'projecttitle,abstracttext,terms');
  assert.equal(request.payload.criteria.advanced_text_search.search_text, 'brain disorder');
  assert.equal(result.query_results[0].retrieval_status, 'FOUND');
  assert.equal(result.candidates[0].canonical_record_id, '10878415');
  assert.equal(result.candidates[0].canonical_url, 'https://reporter.nih.gov/project-details/10878415');
  assert.equal(result.candidates[0].fields.project_num, '1R24GM154192-01');
  assert.equal(result.candidates[0].source_role, 'OFFICIAL');
});

test('NIH RePORTER POST adapter records NOT_FOUND without turning an empty valid response into a failure', async () => {
  const raw = definition();
  const provider = createPostJsonProvider({
    ...raw,
    transport: async (url) => ({ url, status: 200, body: Buffer.from(JSON.stringify({ meta: { total: 0 }, results: [] })) })
  });
  const result = await provider.search(plan('deliberately absent phrase'), context());
  assert.equal(result.query_results[0].retrieval_status, 'NOT_FOUND');
  assert.equal(result.coverage_state, 'COMPLETE_FOR_QUERY_SCOPE');
  assert.equal(result.failures.length, 0);
});

test('public loader activates NIH RePORTER and runtime source catalog is reverse-bound', () => {
  const { absolute, parsed } = readConfig(configFile);
  const catalog = loadEvidenceSourceCatalog(absolute, parsed.source_catalog);
  const source = catalog.sources.find((item) => item.source_id === 'NIH_REPORTER_VERIFIED');
  assert.ok(source);
  assert.equal(source.runtime_state, 'SEARCHABLE');
  assert.equal(source.provider_id, 'nih-reporter-project-search');
  const loadedIds = new Set(loadEvidenceProviders({ configFile }).map((provider) => provider.provider_id));
  assert.ok(loadedIds.has('nih-reporter-project-search'));
});
