'use strict';

const PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_ALL_DOMAIN = Object.freeze([
  {
    provider_id: 'mesh-descriptor-search',
    catalog_source_ids: ['MESH'],
    type: 'FREE_OFFICIAL_HTTP',
    enabled: true,
    certified: true,
    source_family_id: 'nlm-mesh',
    priority: 9,
    domains: ['G22', 'G23', 'G24'],
    capabilities: [],
    allowed_hosts: ['id.nlm.nih.gov'],
    smoke_query: 'Ofloxacin',
    endpoints: [{
      endpoint_id: 'mesh-descriptor-lookup',
      url_template: 'https://id.nlm.nih.gov/mesh/lookup/descriptor?label={query}&limit=5',
      response_format: 'JSON',
      records_path: '',
      authority_id: 'nlm-mesh',
      publisher_name: 'U.S. National Library of Medicine',
      capability_id: 'medical_subject_heading_search',
      maximum_records: 5,
      timeout_ms: 10000,
      request_headers: { Accept: 'application/json' },
      field_map: {
        canonical_record_id: 'resource',
        canonical_url: 'resource',
        title: 'label',
        excerpt: { path: 'label', default: '' }
      },
      fixed_fields: {
        source_role: 'OFFICIAL',
        language: 'en',
        rights: { access: 'public', reuse: 'source_specific' }
      }
    }],
    routing_terms: ['mesh', 'medical subject heading', 'biomedical vocabulary', 'subject heading', '医学件名', '医療用語', '生物医学']
  },
  {
    provider_id: 'gemet-search',
    catalog_source_ids: ['GEMET'],
    type: 'FREE_OFFICIAL_HTTP',
    enabled: true,
    certified: true,
    source_family_id: 'eea-gemet',
    priority: 9,
    domains: ['G05', 'G21', 'G24', 'G27'],
    capabilities: [],
    allowed_hosts: ['www.eionet.europa.eu'],
    smoke_query: 'air',
    endpoints: [{
      endpoint_id: 'gemet-keyword-search',
      url_template: 'https://www.eionet.europa.eu/gemet/getConceptsMatchingKeyword?keyword={query}&search_mode=4&thesaurus_uri=http%3A%2F%2Fwww.eionet.europa.eu%2Fgemet%2Fconcept%2F&language=en',
      response_format: 'JSON',
      records_path: '',
      authority_id: 'eea-gemet',
      publisher_name: 'European Environment Agency / Eionet',
      capability_id: 'environmental_thesaurus_search',
      maximum_records: 20,
      timeout_ms: 10000,
      field_map: {
        canonical_record_id: 'uri',
        canonical_url: 'uri',
        title: { path: 'preferredLabel.string', default: '' },
        excerpt: { path: 'definition.string', default: '' },
        fields: { language: { path: 'preferredLabel.language', default: 'en' } }
      },
      fixed_fields: {
        source_role: 'OFFICIAL',
        language: 'en',
        rights: { access: 'public', reuse: 'source_specific' }
      }
    }],
    routing_terms: ['environment', 'climate', 'pollution', 'ecosystem', 'energy', 'environmental thesaurus', '環境', '気候', '汚染', '生態系', 'エネルギー']
  },
  {
    provider_id: 'world-bank-documents',
    catalog_source_ids: ['WORLD_BANK_DOCS'],
    type: 'FREE_OFFICIAL_HTTP',
    enabled: true,
    certified: true,
    source_family_id: 'world-bank-documents',
    priority: 14,
    domains: ['G05', 'G06', 'G07', 'G09', 'G10', 'G11', 'G12', 'G13', 'G17', 'G21', 'G24', 'G27', 'G28', 'G33', 'G37'],
    capabilities: [],
    allowed_hosts: ['search.worldbank.org'],
    smoke_query: 'climate',
    endpoints: [{
      endpoint_id: 'world-bank-document-search',
      url_template: 'https://search.worldbank.org/api/v3/wds?format=json&qterm={query}&rows=5&os=0&fl=id,display_title,abstracts,docdt,url,count,docty',
      response_format: 'JSON',
      records_path: 'documents',
      records_mode: 'OBJECT_VALUES',
      authority_id: 'world-bank',
      publisher_name: 'World Bank',
      capability_id: 'development_document_search',
      maximum_records: 5,
      timeout_ms: 12000,
      maximum_attempts: 2,
      field_map: {
        canonical_record_id: 'id',
        canonical_url: { path: 'url', default: '' },
        title: { path: 'display_title', default: '' },
        excerpt: { path: 'abstracts', default: '' },
        published_at: { path: 'docdt', default: null },
        fields: {
          country: { path: 'count', default: '' },
          document_type: { path: 'docty', default: '' }
        }
      },
      fixed_fields: {
        source_role: 'OFFICIAL',
        language: 'und',
        rights: { access: 'public', reuse: 'source_specific' }
      }
    }],
    routing_terms: ['world bank', 'development', 'poverty', 'trade', 'economy', 'public policy', 'infrastructure', 'development finance', '世界銀行', '開発', '貧困', '経済', '公共政策']
  },
  {
    provider_id: 'terraform-registry-search',
    catalog_source_ids: ['TERRAFORM_REGISTRY'],
    type: 'FREE_PUBLIC_HTTP',
    enabled: true,
    certified: true,
    source_family_id: 'terraform-registry',
    priority: 9,
    domains: ['G29', 'G31', 'G32', 'G36'],
    capabilities: [],
    allowed_hosts: ['registry.terraform.io'],
    smoke_query: 'network',
    endpoints: [{
      endpoint_id: 'terraform-module-search',
      url_template: 'https://registry.terraform.io/v1/modules/search?q={query}&limit=5',
      response_format: 'JSON',
      records_path: 'modules',
      authority_id: 'terraform-registry',
      publisher_name: 'HashiCorp Terraform Registry',
      capability_id: 'infrastructure_module_registry_search',
      maximum_records: 5,
      timeout_ms: 10000,
      field_map: {
        canonical_record_id: 'id',
        canonical_url: { path: 'source', default: '' },
        title: 'id',
        excerpt: { path: 'description', default: '' },
        published_at: { path: 'published_at', default: null },
        fields: {
          version: { path: 'version', default: '' },
          provider: { path: 'provider', default: '' },
          downloads: { path: 'downloads', default: 0 },
          verified: { path: 'verified', default: false }
        }
      },
      fixed_fields: {
        source_role: 'SECONDARY',
        language: 'und',
        rights: { access: 'public', reuse: 'registry_metadata' }
      }
    }],
    routing_terms: ['terraform', 'infrastructure as code', 'iac', 'provider', 'module', 'cloud infrastructure', 'インフラ', '構成管理', 'terraform module']
  },
  {
    provider_id: 'nuget-search',
    catalog_source_ids: ['NUGET'],
    type: 'FREE_PUBLIC_HTTP',
    enabled: true,
    certified: true,
    source_family_id: 'nuget',
    priority: 9,
    domains: ['G29'],
    capabilities: [],
    allowed_hosts: ['api-v2v3search-0.nuget.org'],
    smoke_query: 'json',
    endpoints: [{
      endpoint_id: 'nuget-package-search',
      url_template: 'https://api-v2v3search-0.nuget.org/query?q={query}&skip=0&take=5&prerelease=false',
      response_format: 'JSON',
      records_path: 'data',
      authority_id: 'nuget',
      publisher_name: 'NuGet',
      capability_id: 'dotnet_package_registry_search',
      maximum_records: 5,
      timeout_ms: 10000,
      request_headers: { Accept: 'application/json' },
      field_map: {
        canonical_record_id: 'id',
        canonical_url: { path: 'projectUrl', default: '' },
        title: 'id',
        excerpt: { path: 'description', default: '' },
        fields: {
          version: { path: 'version', default: '' },
          authors: { path: 'authors', stringify: true },
          total_downloads: { path: 'totalDownloads', default: 0 }
        }
      },
      fixed_fields: {
        source_role: 'SECONDARY',
        language: 'und',
        rights: { access: 'public', reuse: 'registry_metadata' }
      }
    }],
    routing_terms: ['nuget', '.net', 'dotnet', 'c#', 'f#', 'visual basic', 'package', 'dependency', 'パッケージ', '依存関係']
  },
  {
    provider_id: 'crates-io-search',
    catalog_source_ids: ['CRATES_IO'],
    type: 'FREE_PUBLIC_HTTP',
    enabled: true,
    certified: true,
    source_family_id: 'crates-io',
    priority: 9,
    domains: ['G29'],
    capabilities: [],
    allowed_hosts: ['crates.io'],
    smoke_query: 'serde',
    endpoints: [{
      endpoint_id: 'crates-io-crate-search',
      url_template: 'https://crates.io/api/v1/crates?q={query}&per_page=5&page=1',
      response_format: 'JSON',
      records_path: 'crates',
      authority_id: 'crates-io',
      publisher_name: 'crates.io',
      capability_id: 'rust_crate_registry_search',
      maximum_records: 5,
      timeout_ms: 10000,
      request_headers: { Accept: 'application/json', 'User-Agent': 'Astera-Evidence-Search/2.4 (public evidence retrieval)' },
      field_map: {
        canonical_record_id: 'id',
        canonical_url: { path: 'repository', default: '' },
        title: 'name',
        excerpt: { path: 'description', default: '' },
        updated_at: { path: 'updated_at', default: null },
        fields: {
          max_version: { path: 'max_version', default: '' },
          downloads: { path: 'downloads', default: 0 },
          homepage: { path: 'homepage', default: '' }
        }
      },
      fixed_fields: {
        source_role: 'SECONDARY',
        language: 'und',
        rights: { access: 'public', reuse: 'registry_metadata' }
      }
    }],
    routing_terms: ['rust', 'cargo', 'crate', 'crates.io', 'package', 'dependency', 'パッケージ', '依存関係']
  },
  {
    provider_id: 'rxnorm-search',
    catalog_source_ids: ['RXNORM'],
    type: 'FREE_OFFICIAL_HTTP',
    enabled: true,
    certified: true,
    source_family_id: 'nlm-rxnorm',
    priority: 8,
    domains: ['G22', 'G23', 'G24'],
    capabilities: [],
    allowed_hosts: ['rxnav.nlm.nih.gov'],
    smoke_query: 'aspirin',
    endpoints: [{
      endpoint_id: 'rxnorm-approximate-term',
      url_template: 'https://rxnav.nlm.nih.gov/REST/Prescribe/approximateTerm.json?term={query}&maxEntries=5&option=1',
      response_format: 'JSON',
      records_path: 'approximateGroup.candidate',
      authority_id: 'nlm-rxnorm',
      publisher_name: 'U.S. National Library of Medicine RxNorm',
      capability_id: 'normalized_drug_concept_search',
      maximum_records: 5,
      timeout_ms: 10000,
      field_map: {
        canonical_record_id: 'rxcui',
        title: { path: 'name', default: '' },
        excerpt: { path: 'source', default: '' },
        fields: {
          rxaui: { path: 'rxaui', default: '' },
          score: { path: 'score', default: '' },
          rank: { path: 'rank', default: '' },
          source_vocabulary: { path: 'source', default: '' }
        }
      },
      fixed_fields: {
        source_role: 'OFFICIAL',
        language: 'en',
        rights: { access: 'public', reuse: 'source_specific' }
      }
    }],
    routing_terms: ['rxnorm', 'drug', 'medicine', 'medication', 'prescription', 'pharmacy', '医薬品', '薬', '処方', '薬学']
  },
  {
    provider_id: 'dailymed-search',
    catalog_source_ids: ['DAILYMED'],
    type: 'FREE_OFFICIAL_HTTP',
    enabled: true,
    certified: true,
    source_family_id: 'nlm-dailymed',
    priority: 8,
    domains: ['G23', 'G24'],
    capabilities: [],
    allowed_hosts: ['dailymed.nlm.nih.gov'],
    smoke_query: 'aspirin',
    endpoints: [{
      endpoint_id: 'dailymed-drug-name-search',
      url_template: 'https://dailymed.nlm.nih.gov/dailymed/services/v2/drugnames.json?drug_name={query}&pagesize=5&page=1',
      response_format: 'JSON',
      records_path: 'data',
      authority_id: 'nlm-dailymed',
      publisher_name: 'DailyMed / U.S. National Library of Medicine',
      capability_id: 'structured_product_label_drug_name_search',
      maximum_records: 5,
      timeout_ms: 10000,
      field_map: {
        canonical_record_id: 'drug_name',
        title: 'drug_name',
        excerpt: { path: 'name_type', default: '' },
        fields: { name_type: { path: 'name_type', default: '' } }
      },
      fixed_fields: {
        source_role: 'OFFICIAL',
        language: 'en',
        rights: { access: 'public', reuse: 'source_specific' }
      }
    }],
    routing_terms: ['dailymed', 'drug label', 'medication label', 'structured product label', 'spl', '医薬品', '添付文書', '薬剤']
  },
  {
    provider_id: 'oeis-search',
    catalog_source_ids: ['OEIS'],
    type: 'FREE_PUBLIC_HTTP',
    enabled: true,
    certified: true,
    source_family_id: 'oeis',
    priority: 12,
    domains: ['G18', 'G37'],
    capabilities: [],
    allowed_hosts: ['oeis.org'],
    smoke_query: 'A001011',
    endpoints: [{
      endpoint_id: 'oeis-json-search',
      url_template: 'https://oeis.org/search?q={query}&fmt=json',
      response_format: 'JSON',
      records_path: 'results',
      authority_id: 'oeis',
      publisher_name: 'OEIS Foundation Inc.',
      capability_id: 'integer_sequence_search',
      maximum_records: 10,
      timeout_ms: 10000,
      field_map: {
        canonical_record_id: { path: 'number', stringify: true },
        title: { path: 'name', default: '' },
        excerpt: { path: 'data', default: '' },
        fields: {
          offset: { path: 'offset', default: '' },
          author: { path: 'author', default: '' },
          keywords: { path: 'keyword', default: '' }
        }
      },
      fixed_fields: {
        source_role: 'SECONDARY',
        language: 'en',
        rights: { access: 'public', reuse: 'source_specific' }
      }
    }],
    routing_terms: ['oeis', 'integer sequence', 'sequence', 'number theory', 'fibonacci', 'mathematics', '整数列', '数列', '数学']
  },
  {
    provider_id: 'worms-search',
    catalog_source_ids: ['WORMS'],
    type: 'FREE_PUBLIC_HTTP',
    enabled: true,
    certified: true,
    source_family_id: 'worms',
    priority: 11,
    domains: ['G22', 'G24', 'G37'],
    capabilities: [],
    allowed_hosts: ['www.marinespecies.org'],
    smoke_query: 'Gadus morhua',
    endpoints: [{
      endpoint_id: 'worms-name-search',
      url_template: 'https://www.marinespecies.org/rest/AphiaRecordsByName/{query}?like=true&marine_only=true&offset=1',
      response_format: 'JSON',
      records_path: '',
      authority_id: 'worms',
      publisher_name: 'World Register of Marine Species',
      capability_id: 'marine_taxonomy_search',
      maximum_records: 10,
      timeout_ms: 10000,
      field_map: {
        canonical_record_id: { path: 'AphiaID', stringify: true },
        canonical_url: { path: 'url', default: '' },
        title: { path: 'scientificname', default: '' },
        excerpt: { path: 'authority', default: '' },
        updated_at: { path: 'modified', default: null },
        fields: {
          rank: { path: 'rank', default: '' },
          status: { path: 'status', default: '' },
          valid_name: { path: 'valid_name', default: '' }
        }
      },
      fixed_fields: {
        source_role: 'SECONDARY',
        language: 'und',
        rights: { access: 'public', reuse: 'source_specific' }
      }
    }],
    routing_terms: ['worms', 'marine species', 'taxonomy', 'ocean', 'fish', 'marine biology', '海洋生物', '分類学', '水産', '魚類']
  },
  {
    provider_id: 'federal-register-search',
    catalog_source_ids: ['FEDERAL_REGISTER'],
    type: 'FREE_OFFICIAL_HTTP',
    enabled: true,
    certified: true,
    source_family_id: 'federal-register',
    priority: 8,
    domains: ['G07', 'G08', 'G32', 'G33', 'G34', 'G35', 'G37'],
    capabilities: [],
    allowed_hosts: ['www.federalregister.gov'],
    smoke_query: 'climate',
    endpoints: [{
      endpoint_id: 'federal-register-document-search',
      url_template: 'https://www.federalregister.gov/api/v1/documents.json?per_page=5&conditions%5Bterm%5D={query}',
      response_format: 'JSON',
      records_path: 'results',
      authority_id: 'office-federal-register',
      publisher_name: 'FederalRegister.gov',
      capability_id: 'us_federal_rulemaking_document_search',
      maximum_records: 5,
      timeout_ms: 10000,
      field_map: {
        canonical_record_id: 'document_number',
        canonical_url: { path: 'html_url', default: '' },
        title: 'title',
        excerpt: { path: 'abstract', default: '' },
        published_at: { path: 'publication_date', default: null },
        fields: {
          document_type: { path: 'type', default: '' },
          agencies: { path: 'agencies', stringify: true }
        }
      },
      fixed_fields: {
        source_role: 'OFFICIAL',
        language: 'en',
        rights: { access: 'public', reuse: 'public_metadata' }
      }
    }],
    routing_terms: ['federal register', 'regulation', 'rulemaking', 'rule', 'notice', 'executive order', 'federal agency', '規制', '法令', '行政', '連邦政府']
  }
]);

const ROUTING_OVERRIDES_ALL_DOMAIN = Object.freeze(Object.fromEntries(
  PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_ALL_DOMAIN
    .filter((provider) => Array.isArray(provider.routing_terms) && provider.routing_terms.length)
    .map((provider) => [provider.provider_id, Object.freeze([...provider.routing_terms])])
));

module.exports = {
  PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_ALL_DOMAIN,
  ROUTING_OVERRIDES_ALL_DOMAIN
};
