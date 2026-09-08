'use strict';

const PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_RUNTIME_WAVE5 = Object.freeze([
  Object.freeze({
    provider_id: 'jpl-horizons-target-search',
    catalog_source_ids: ['JPL_HORIZONS_RUNTIME_VERIFIED'],
    type: 'FREE_OFFICIAL_HTTP',
    enabled: true,
    certified: true,
    source_family_id: 'nasa-jpl-horizons',
    priority: 6,
    domains: ['G19'],
    capabilities: [],
    allowed_hosts: ['ssd.jpl.nasa.gov'],
    smoke_query: 'Mars',
    endpoints: [{
      endpoint_id: 'jpl-horizons-target-record',
      url_template: 'https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND={query}&MAKE_EPHEM=NO&OBJ_DATA=YES',
      request_headers: { Accept: 'text/plain' },
      response_format: 'TEXT',
      title: 'NASA/JPL Horizons target record',
      authority_id: 'nasa-jpl-horizons',
      publisher_name: 'NASA Jet Propulsion Laboratory',
      capability_id: 'solar_system_target_lookup',
      maximum_records: 1,
      maximum_excerpt_chars: 65536,
      timeout_ms: 12000,
      maximum_attempts: 2,
      fixed_fields: { source_role: 'OFFICIAL', language: 'en', rights: { access: 'public', reuse: 'public_data' } }
    }],
    routing_terms: ['jpl horizons', 'horizons', 'ephemeris', 'planet', 'asteroid', 'comet', 'orbit', '天体暦', '惑星', '小惑星', '彗星']
  }),
  Object.freeze({
    provider_id: 'redhat-cve-record-search',
    catalog_source_ids: ['REDHAT_CVE_RUNTIME_VERIFIED'],
    type: 'FREE_OFFICIAL_HTTP',
    enabled: true,
    certified: true,
    source_family_id: 'redhat-product-security',
    priority: 6,
    domains: ['G29', 'G31'],
    capabilities: [],
    allowed_hosts: ['access.redhat.com'],
    smoke_query: 'CVE-2024-3094',
    endpoints: [{
      endpoint_id: 'redhat-cve-record',
      url_template: 'https://access.redhat.com/security/cve/{query}',
      request_headers: { Accept: 'text/html,application/xhtml+xml' },
      response_format: 'TEXT',
      title: 'Red Hat CVE record',
      authority_id: 'redhat-product-security',
      publisher_name: 'Red Hat Product Security',
      capability_id: 'vendor_cve_record_lookup',
      maximum_records: 1,
      maximum_excerpt_chars: 65536,
      timeout_ms: 12000,
      maximum_attempts: 2,
      fixed_fields: { source_role: 'OFFICIAL', language: 'en', rights: { access: 'public', reuse: 'source_specific' } }
    }],
    routing_terms: ['red hat', 'redhat', 'cve', 'rhel', 'security advisory', 'vulnerability', '脆弱性', 'CVE']
  }),
  Object.freeze({
    provider_id: 'rcsb-pdb-entry-search',
    catalog_source_ids: ['RCSB_PDB_RUNTIME_VERIFIED'],
    type: 'FREE_OFFICIAL_HTTP',
    enabled: true,
    certified: true,
    source_family_id: 'rcsb-pdb',
    priority: 6,
    domains: ['G20', 'G22'],
    capabilities: [],
    allowed_hosts: ['data.rcsb.org'],
    smoke_query: '4HHB',
    endpoints: [{
      endpoint_id: 'rcsb-pdb-entry-record',
      url_template: 'https://data.rcsb.org/rest/v1/core/entry/{query}',
      request_headers: { Accept: 'application/json' },
      response_format: 'JSON',
      records_path: '',
      authority_id: 'rcsb-pdb',
      publisher_name: 'RCSB Protein Data Bank',
      capability_id: 'protein_structure_record_lookup',
      maximum_records: 1,
      timeout_ms: 12000,
      maximum_attempts: 2,
      field_map: {
        canonical_record_id: 'rcsb_id',
        title: { path: 'struct.title', default: '' },
        excerpt: { path: 'struct.title', default: '' },
        fields: {
          experimental_methods: { path: 'exptl', stringify: true },
          resolution: { path: 'rcsb_entry_info.resolution_combined', stringify: true },
          deposition_date: { path: 'rcsb_accession_info.deposit_date', default: null },
          release_date: { path: 'rcsb_accession_info.initial_release_date', default: null }
        }
      },
      fixed_fields: { source_role: 'OFFICIAL', language: 'en', rights: { access: 'public', reuse: 'public_metadata' } }
    }],
    routing_terms: ['rcsb', 'pdb', 'protein structure', 'crystal structure', 'macromolecule', 'protein data bank', 'タンパク質', '構造']
  }),
  Object.freeze({
    provider_id: 'usgs-fdsn-event-record-search',
    catalog_source_ids: ['USGS_FDSN_RUNTIME_VERIFIED'],
    type: 'FREE_OFFICIAL_HTTP',
    enabled: true,
    certified: true,
    source_family_id: 'usgs-earthquake-fdsn',
    priority: 6,
    domains: ['G05', 'G21'],
    capabilities: [],
    allowed_hosts: ['earthquake.usgs.gov'],
    smoke_query: 'usp000hvnu',
    endpoints: [{
      endpoint_id: 'usgs-fdsn-event-record',
      url_template: 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&eventid={query}',
      request_headers: { Accept: 'application/geo+json,application/json' },
      response_format: 'JSON',
      records_path: '',
      authority_id: 'usgs-earthquake-hazards',
      publisher_name: 'U.S. Geological Survey',
      capability_id: 'earthquake_event_record_lookup',
      maximum_records: 1,
      timeout_ms: 12000,
      maximum_attempts: 2,
      field_map: {
        canonical_record_id: 'id',
        canonical_url: { path: 'properties.url', default: '' },
        title: { path: 'properties.title', default: '' },
        excerpt: { path: 'properties.place', default: '' },
        fields: {
          magnitude: { path: 'properties.mag', default: null },
          event_time: { path: 'properties.time', default: null },
          updated: { path: 'properties.updated', default: null },
          status: { path: 'properties.status', default: '' },
          coordinates: { path: 'geometry.coordinates', stringify: true }
        }
      },
      fixed_fields: { source_role: 'OFFICIAL', language: 'en', rights: { access: 'public', reuse: 'public_data' } }
    }],
    routing_terms: ['usgs', 'earthquake', 'fdsn', 'seismic', 'event id', '地震', '震源', 'USGS']
  }),
  Object.freeze({
    provider_id: 'huggingface-hub-live-search',
    catalog_source_ids: ['HUGGINGFACE_HUB'],
    type: 'FREE_OFFICIAL_HTTP',
    enabled: true,
    certified: true,
    source_family_id: 'huggingface-hub',
    priority: 6,
    domains: ['G29', 'G30', 'G37'],
    capabilities: [],
    allowed_hosts: ['huggingface.co'],
    smoke_query: 'bert',
    endpoints: [{
      endpoint_id: 'huggingface-model-search',
      url_template: 'https://huggingface.co/api/models?search={query}&limit=10&full=true',
      request_headers: { Accept: 'application/json' },
      response_format: 'JSON',
      records_path: '',
      authority_id: 'huggingface-hub',
      publisher_name: 'Hugging Face',
      capability_id: 'model_repository_search',
      maximum_records: 10,
      timeout_ms: 12000,
      maximum_attempts: 2,
      field_map: {
        canonical_record_id: 'id',
        title: { path: 'id', default: '' },
        excerpt: { path: 'tags', stringify: true },
        updated_at: { path: 'lastModified', default: null },
        fields: {
          pipeline_tag: { path: 'pipeline_tag', default: '' },
          library_name: { path: 'library_name', default: '' },
          downloads: { path: 'downloads', default: null },
          likes: { path: 'likes', default: null },
          private: { path: 'private', default: false }
        }
      },
      fixed_fields: { source_role: 'OFFICIAL', language: 'und', rights: { access: 'public', reuse: 'source_specific' } }
    }],
    routing_terms: ['hugging face', 'huggingface', 'model', 'dataset', 'transformers', 'machine learning model', 'AI model', 'モデル', '機械学習']
  }),
  Object.freeze({
    provider_id: 'debian-security-tracker-record-search',
    catalog_source_ids: ['DEBIAN_SECURITY_TRACKER_RUNTIME_VERIFIED'],
    type: 'FREE_OFFICIAL_HTTP',
    enabled: true,
    certified: true,
    source_family_id: 'debian-security-tracker',
    priority: 6,
    domains: ['G29', 'G31'],
    capabilities: [],
    allowed_hosts: ['security-tracker.debian.org'],
    smoke_query: 'CVE-2021-44228',
    endpoints: [{
      endpoint_id: 'debian-security-tracker-record',
      url_template: 'https://security-tracker.debian.org/tracker/{query}',
      request_headers: { Accept: 'text/html,application/xhtml+xml' },
      response_format: 'TEXT',
      title: 'Debian Security Tracker vulnerability record',
      authority_id: 'debian-security-team',
      publisher_name: 'Debian Security Team',
      capability_id: 'debian_vulnerability_record_lookup',
      maximum_records: 1,
      maximum_excerpt_chars: 65536,
      timeout_ms: 12000,
      maximum_attempts: 2,
      fixed_fields: { source_role: 'OFFICIAL', language: 'en', rights: { access: 'public', reuse: 'source_specific' } }
    }],
    routing_terms: ['debian security tracker', 'debian', 'cve', 'vulnerability', 'security tracker', '脆弱性', 'CVE']
  }),
  Object.freeze({
    provider_id: 'artic-artworks-search',
    catalog_source_ids: ['ARTIC_RUNTIME_VERIFIED'],
    type: 'FREE_OFFICIAL_HTTP',
    enabled: true,
    certified: true,
    source_family_id: 'art-institute-chicago',
    priority: 6,
    domains: ['G16'],
    capabilities: [],
    allowed_hosts: ['api.artic.edu'],
    smoke_query: 'Water Lilies',
    endpoints: [{
      endpoint_id: 'artic-artworks-search',
      url_template: 'https://api.artic.edu/api/v1/artworks/search?q={query}&limit=5&fields=id,title,artist_display,date_display,api_link',
      request_headers: { Accept: 'application/json' },
      response_format: 'JSON',
      records_path: 'data',
      authority_id: 'art-institute-chicago',
      publisher_name: 'Art Institute of Chicago',
      capability_id: 'museum_artwork_search',
      maximum_records: 5,
      timeout_ms: 12000,
      maximum_attempts: 2,
      field_map: {
        canonical_record_id: 'id',
        canonical_url: { path: 'api_link', default: '' },
        title: { path: 'title', default: '' },
        excerpt: { path: 'artist_display', default: '' },
        fields: {
          artist_display: { path: 'artist_display', default: '' },
          date_display: { path: 'date_display', default: '' }
        }
      },
      fixed_fields: { source_role: 'OFFICIAL', language: 'und', rights: { access: 'public', reuse: 'source_specific' } }
    }],
    routing_terms: ['art institute of chicago', 'artic', 'museum', 'artwork', 'painting', 'water lilies', '美術館', '美術', '作品']
  })
]);

const ROUTING_OVERRIDES_RUNTIME_WAVE5 = Object.freeze(
  Object.fromEntries(PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_RUNTIME_WAVE5.map((provider) => [provider.provider_id, provider.routing_terms]))
);

const RUNTIME_SOURCES_WAVE5 = Object.freeze([
  Object.freeze({
    source_id: 'JPL_HORIZONS_RUNTIME_VERIFIED',
    name: 'JPL Horizons API',
    authority: 'NASA Jet Propulsion Laboratory',
    official_url: 'https://ssd-api.jpl.nasa.gov/doc/horizons.html',
    category: 'VERIFIED_OFFICIAL_KB',
    baseline_registry: false,
    domains: ['G19'],
    retrieval_strategy: 'LIVE_TEXT_RECORD',
    runtime_state: 'SEARCHABLE',
    provider_id: 'jpl-horizons-target-search',
    jurisdiction_scope: 'GLOBAL',
    supports_jurisdiction_filter: false
  }),
  Object.freeze({
    source_id: 'REDHAT_CVE_RUNTIME_VERIFIED',
    name: 'Red Hat CVE Database',
    authority: 'Red Hat Product Security',
    official_url: 'https://access.redhat.com/security/cve/',
    category: 'VERIFIED_OFFICIAL_KB',
    baseline_registry: false,
    domains: ['G29', 'G31'],
    retrieval_strategy: 'LIVE_TEXT_RECORD',
    runtime_state: 'SEARCHABLE',
    provider_id: 'redhat-cve-record-search',
    jurisdiction_scope: 'GLOBAL',
    supports_jurisdiction_filter: false
  }),
  Object.freeze({
    source_id: 'RCSB_PDB_RUNTIME_VERIFIED',
    name: 'RCSB Protein Data Bank Search API',
    authority: 'RCSB Protein Data Bank',
    official_url: 'https://www.rcsb.org/docs/programmatic-access/web-apis-overview',
    category: 'VERIFIED_OFFICIAL_KB',
    baseline_registry: false,
    domains: ['G20', 'G22'],
    retrieval_strategy: 'LIVE_JSON_RECORD',
    runtime_state: 'SEARCHABLE',
    provider_id: 'rcsb-pdb-entry-search',
    jurisdiction_scope: 'GLOBAL',
    supports_jurisdiction_filter: false
  }),
  Object.freeze({
    source_id: 'USGS_FDSN_RUNTIME_VERIFIED',
    name: 'USGS FDSN Event',
    authority: 'U.S. Geological Survey',
    official_url: 'https://earthquake.usgs.gov/fdsnws/event/1/',
    category: 'VERIFIED_OFFICIAL_KB',
    baseline_registry: false,
    domains: ['G05', 'G21'],
    retrieval_strategy: 'LIVE_JSON_RECORD',
    runtime_state: 'SEARCHABLE',
    provider_id: 'usgs-fdsn-event-record-search',
    jurisdiction_scope: 'GLOBAL',
    supports_jurisdiction_filter: false
  }),
  Object.freeze({
    source_id: 'DEBIAN_SECURITY_TRACKER_RUNTIME_VERIFIED',
    name: 'Debian Security Tracker',
    authority: 'Debian Security Team',
    official_url: 'https://security-tracker.debian.org/tracker',
    category: 'VERIFIED_OFFICIAL_KB',
    baseline_registry: false,
    domains: ['G29', 'G31'],
    retrieval_strategy: 'LIVE_TEXT_RECORD',
    runtime_state: 'SEARCHABLE',
    provider_id: 'debian-security-tracker-record-search',
    jurisdiction_scope: 'GLOBAL',
    supports_jurisdiction_filter: false
  }),
  Object.freeze({
    source_id: 'ARTIC_RUNTIME_VERIFIED',
    name: 'Art Institute of Chicago API',
    authority: 'Art Institute of Chicago',
    official_url: 'https://api.artic.edu/docs/',
    category: 'VERIFIED_OFFICIAL_KB',
    baseline_registry: false,
    domains: ['G16'],
    retrieval_strategy: 'LIVE_JSON_SEARCH',
    runtime_state: 'SEARCHABLE',
    provider_id: 'artic-artworks-search',
    jurisdiction_scope: 'GLOBAL',
    supports_jurisdiction_filter: false
  })
]);

module.exports = {
  PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_RUNTIME_WAVE5,
  ROUTING_OVERRIDES_RUNTIME_WAVE5,
  RUNTIME_SOURCES_WAVE5
};
