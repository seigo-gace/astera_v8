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
  })
]);

const ROUTING_OVERRIDES_RUNTIME_WAVE4 = Object.freeze({
  'cisa-kev-search': ['cisa', 'kev', 'known exploited vulnerability', 'actively exploited', 'cve', 'exploit', 'vulnerability', '脆弱性', '悪用', '既知の悪用'],
  'nih-reporter-project-search': ['nih', 'reporter', 'grant', 'research project', 'funded research', 'federal research', 'research funding', '研究助成', '研究費', '研究プロジェクト']
});

module.exports = { PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_RUNTIME_WAVE4, ROUTING_OVERRIDES_RUNTIME_WAVE4 };
