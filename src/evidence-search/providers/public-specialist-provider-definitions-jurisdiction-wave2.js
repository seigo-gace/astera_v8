'use strict';

const PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_JURISDICTION_WAVE2 = Object.freeze([
  Object.freeze({
    provider_id: 'ecolex-search',
    catalog_source_ids: ['ECOLEX'],
    type: 'SEARCH_DETAIL_HTML',
    enabled: true,
    certified: true,
    source_family_id: 'ecolex',
    priority: 8,
    domains: ['G06', 'G07', 'G08', 'G21', 'G24', 'G27', 'G32', 'G34'],
    capabilities: [],
    allowed_hosts: ['www.ecolex.org'],
    smoke_query: 'climate',
    authority_id: 'ecolex',
    publisher_name: 'FAO / IUCN / UNEP',
    search: {
      url_template: 'https://www.ecolex.org/result/?q={query}',
      href_regex: 'href=["\\\']([^"\\\']*\\/details\\/(?:legislation|treaty|court-decision|decision|literature)\\/[^"\\\']+)["\\\']',
      maximum_records: 5,
      timeout_ms: 12000,
      maximum_excerpt_chars: 12000
    },
    routing_terms: ['ecolex', 'environmental law', 'natural resources law', 'treaty', 'legislation', 'jurisprudence', 'country law', '環境法', '天然資源法', '条約', '判例']
  })
]);

const ROUTING_OVERRIDES_JURISDICTION_WAVE2 = Object.freeze({
  'ecolex-search': Object.freeze(['ecolex', 'environmental law', 'natural resources law', 'treaty', 'legislation', 'jurisprudence', 'country law', '環境法', '天然資源法', '条約', '判例'])
});

module.exports = { PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_JURISDICTION_WAVE2, ROUTING_OVERRIDES_JURISDICTION_WAVE2 };
