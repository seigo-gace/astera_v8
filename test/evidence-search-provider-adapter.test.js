'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  isPublicIp,
  secureGet
} = require('../src/evidence-search/providers/secure-http-transport');
const {
  createFreeOfficialLiveProvider
} = require('../src/evidence-search/providers/free-official-live-provider');
const {
  loadEvidenceProviders
} = require('../src/evidence-search/providers/config-loader');

function withProviderConfig(config, callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astera-provider-config-'));
  const configFile = path.join(dir, 'evidence-providers.json');
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  try {
    return callback(configFile);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('SSRF address policy rejects private, loopback, link-local, and documentation ranges', () => {
  for (const address of [
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '192.0.2.1',
    '198.51.100.1',
    '203.0.113.1',
    '::1',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
    '::ffff:127.0.0.1'
  ]) {
    assert.equal(isPublicIp(address), false, address);
  }
  assert.equal(isPublicIp('8.8.8.8'), true);
  assert.equal(isPublicIp('1.1.1.1'), true);
  assert.equal(isPublicIp('2606:4700:4700::1111'), true);
});

test('secure transport rejects unregistered hosts before a request is sent', async () => {
  let requested = false;
  await assert.rejects(
    () => secureGet('https://not-registered.example/path', {
      allowedHosts: ['registered.example'],
      lookup: async () => [{ address: '8.8.8.8', family: 4 }],
      request: async () => {
        requested = true;
        return { status: 200, headers: {}, body: Buffer.from('{}') };
      }
    }),
    (error) => error.code === 'SOURCE_HOST_NOT_REGISTERED'
  );
  assert.equal(requested, false);
});

test('secure transport rejects a registered hostname resolving to a private address', async () => {
  let requested = false;
  await assert.rejects(
    () => secureGet('https://registered.example/path', {
      allowedHosts: ['registered.example'],
      lookup: async () => [{ address: '127.0.0.1', family: 4 }],
      request: async () => {
        requested = true;
        return { status: 200, headers: {}, body: Buffer.from('{}') };
      }
    }),
    (error) => error.code === 'SOURCE_ADDRESS_FORBIDDEN'
  );
  assert.equal(requested, false);
});

test('runtime provider config rejects reserved placeholder hosts instead of treating them as real providers', () => {
  withProviderConfig({
    schema_version: 'astera.evidence-providers.v1',
    providers: [{
      provider_id: 'placeholder-runtime-provider',
      type: 'FREE_OFFICIAL_HTTP',
      enabled: true,
      certified: true,
      allowed_hosts: ['api.official.example'],
      domains: ['G29'],
      capabilities: ['NO_REINFORCEMENT'],
      endpoints: [{
        endpoint_id: 'placeholder-search',
        url_template: 'https://api.official.example/search?q={query}',
        response_format: 'JSON',
        records_path: 'results'
      }]
    }]
  }, (configFile) => {
    assert.throws(
      () => loadEvidenceProviders({ configFile }),
      (error) => error.code === 'EVIDENCE_PROVIDER_PLACEHOLDER_HOST_FORBIDDEN'
    );
  });
});

test('disabled example providers stay inert and do not become runtime providers', () => {
  withProviderConfig({
    schema_version: 'astera.evidence-providers.v1',
    providers: [{
      provider_id: 'disabled-placeholder-provider',
      type: 'FREE_OFFICIAL_HTTP',
      enabled: false,
      certified: true,
      allowed_hosts: ['api.official.example'],
      endpoints: [{
        endpoint_id: 'placeholder-search',
        url_template: 'https://api.official.example/search?q={query}',
        response_format: 'JSON'
      }]
    }]
  }, (configFile) => {
    assert.deepEqual(loadEvidenceProviders({ configFile }), []);
  });
});

test('runtime provider config accepts a non-placeholder public HTTPS host without performing retrieval', () => {
  withProviderConfig({
    schema_version: 'astera.evidence-providers.v1',
    providers: [{
      provider_id: 'public-host-config-test',
      type: 'FREE_OFFICIAL_HTTP',
      enabled: true,
      certified: true,
      allowed_hosts: ['api.github.com'],
      domains: ['G29'],
      capabilities: ['NO_REINFORCEMENT'],
      endpoints: [{
        endpoint_id: 'public-search-config-test',
        url_template: 'https://api.github.com/search/repositories?q={query}',
        response_format: 'JSON',
        records_path: 'items'
      }]
    }]
  }, (configFile) => {
    const providers = loadEvidenceProviders({ configFile });
    assert.equal(providers.length, 1);
    assert.equal(providers[0].provider_id, 'public-host-config-test');
  });
});

test('free official adapter provider queries only its fixed endpoint and maps current records', async () => {
  const requests = [];
  const provider = createFreeOfficialLiveProvider({
    provider_id: 'official-adapter-test',
    source_family_id: 'official-adapter-family',
    allowed_hosts: ['api.official.example'],
    domains: ['G29'],
    capabilities: ['NO_REINFORCEMENT'],
    endpoints: [{
      endpoint_id: 'official-search',
      url_template: 'https://api.official.example/search?q={query}&domain={domain}',
      response_format: 'JSON',
      records_path: 'results',
      authority_id: 'official-authority',
      publisher_name: 'Official Authority',
      field_map: {
        canonical_record_id: 'id',
        canonical_url: 'url',
        title: 'title',
        excerpt: 'summary',
        version: 'version',
        updated_at: 'updated_at',
        fields: { path: 'fields' },
        lineage_fingerprint: { path: 'lineage' }
      },
      fixed_fields: {
        source_role: 'OFFICIAL',
        language: 'en',
        rights: { access: 'public', reuse: 'allowed' }
      }
    }],
    transport: async (url, options) => {
      requests.push({ url, options });
      return {
        url,
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(JSON.stringify({
          results: [{
            id: 'record-1',
            url: 'https://api.official.example/records/1',
            title: 'Official release record',
            summary: 'An official and current release record.',
            version: '1.0.0',
            updated_at: '2026-07-18T02:00:00.000Z',
            fields: { domain_id: 'G29', claim: 'official current record' },
            lineage: {
              authority_id: 'official-authority',
              publisher_id: 'official-authority',
              origin_record_id: 'record-1',
              publication_event_id: 'release-1'
            }
          }]
        }))
      };
    }
  });

  const result = await provider.search({
    request_id: 'adapter-request-1',
    effective_as_of: '2026-07-18T02:00:00.000Z',
    domain_lens: { id: 'G29' },
    query_set: [{ text: 'Node.js current release' }]
  }, {
    deadline_at: Date.now() + 5000,
    signal: new AbortController().signal
  });

  assert.equal(requests.length, 1);
  assert.equal(
    requests[0].url,
    'https://api.official.example/search?q=Node.js%20current%20release&domain=G29'
  );
  assert.deepEqual(requests[0].options.allowedHosts, ['api.official.example']);
  assert.equal(result.coverage_state, 'COMPLETE_FOR_QUERY_SCOPE');
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].source_role, 'OFFICIAL');
  assert.equal(result.candidates[0].authority_id, 'official-authority');
  assert.equal(result.candidates[0].retrieval_trace.current_pointer_verified, true);
  assert.equal(result.usage.requests, 1);
  assert.equal(result.usage.results, 1);
});
