'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  applyTemplate,
  createFreeOfficialLiveProvider,
  resolveIetfDocumentName,
  shouldAttemptIetfEndpoint
} = require('../src/evidence-search/providers/free-official-live-provider');

const IETF_ENDPOINTS = Object.freeze([
  {
    endpoint_id: 'ietf-document-json',
    ietf_route: 'DOCUMENT_JSON',
    url_template: 'https://datatracker.ietf.org/doc/{query}/doc.json',
    response_format: 'JSON',
    records_path: '',
    request_headers: { Accept: 'application/json' },
    authority_id: 'ietf',
    publisher_name: 'IETF',
    field_map: {
      canonical_record_id: 'name',
      title: 'title',
      excerpt: { path: 'abstract', default: '' }
    },
    fixed_fields: { source_role: 'OFFICIAL' }
  },
  {
    endpoint_id: 'ietf-document-api-exact',
    ietf_route: 'DOCUMENT_API_EXACT',
    url_template: 'https://datatracker.ietf.org/api/v1/doc/document/?name={query}&limit=5&format=json',
    response_format: 'JSON',
    records_path: 'objects',
    request_headers: { Accept: 'application/json' },
    authority_id: 'ietf',
    publisher_name: 'IETF',
    field_map: {
      canonical_record_id: 'name',
      title: 'title',
      excerpt: { path: 'abstract', default: '' }
    },
    fixed_fields: { source_role: 'OFFICIAL' }
  },
  {
    endpoint_id: 'ietf-rfc-editor-json',
    ietf_route: 'RFC_EDITOR_JSON',
    url_template: 'https://www.rfc-editor.org/rfc/{query}.json',
    response_format: 'JSON',
    records_path: '',
    request_headers: { Accept: 'application/json' },
    authority_id: 'ietf',
    publisher_name: 'IETF',
    field_map: {
      canonical_record_id: 'doc_id',
      title: 'title',
      excerpt: { path: 'abstract', default: '' }
    },
    fixed_fields: { source_role: 'OFFICIAL' }
  },
  {
    endpoint_id: 'ietf-document-api-search',
    ietf_route: 'DOCUMENT_API_SEARCH',
    url_template: 'https://datatracker.ietf.org/api/v1/doc/document/?title__icontains={query}&limit=5&format=json',
    response_format: 'JSON',
    records_path: 'objects',
    request_headers: { Accept: 'application/json' },
    authority_id: 'ietf',
    publisher_name: 'IETF',
    field_map: {
      canonical_record_id: 'name',
      title: 'title',
      excerpt: { path: 'abstract', default: '' }
    },
    fixed_fields: { source_role: 'OFFICIAL' }
  }
]);

test('resolveIetfDocumentName normalizes RFC and draft identifiers', () => {
  assert.equal(resolveIetfDocumentName('RFC 8446'), 'rfc8446');
  assert.equal(resolveIetfDocumentName('rfc8446'), 'rfc8446');
  assert.equal(resolveIetfDocumentName('draft-ietf-tls-tls13-28'), 'draft-ietf-tls-tls13-28');
  assert.equal(resolveIetfDocumentName('Find draft-ietf-quic-http in tracker'), 'draft-ietf-quic-http');
  assert.equal(resolveIetfDocumentName('transport security'), null);
});

test('IETF route selection prefers document routes for RFC identifiers', () => {
  const jsonEndpoint = IETF_ENDPOINTS[0];
  const searchEndpoint = IETF_ENDPOINTS[3];
  assert.equal(shouldAttemptIetfEndpoint(jsonEndpoint, 'RFC 8446'), true);
  assert.equal(shouldAttemptIetfEndpoint(searchEndpoint, 'RFC 8446'), false);
  assert.equal(shouldAttemptIetfEndpoint(searchEndpoint, 'transport security'), true);
});

test('applyTemplate builds official Datatracker and RFC Editor record URLs', () => {
  const plan = {
    query_set: [{ query_id: 'q1', text: 'RFC 8446' }],
    domain_lens: { id: 'G36' },
    request_id: 'unit',
    effective_as_of: '2026-01-01T00:00:00.000Z'
  };
  assert.equal(
    applyTemplate(IETF_ENDPOINTS[0].url_template, { ...plan, query_set: [{ query_id: 'q1', text: 'rfc8446' }] }, IETF_ENDPOINTS[0]),
    'https://datatracker.ietf.org/doc/rfc8446/doc.json'
  );
  assert.equal(
    applyTemplate(IETF_ENDPOINTS[2].url_template, { ...plan, query_set: [{ query_id: 'q1', text: 'rfc8446' }] }, IETF_ENDPOINTS[2]),
    'https://www.rfc-editor.org/rfc/rfc8446.json'
  );
  assert.equal(
    applyTemplate(IETF_ENDPOINTS[1].url_template, { ...plan, query_set: [{ query_id: 'q1', text: 'draft-ietf-quic-http' }] }, IETF_ENDPOINTS[1]),
    'https://datatracker.ietf.org/api/v1/doc/document/?name=draft-ietf-quic-http&limit=5&format=json'
  );
});

test('IETF provider skips blocked HTML search and maps official JSON records', async () => {
  const calls = [];
  const provider = createFreeOfficialLiveProvider({
    provider_id: 'ietf-datatracker-search',
    source_family_id: 'ietf-datatracker',
    allowed_hosts: ['datatracker.ietf.org', 'www.rfc-editor.org'],
    domains: ['G36'],
    endpoints: IETF_ENDPOINTS,
    transport: async (url, options) => {
      calls.push({ url, options });
      if (url.includes('name__contains') || url.includes('/doc/html/')) {
        return {
          url,
          status: 403,
          headers: { 'content-type': 'text/html' },
          body: Buffer.from('<html>blocked</html>')
        };
      }
      if (url.includes('datatracker.ietf.org')) {
        return {
          url,
          status: 403,
          headers: { 'content-type': 'text/html' },
          body: Buffer.from('<html>blocked</html>')
        };
      }
      if (url === 'https://www.rfc-editor.org/rfc/rfc8446.json') {
        return {
          url,
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: Buffer.from(JSON.stringify({
            doc_id: 'RFC8446',
            title: 'The Transport Layer Security (TLS) Protocol Version 1.3',
            abstract: 'TLS 1.3 abstract',
            pub_date: 'August 2018'
          }))
        };
      }
      throw new Error(`unexpected url: ${url}`);
    }
  });

  const result = await provider.search({
    request_id: 'ietf-unit',
    domain_lens: { id: 'G36' },
    query_set: [{ query_id: 'q1', text: 'RFC 8446' }]
  }, { deadline_at: Date.now() + 5000, signal: new AbortController().signal });

  assert.ok(calls.some((call) => call.url === 'https://datatracker.ietf.org/doc/rfc8446/doc.json'));
  assert.ok(calls.some((call) => call.url === 'https://www.rfc-editor.org/rfc/rfc8446.json'));
  assert.equal(calls.some((call) => call.url.includes('name__contains')), false);
  assert.equal(result.query_results[0].retrieval_status, 'FOUND');
  assert.equal(result.candidates[0].canonical_record_id, 'rfc8446');
  assert.equal(result.candidates[0].canonical_url, 'https://datatracker.ietf.org/doc/rfc8446/');
  assert.equal(result.candidates[0].source_role, 'OFFICIAL');
  assert.equal(result.candidates[0].authority_id, 'ietf');
  assert.equal(result.candidates[0].publisher_name, 'IETF');
});
