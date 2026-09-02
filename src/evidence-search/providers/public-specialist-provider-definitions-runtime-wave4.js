'use strict';

const PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_RUNTIME_WAVE4 = Object.freeze([
  Object.freeze({
    provider_id: 'cisa-kev-search',
    catalog_source_ids: ['CISA_KEV_VERIFIED'],
    type: 'STATIC_JSON_FILTER',
    enabled: true,
    certified: true,
    source_family_id: 'cisa-kev',
    priority: 6,
    domains: ['G31'],
    capabilities: [],
    allowed_hosts: ['www.cisa.gov'],
    smoke_query: 'CVE-2021-44228',
    endpoint: {
      endpoint_id: 'cisa-kev-catalog',
      url: 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',
      records_path: 'vulnerabilities',
      filter_fields: ['cveID', 'vendorProject', 'product', 'vulnerabilityName', 'shortDescription', 'requiredAction', 'cwes'],
      authority_id: 'us-cisa-kev',
      publisher_name: 'Cybersecurity and Infrastructure Security Agency',
      capability_id: 'known_exploited_vulnerability_search',
      maximum_records: 20,
      max_source_records: 10000,
      max_response_bytes: 8 * 1024 * 1024,
      timeout_ms: 5000,
      cache_ttl_ms: 300000,
      request_headers: { Accept: 'application/json' },
      field_map: {
        canonical_record_id: 'cveID',
        canonical_url: { path: 'notes', default: '' },
        title: { path: 'vulnerabilityName', default: '' },
        excerpt: { path: 'shortDescription', default: '' },
        published_at: { path: 'dateAdded', default: null },
        fields: {
          vendor_project: { path: 'vendorProject', default: '' },
          product: { path: 'product', default: '' },
          required_action: { path: 'requiredAction', default: '' },
          due_date: { path: 'dueDate', default: null },
          known_ransomware_campaign_use: { path: 'knownRansomwareCampaignUse', default: '' },
          notes: { path: 'notes', default: '' },
          cwes: { path: 'cwes', stringify: true }
        }
      },
      fixed_fields: {
        source_role: 'OFFICIAL',
        language: 'en',
        rights: { access: 'public', reuse: 'public_data' }
      }
    },
    routing_terms: ['cisa', 'kev', 'known exploited vulnerability', 'actively exploited', 'cve', 'exploit', 'vulnerability', '脆弱性', '悪用', '既知の悪用']
  })
]);

const ROUTING_OVERRIDES_RUNTIME_WAVE4 = Object.freeze({
  'cisa-kev-search': ['cisa', 'kev', 'known exploited vulnerability', 'actively exploited', 'cve', 'exploit', 'vulnerability', '脆弱性', '悪用', '既知の悪用']
});

module.exports = { PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_RUNTIME_WAVE4, ROUTING_OVERRIDES_RUNTIME_WAVE4 };
