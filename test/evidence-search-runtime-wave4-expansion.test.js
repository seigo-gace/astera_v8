'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { readConfig, loadEvidenceProviders } = require('../src/evidence-search/providers/config-loader');
const { loadEvidenceSourceCatalog } = require('../src/evidence-search/providers/source-catalog');

const configFile = path.join(__dirname, '..', 'config', 'evidence-providers.public.json');

const EXPECTED = Object.freeze({
  ONET_VERIFIED: 'onet-occupation-search',
  CLOJARS_VERIFIED: 'clojars-project-search',
  SIMBAD_VERIFIED: 'simbad-object-search',
  NIST_OSAC_VERIFIED: 'nist-osac-registry-search'
});

test('runtime public KB expansion activates verified searchable adapters', () => {
  const { absolute, parsed } = readConfig(configFile);
  const configured = new Set(parsed.providers.filter((provider) => provider.enabled !== false).map((provider) => provider.provider_id));
  for (const providerId of Object.values(EXPECTED)) assert.ok(configured.has(providerId), `missing provider definition: ${providerId}`);

  const catalog = loadEvidenceSourceCatalog(absolute, parsed.source_catalog);
  const bySource = new Map(catalog.sources.map((source) => [source.source_id, source]));
  for (const [sourceId, providerId] of Object.entries(EXPECTED)) {
    const source = bySource.get(sourceId);
    assert.ok(source, `missing source: ${sourceId}`);
    assert.equal(source.runtime_state, 'SEARCHABLE');
    assert.equal(source.provider_id, providerId);
  }

  const loaded = new Set(loadEvidenceProviders({ configFile }).map((provider) => provider.provider_id));
  for (const providerId of Object.values(EXPECTED)) assert.ok(loaded.has(providerId), `provider did not load: ${providerId}`);
});
