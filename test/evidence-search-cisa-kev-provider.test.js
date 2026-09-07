'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createStaticJsonFilterProvider } = require('../src/evidence-search/providers/static-json-filter-provider');
const { PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_RUNTIME_WAVE4 } = require('../src/evidence-search/providers/public-specialist-provider-definitions-runtime-wave4');
const { loadEvidenceProviders, readConfig } = require('../src/evidence-search/providers/config-loader');
const { loadEvidenceSourceCatalog } = require('../src/evidence-search/providers/source-catalog');

const configFile = path.join(__dirname, '..', 'config', 'evidence-providers.public.json');

function plan(text) {
  return { request_id: 'cisa-kev-test', domain_lens: { id: 'G31' }, query_set: [{ query_id: 'q1', role: 'PRIMARY', text }] };
}

function context() {
  return { deadline_at: Date.now() + 5000, signal: new AbortController().signal };
}

function definition() {
  const value = PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_RUNTIME_WAVE4.find((provider) => provider.provider_id === 'cisa-kev-search');
  assert.ok(value);
  return value;
}

const sampleFeed = {
  title: 'CISA Known Exploited Vulnerabilities Catalog',
  catalogVersion: 'test',
  vulnerabilities: [
    {
      cveID: 'CVE-2021-44228',
      vendorProject: 'Apache',
      product: 'Log4j2',
      vulnerabilityName: 'Apache Log4j2 Remote Code Execution Vulnerability',
      dateAdded: '2021-12-10',
      shortDescription: 'Apache Log4j2 contains a remote code execution vulnerability.',
      requiredAction: 'Apply mitigations per vendor instructions.',
      dueDate: '2021-12-24',
      knownRansomwareCampaignUse: 'Known',
      notes: 'https://nvd.nist.gov/vuln/detail/CVE-2021-44228',
      cwes: ['CWE-502']
    },
    {
      cveID: 'CVE-2021-26855',
      vendorProject: 'Microsoft',
      product: 'Exchange Server',
      vulnerabilityName: 'Microsoft Exchange Server SSRF Vulnerability',
      dateAdded: '2021-11-03',
      shortDescription: 'Microsoft Exchange Server contains a server-side request forgery vulnerability.',
      requiredAction: 'Apply updates per vendor instructions.',
      dueDate: '2021-11-17',
      knownRansomwareCampaignUse: 'Unknown',
      notes: 'https://nvd.nist.gov/vuln/detail/CVE-2021-26855',
      cwes: ['CWE-918']
    }
  ]
};

test('CISA KEV filters the static official feed by CVE and maps a canonical evidence record', async () => {
  let requests = 0;
  const raw = definition();
  const provider = createStaticJsonFilterProvider({
    ...raw,
    transport: async (url) => {
      requests += 1;
      return { url, status: 200, body: Buffer.from(JSON.stringify(sampleFeed)) };
    }
  });
  const result = await provider.search(plan('CVE-2021-44228'), context());
  assert.equal(result.query_results[0].retrieval_status, 'FOUND');
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].canonical_record_id, 'CVE-2021-44228');
  assert.equal(result.candidates[0].fields.vendor_project, 'Apache');
  assert.equal(result.candidates[0].source_role, 'OFFICIAL');
  assert.equal(requests, 1);
});

test('CISA KEV supports multi-token vendor/product filtering and reuses its in-process TTL cache', async () => {
  let requests = 0;
  const raw = definition();
  const provider = createStaticJsonFilterProvider({
    ...raw,
    transport: async (url) => {
      requests += 1;
      return { url, status: 200, body: Buffer.from(JSON.stringify(sampleFeed)) };
    }
  });
  const first = await provider.search(plan('Microsoft Exchange'), context());
  const second = await provider.search(plan('Apache Log4j2'), context());
  assert.equal(first.candidates[0].canonical_record_id, 'CVE-2021-26855');
  assert.equal(second.candidates[0].canonical_record_id, 'CVE-2021-44228');
  assert.equal(requests, 1);
  assert.equal(second.usage.cache_hit, true);
});

test('public loader activates CISA KEV and runtime source catalog is reverse-bound', () => {
  const { absolute, parsed } = readConfig(configFile);
  const catalog = loadEvidenceSourceCatalog(absolute, parsed.source_catalog);
  const source = catalog.sources.find((item) => item.source_id === 'CISA_KEV_VERIFIED');
  assert.ok(source);
  assert.equal(source.runtime_state, 'SEARCHABLE');
  assert.equal(source.provider_id, 'cisa-kev-search');
  const loadedIds = new Set(loadEvidenceProviders({ configFile }).map((provider) => provider.provider_id));
  assert.ok(loadedIds.has('cisa-kev-search'));
});
