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
  }),
  Object.freeze({
    provider_id: 'nih-reporter-project-search',
    catalog_source_ids: ['NIH_REPORTER_VERIFIED'],
    type: 'POST_JSON',
    enabled: true,
    certified: true,
    source_family_id: 'nih-reporter',
    priority: 7,
    domains: ['G37'],
    capabilities: [],
    allowed_hosts: ['api.reporter.nih.gov'],
    smoke_query: 'brain disorder',
    endpoint: {
      endpoint_id: 'nih-reporter-project-search',
      url: 'https://api.reporter.nih.gov/v2/projects/search',
      request_body: {
        criteria: {
          advanced_text_search: {
            operator: 'and',
            search_field: 'projecttitle,abstracttext,terms',
            search_text: '{query}'
          }
        },
        include_fields: ['ApplId', 'ProjectNum', 'ProjectTitle', 'AbstractText', 'FiscalYear', 'AwardAmount', 'Organization', 'PrincipalInvestigators', 'ProjectStartDate', 'ProjectEndDate', 'ProjectDetailUrl'],
        offset: 0,
        limit: 10
      },
      records_path: 'results',
      authority_id: 'nih-reporter',
      publisher_name: 'U.S. National Institutes of Health',
      capability_id: 'federal_research_project_search',
      maximum_records: 10,
      max_request_bytes: 64 * 1024,
      max_response_bytes: 8 * 1024 * 1024,
      timeout_ms: 8000,
      maximum_attempts: 2,
      request_headers: { Accept: 'application/json' },
      field_map: {
        canonical_record_id: { path: 'appl_id', stringify: true },
        canonical_url: { path: 'project_detail_url', default: '' },
        title: { path: 'project_title', default: '' },
        excerpt: { path: 'abstract_text', default: '' },
        fields: {
          project_num: { path: 'project_num', default: '' },
          fiscal_year: { path: 'fiscal_year', default: null },
          award_amount: { path: 'award_amount', default: null },
          organization: { path: 'organization', stringify: true },
          principal_investigators: { path: 'principal_investigators', stringify: true },
          project_start_date: { path: 'project_start_date', default: null },
          project_end_date: { path: 'project_end_date', default: null }
        }
      },
      fixed_fields: {
        source_role: 'OFFICIAL',
        language: 'en',
        rights: { access: 'public', reuse: 'public_data' }
      }
    },
    routing_terms: ['nih', 'reporter', 'grant', 'research project', 'funded research', 'federal research', 'research funding', '研究助成', '研究費', '研究プロジェクト']
  }),
  Object.freeze({
    provider_id: 'onet-occupation-search',
    catalog_source_ids: ['ONET_VERIFIED'],
    type: 'SEARCH_DETAIL_HTML',
    enabled: true,
    certified: true,
    source_family_id: 'onet-online',
    priority: 8,
    domains: ['G12'],
    capabilities: [],
    allowed_hosts: ['www.onetonline.org'],
    smoke_query: 'software developer',
    authority_id: 'us-dol-onet',
    publisher_name: 'U.S. Department of Labor / O*NET',
    search: {
      url_template: 'https://www.onetonline.org/find/quick?s={query}',
      href_regex: "href=[\"'](/link/summary/[0-9]{2}-[0-9]{4}\\.[0-9]{2})[\"']",
      maximum_records: 5,
      maximum_excerpt_chars: 16000,
      timeout_ms: 12000
    },
    routing_terms: ['onet', 'occupation', 'job', 'career', 'skills', 'employment', '職業', '仕事', '職種', '技能', 'キャリア']
  }),
  Object.freeze({
    provider_id: 'clojars-project-search',
    catalog_source_ids: ['CLOJARS_VERIFIED'],
    type: 'SEARCH_DETAIL_HTML',
    enabled: true,
    certified: true,
    source_family_id: 'clojars',
    priority: 8,
    domains: ['G29'],
    capabilities: [],
    allowed_hosts: ['clojars.org', 'www.clojars.org'],
    smoke_query: 'encore',
    authority_id: 'clojars',
    publisher_name: 'Clojars',
    search: {
      url_template: 'https://clojars.org/search?q={query}',
      href_regex: "href=[\"'](/(?:[A-Za-z0-9_.-]+/)[A-Za-z0-9_.-]+)[\"']",
      maximum_records: 5,
      maximum_excerpt_chars: 12000,
      timeout_ms: 12000
    },
    routing_terms: ['clojars', 'clojure', 'clojurescript', 'leiningen', 'clojure package', 'Clojure', 'ClojureScript', 'パッケージ']
  }),
  Object.freeze({
    provider_id: 'simbad-object-search',
    catalog_source_ids: ['SIMBAD_VERIFIED'],
    type: 'FREE_OFFICIAL_HTTP',
    enabled: true,
    certified: true,
    source_family_id: 'cds-simbad',
    priority: 8,
    domains: ['G19'],
    capabilities: [],
    allowed_hosts: ['simbad.cds.unistra.fr'],
    smoke_query: 'Sirius',
    endpoints: [{
      endpoint_id: 'simbad-identifier-record',
      url_template: 'https://simbad.cds.unistra.fr/simbad/sim-id?Ident={query}',
      request_headers: { Accept: 'text/html,application/xhtml+xml' },
      response_format: 'TEXT',
      title: 'SIMBAD astronomical object record',
      authority_id: 'cds-simbad',
      publisher_name: 'CDS / Université de Strasbourg',
      capability_id: 'astronomical_object_identifier_search',
      maximum_records: 1,
      maximum_excerpt_chars: 32768,
      timeout_ms: 12000,
      fixed_fields: {
        source_role: 'OFFICIAL',
        language: 'und',
        rights: { access: 'public', reuse: 'source_specific' }
      }
    }],
    routing_terms: ['simbad', 'star', 'astronomy', 'astronomical object', 'identifier', '天文', '恒星', '天体', '星']
  }),
  Object.freeze({
    provider_id: 'nist-osac-registry-search',
    catalog_source_ids: ['NIST_OSAC_VERIFIED'],
    type: 'FREE_OFFICIAL_HTTP',
    enabled: true,
    certified: true,
    source_family_id: 'nist-osac',
    priority: 8,
    domains: ['G34'],
    capabilities: [],
    allowed_hosts: ['www.nist.gov'],
    smoke_query: 'E2916',
    endpoints: [{
      endpoint_id: 'nist-osac-registry-filter',
      url_template: 'https://www.nist.gov/osac/registry?k={query}',
      request_headers: { Accept: 'text/html,application/xhtml+xml' },
      response_format: 'TEXT',
      title: 'NIST OSAC Registry filtered records',
      authority_id: 'nist-osac',
      publisher_name: 'National Institute of Standards and Technology',
      capability_id: 'forensic_standard_registry_search',
      maximum_records: 1,
      maximum_excerpt_chars: 65536,
      timeout_ms: 12000,
      fixed_fields: {
        source_role: 'OFFICIAL',
        language: 'en',
        rights: { access: 'public', reuse: 'source_specific' }
      }
    }],
    routing_terms: ['nist osac', 'osac', 'forensic standard', 'forensic science', 'digital evidence', 'forensics', '法科学', 'デジタルフォレンジック', '鑑識']
  }),
  Object.freeze({
    provider_id: 'nasa-cmr-collection-search',
    catalog_source_ids: ['NASA_CMR_VERIFIED'],
    type: 'FREE_OFFICIAL_HTTP',
    enabled: true,
    certified: true,
    source_family_id: 'nasa-earthdata-cmr',
    priority: 6,
    domains: ['G05', 'G21', 'G37'],
    capabilities: [],
    allowed_hosts: ['cmr.earthdata.nasa.gov'],
    smoke_query: 'climate',
    endpoints: [{
      endpoint_id: 'nasa-cmr-collection-keyword-search',
      url_template: 'https://cmr.earthdata.nasa.gov/search/collections.json?keyword={query}&page_size=5',
      request_headers: { Accept: 'application/json' },
      response_format: 'JSON',
      records_path: 'feed.entry',
      authority_id: 'nasa-eosdis-cmr',
      publisher_name: 'NASA Earth Science Data and Information System / Common Metadata Repository',
      capability_id: 'earth_science_collection_search',
      maximum_records: 5,
      maximum_excerpt_chars: 32768,
      timeout_ms: 12000,
      maximum_attempts: 2,
      field_map: {
        canonical_record_id: 'id',
        canonical_url: { path: 'links.0.href', default: '' },
        title: { path: 'title', default: '' },
        excerpt: { path: 'summary', default: '' },
        updated_at: { path: 'updated', default: null },
        fields: {
          dataset_id: { path: 'dataset_id', default: '' },
          short_name: { path: 'short_name', default: '' },
          version_id: { path: 'version_id', default: '' },
          data_center: { path: 'data_center', default: '' }
        }
      },
      fixed_fields: {
        source_role: 'OFFICIAL',
        language: 'en',
        rights: { access: 'public', reuse: 'public_metadata' }
      }
    }],
    routing_terms: ['nasa earthdata', 'cmr', 'earth science', 'earth observation', 'remote sensing', 'climate', 'satellite', '地球観測', 'リモートセンシング', '気候', '衛星']
  })
]);

const ROUTING_OVERRIDES_RUNTIME_WAVE4 = Object.freeze({
  'cisa-kev-search': ['cisa', 'kev', 'known exploited vulnerability', 'actively exploited', 'cve', 'exploit', 'vulnerability', '脆弱性', '悪用', '既知の悪用'],
  'nih-reporter-project-search': ['nih', 'reporter', 'grant', 'research project', 'funded research', 'federal research', 'research funding', '研究助成', '研究費', '研究プロジェクト'],
  'onet-occupation-search': ['onet', 'occupation', 'job', 'career', 'skills', 'employment', '職業', '仕事', '職種', '技能', 'キャリア'],
  'clojars-project-search': ['clojars', 'clojure', 'clojurescript', 'leiningen', 'clojure package', 'Clojure', 'ClojureScript', 'パッケージ'],
  'simbad-object-search': ['simbad', 'star', 'astronomy', 'astronomical object', 'identifier', '天文', '恒星', '天体', '星'],
  'nist-osac-registry-search': ['nist osac', 'osac', 'forensic standard', 'forensic science', 'digital evidence', 'forensics', '法科学', 'デジタルフォレンジック', '鑑識'],
  'nasa-cmr-collection-search': ['nasa earthdata', 'cmr', 'earth science', 'earth observation', 'remote sensing', 'climate', 'satellite', '地球観測', 'リモートセンシング', '気候', '衛星']
});

module.exports = { PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_RUNTIME_WAVE4, ROUTING_OVERRIDES_RUNTIME_WAVE4 };
