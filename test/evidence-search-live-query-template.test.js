'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  applyTemplate,
  compileQueryTemplate,
  createFreeOfficialLiveProvider,
  escapeSparqlLiteral
} = require('../src/evidence-search/providers/free-official-live-provider');

test('SPARQL literal escaping prevents query text from breaking the fixed query template', () => {
  assert.equal(escapeSparqlLiteral('a"b\\c\n'), 'a\\"b\\\\c\\n');
  const compiled = compileQueryTemplate('SELECT * WHERE { FILTER(CONTAINS("{search_term}", "x")) }', {
    query_set: [{ text: 'a"b\\c' }]
  });
  assert.equal(compiled, 'SELECT * WHERE { FILTER(CONTAINS("a\\"b\\\\c", "x")) }');
});

test('query_payload URL placeholder encodes the entire fixed SPARQL query', () => {
  const endpoint = { query_template: 'SELECT * WHERE { FILTER(CONTAINS("{search_term}", "x")) }' };
  const url = applyTemplate('https://vocabularies.unesco.org/sparql?query={query_payload}', {
    query_set: [{ text: 'higher education' }]
  }, endpoint);
  assert.match(url, /^https:\/\/vocabularies\.unesco\.org\/sparql\?query=/);
  assert.equal(decodeURIComponent(url.split('query=')[1]), 'SELECT * WHERE { FILTER(CONTAINS("higher education", "x")) }');
});

test('live provider forwards endpoint request headers and maps SPARQL JSON bindings', async () => {
  const calls = [];
  const conceptUri = 'http://vocabularies.unesco.org/thesaurus/concept123';
  const provider = createFreeOfficialLiveProvider({
    provider_id: 'unesco-live-adapter-unit',
    source_family_id: 'unesco',
    allowed_hosts: ['vocabularies.unesco.org'],
    domains: ['G14'],
    endpoints: [{
      endpoint_id: 'unesco-sparql',
      url_template: 'https://vocabularies.unesco.org/sparql?query={query_payload}',
      query_template: 'SELECT ?concept ?label WHERE { FILTER(CONTAINS("{search_term}", "education")) }',
      request_headers: { Accept: 'application/sparql-results+json' },
      response_format: 'JSON',
      records_path: 'results.bindings',
      field_map: {
        canonical_record_id: 'concept.value',
        canonical_url: 'concept.value',
        title: 'label.value'
      }
    }],
    transport: async (url, options) => {
      calls.push({ url, options });
      return {
        url,
        status: 200,
        headers: { 'content-type': 'application/sparql-results+json' },
        body: Buffer.from(JSON.stringify({ results: { bindings: [{ concept: { value: conceptUri }, label: { value: 'Education' } }] } }))
      };
    }
  });

  const result = await provider.search({
    request_id: 'sparql-unit',
    domain_lens: { id: 'G14' },
    query_set: [{ query_id: 'q1', text: 'education' }]
  }, { deadline_at: Date.now() + 5000, signal: new AbortController().signal });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers.Accept, 'application/sparql-results+json');
  assert.equal(result.query_results[0].retrieval_status, 'FOUND');
  assert.equal(result.candidates[0].canonical_record_id, conceptUri);
  assert.equal(result.candidates[0].title, 'Education');
});
