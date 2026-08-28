'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildClassSearchUrl,
  createBsddLiveProvider,
  selectDictionaries
} = require('../src/evidence-search/providers/bsdd-live-provider');

const IFC_URI = 'https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3';
const ETIM_URI = 'https://identifier.buildingsmart.org/uri/etim/etim/9.0';

test('bSDD dictionary selection excludes private/non-latest entries and prioritizes IFC', () => {
  const selected = selectDictionaries([
    { uri: ETIM_URI, code: 'ETIM', name: 'ETIM', organizationNameOwner: 'ETIM International', isLatestVersion: true, isVerified: true, isPrivate: false, status: 'Active' },
    { uri: IFC_URI, code: 'IFC', name: 'Industry Foundation Classes', organizationNameOwner: 'buildingSMART International', isLatestVersion: true, isVerified: true, isPrivate: false, status: 'Active' },
    { uri: 'https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.2', code: 'IFC', name: 'IFC old', organizationNameOwner: 'buildingSMART International', isLatestVersion: false, isVerified: true, isPrivate: false, status: 'Active' },
    { uri: 'https://identifier.buildingsmart.org/uri/private/demo/1', code: 'PRIVATE', name: 'Private', organizationNameOwner: 'Private', isLatestVersion: true, isVerified: false, isPrivate: true, status: 'Active' }
  ], { preferred_dictionary_codes: ['IFC', 'ETIM'], max_dictionary_scan: 10 });
  assert.equal(selected.length, 2);
  assert.equal(selected[0].uri, IFC_URI);
  assert.equal(selected[1].uri, ETIM_URI);
});

test('bSDD class search URL uses bounded pagination and repeated DictionaryUris', () => {
  const url = new URL(buildClassSearchUrl('https://api.bsdd.buildingsmart.org/api/Class/Search/v1', 'wall', [
    { uri: IFC_URI }, { uri: ETIM_URI }
  ], 20));
  assert.equal(url.searchParams.get('SearchText'), 'wall');
  assert.equal(url.searchParams.get('Offset'), '0');
  assert.equal(url.searchParams.get('Limit'), '20');
  assert.deepEqual(url.searchParams.getAll('DictionaryUris'), [IFC_URI, ETIM_URI]);
});

test('bSDD live adapter follows official Dictionary -> filtered Class/Search flow', async () => {
  const calls = [];
  const provider = createBsddLiveProvider({
    provider_id: 'bsdd-search',
    allowed_hosts: ['api.bsdd.buildingsmart.org'],
    domains: ['G25', 'G26', 'G28', 'G32'],
    preferred_dictionary_codes: ['IFC', 'ETIM'],
    max_dictionary_scan: 20,
    dictionary_batch_size: 10,
    result_limit: 20,
    transport: async (rawUrl) => {
      calls.push(rawUrl);
      const url = new URL(rawUrl);
      if (url.pathname === '/api/Dictionary/v1') {
        return {
          url: rawUrl,
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: Buffer.from(JSON.stringify({ totalCount: 2, count: 2, dictionaries: [
            { uri: IFC_URI, code: 'IFC', name: 'Industry Foundation Classes', organizationNameOwner: 'buildingSMART International', isLatestVersion: true, isVerified: true, isPrivate: false, status: 'Active', version: '4.3' },
            { uri: ETIM_URI, code: 'ETIM', name: 'ETIM', organizationNameOwner: 'ETIM International', isLatestVersion: true, isVerified: true, isPrivate: false, status: 'Active', version: '9.0' }
          ] }))
        };
      }
      assert.equal(url.pathname, '/api/Class/Search/v1');
      assert.equal(url.searchParams.get('SearchText'), 'wall');
      assert.ok(url.searchParams.getAll('DictionaryUris').includes(IFC_URI));
      return {
        url: rawUrl,
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(JSON.stringify({ totalCount: 1, offset: 0, count: 1, classes: [{
          dictionaryUri: IFC_URI,
          dictionaryName: 'Industry Foundation Classes',
          name: 'Wall',
          referenceCode: 'IfcWall',
          uri: 'https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3/class/IfcWall',
          classType: 'Class',
          description: 'A wall is a vertical construction element.'
        }] }))
      };
    }
  });

  const result = await provider.search({
    request_id: 'bsdd-unit',
    domain_lens: { id: 'G25' },
    query_set: [{ query_id: 'q1', text: 'wall' }]
  }, { deadline_at: Date.now() + 5000, signal: new AbortController().signal });

  assert.equal(calls.length, 2);
  assert.equal(result.query_results[0].retrieval_status, 'FOUND');
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].canonical_record_id, 'https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3/class/IfcWall');
  assert.equal(result.candidates[0].fields.dictionary_uri, IFC_URI);
});
