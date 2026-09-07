'use strict';

function textDefinition({ provider_id, source_id, authority, domains, host, url_template, smoke_query, routing_terms = [], headers = {}, public_source = false, direct_record = false }) {
  return Object.freeze({
    provider_id,
    catalog_source_ids: [source_id],
    type: public_source ? 'FREE_PUBLIC_HTTP' : 'FREE_OFFICIAL_HTTP',
    enabled: true,
    certified: true,
    source_family_id: provider_id,
    priority: 8,
    domains,
    capabilities: [],
    allowed_hosts: Array.isArray(host) ? host : [host],
    smoke_query,
    endpoints: [{
      endpoint_id: `${provider_id}-endpoint`,
      url_template,
      response_format: 'TEXT',
      text_record_mode: direct_record ? 'DIRECT_RECORD' : 'DISCOVERY_ONLY',
      authority_id: provider_id,
      publisher_name: authority,
      capability_id: 'world_kb_search',
      maximum_records: 1,
      timeout_ms: 12000,
      request_headers: { Accept: 'text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.5', ...headers },
      fixed_fields: {
        source_role: public_source ? 'SECONDARY' : 'OFFICIAL',
        language: 'und',
        rights: { access: 'public', reuse: 'source_specific' }
      }
    }],
    routing_terms
  });
}

function jsonDefinition({ provider_id, source_id, authority, domains, host, url_template, smoke_query, records_path = '', field_map = {}, routing_terms = [], headers = {}, public_source = false, source_family_id = null }) {
  return Object.freeze({
    provider_id,
    catalog_source_ids: [source_id],
    type: public_source ? 'FREE_PUBLIC_HTTP' : 'FREE_OFFICIAL_HTTP',
    enabled: true,
    certified: true,
    source_family_id: source_family_id || provider_id,
    priority: 8,
    domains,
    capabilities: [],
    allowed_hosts: Array.isArray(host) ? host : [host],
    smoke_query,
    endpoints: [{
      endpoint_id: `${provider_id}-endpoint`,
      url_template,
      response_format: 'JSON',
      records_path,
      authority_id: provider_id,
      publisher_name: authority,
      capability_id: 'world_kb_search',
      maximum_records: 10,
      timeout_ms: 12000,
      request_headers: { Accept: 'application/json', ...headers },
      field_map,
      fixed_fields: {
        source_role: public_source ? 'SECONDARY' : 'OFFICIAL',
        language: 'und',
        rights: { access: 'public', reuse: 'source_specific' }
      }
    }],
    routing_terms
  });
}

const ALL_DOMAINS = Object.freeze(Array.from({ length: 38 }, (_, index) => `G${String(index + 1).padStart(2, '0')}`));

const PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_WORLD_KB = Object.freeze([
  jsonDefinition({
    provider_id: 'wikidata-entity-search', source_id: 'WIKIDATA', authority: 'Wikimedia Foundation', domains: ALL_DOMAINS, host: 'www.wikidata.org',
    url_template: 'https://www.wikidata.org/w/api.php?action=wbsearchentities&search={query}&language=en&format=json&limit=5', smoke_query: 'Berlin', records_path: 'search',
    field_map: { canonical_record_id: 'id', canonical_url: { path: 'concepturi', default: '' }, title: { path: 'label', default: '' }, excerpt: { path: 'description', default: '' }, fields: { aliases: { path: 'aliases', stringify: true } } },
    routing_terms: ['wikidata', 'knowledge graph', 'entity', 'country', 'jurisdiction', 'structured knowledge', '知識グラフ', '国', '法域'], public_source: true
  }),
  jsonDefinition({
    provider_id: 'wikipedia-search', source_id: 'WIKIPEDIA', authority: 'Wikimedia Foundation', domains: ALL_DOMAINS, host: 'en.wikipedia.org',
    url_template: 'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={query}&format=json&srlimit=5', smoke_query: 'knowledge', records_path: 'query.search',
    field_map: { canonical_record_id: 'pageid', title: 'title', excerpt: { path: 'snippet', default: '' } },
    routing_terms: ['wikipedia', 'encyclopedia', 'general knowledge', '百科', '一般知識'], public_source: true
  }),
  textDefinition({
    provider_id: 'faolex-search', source_id: 'FAOLEX', authority: 'Food and Agriculture Organization of the United Nations', domains: ['G06', 'G07', 'G08', 'G09', 'G21', 'G24', 'G27', 'G32', 'G33'], host: 'www.fao.org',
    url_template: 'https://www.fao.org/faolex/results/en/?query={query}', smoke_query: 'climate',
    routing_terms: ['faolex', 'legislation', 'policy', 'agriculture law', 'food law', 'forestry law', 'fisheries law', 'natural resources law', 'country law', '農業法', '食品法', '国別法令']
  }),
  textDefinition({
    provider_id: 'ecolex-search', source_id: 'ECOLEX', authority: 'FAO / IUCN / UNEP', domains: ['G06', 'G07', 'G08', 'G21', 'G24', 'G27', 'G32', 'G34'], host: ['www.ecolex.org', 'ecolex.org'],
    url_template: 'https://www.ecolex.org/result/?q={query}', smoke_query: 'climate',
    routing_terms: ['ecolex', 'environmental law', 'natural resources law', 'treaty', 'legislation', 'jurisprudence', '環境法', '天然資源法', '条約']
  }),
  jsonDefinition({
    provider_id: 'musicbrainz-artist-search', source_id: 'MUSICBRAINZ', authority: 'MetaBrainz Foundation', domains: ['G16'], host: 'musicbrainz.org',
    url_template: 'https://musicbrainz.org/ws/2/artist/?query={query}&limit=5&fmt=json', smoke_query: 'Beatles', records_path: 'artists',
    headers: { 'User-Agent': 'ASTERA-EvidenceSearch/2.4 (public evidence retrieval)' },
    field_map: { canonical_record_id: 'id', title: 'name', excerpt: { path: 'disambiguation', default: '' }, fields: { type: { path: 'type', default: '' }, country: { path: 'country', default: '' }, score: { path: 'score', default: 0 } } },
    routing_terms: ['music', 'artist', 'recording', 'release', 'musicbrainz', '音楽', 'アーティスト'], public_source: true
  }),
  jsonDefinition({
    provider_id: 'artic-artworks-search', source_id: 'ARTIC', authority: 'Art Institute of Chicago', domains: ['G16'], host: 'api.artic.edu',
    url_template: 'https://api.artic.edu/api/v1/artworks/search?q={query}&limit=5&fields=id,title,api_link,artist_display,date_display', smoke_query: 'Monet', records_path: 'data',
    headers: { 'AIC-User-Agent': 'ASTERA-EvidenceSearch/2.4' },
    field_map: { canonical_record_id: 'id', canonical_url: { path: 'api_link', default: '' }, title: 'title', excerpt: { path: 'artist_display', default: '' }, fields: { date_display: { path: 'date_display', default: '' } } },
    routing_terms: ['art', 'artwork', 'painting', 'museum collection', 'visual art', '美術', '作品', '絵画']
  }),
  jsonDefinition({
    provider_id: 'zenodo-records-search', source_id: 'ZENODO', authority: 'CERN / OpenAIRE', domains: ['G01', 'G03', 'G18', 'G19', 'G20', 'G21', 'G22', 'G23', 'G24', 'G25', 'G26', 'G27', 'G28', 'G29', 'G30', 'G31', 'G32', 'G37'], host: 'zenodo.org',
    url_template: 'https://zenodo.org/api/records?q={query}&size=5', smoke_query: 'climate', records_path: 'hits.hits',
    field_map: { canonical_record_id: 'id', canonical_url: { path: 'links.self', default: '' }, title: { path: 'metadata.title', default: '' }, excerpt: { path: 'metadata.description', default: '' }, published_at: { path: 'metadata.publication_date', default: null }, updated_at: { path: 'updated', default: null }, fields: { doi: { path: 'doi', default: '' }, resource_type: { path: 'metadata.resource_type', stringify: true } } },
    routing_terms: ['zenodo', 'research repository', 'dataset', 'publication', 'doi', '研究リポジトリ', 'データセット'], public_source: true
  }),
  jsonDefinition({
    provider_id: 'internet-archive-search', source_id: 'INTERNET_ARCHIVE', authority: 'Internet Archive', domains: ['G01', 'G02', 'G04', 'G14', 'G15', 'G16', 'G17', 'G37', 'G38'], host: 'archive.org',
    url_template: 'https://archive.org/advancedsearch.php?q={query}&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=description&rows=5&page=1&output=json', smoke_query: 'history', records_path: 'response.docs',
    field_map: { canonical_record_id: 'identifier', title: { path: 'title', default: '' }, excerpt: { path: 'description', stringify: true } },
    routing_terms: ['internet archive', 'archive', 'book', 'audio', 'video', 'history', 'アーカイブ', '書籍', '映像'], public_source: true
  }),
  textDefinition({
    provider_id: 'swift-package-registry-search', source_id: 'SWIFT_PACKAGE_REGISTRY', authority: 'Swift Package Registry', domains: ['G29'], host: 'swiftpackageregistry.com',
    url_template: 'https://swiftpackageregistry.com/search?topic={query}', smoke_query: 'swift',
    routing_terms: ['swift', 'swift package', 'ios', 'package registry', 'Swift', 'iOS'], public_source: true
  }),
  jsonDefinition({
    provider_id: 'openfda-device-recall-search', source_id: 'OPENFDA_DEVICE_RECALL', authority: 'U.S. Food and Drug Administration', domains: ['G23', 'G33', 'G34'], host: 'api.fda.gov',
    url_template: 'https://api.fda.gov/device/recall.json?search=root_cause_description:{query}&limit=5', smoke_query: 'design', records_path: 'results',
    field_map: { canonical_record_id: { path: 'product_code', default: '' }, title: { path: 'root_cause_description', default: '' }, excerpt: { path: 'reason_for_recall', default: '' }, published_at: { path: 'date_posted', default: null }, fields: { recalling_firm: { path: 'recalling_firm', default: '' }, product_code: { path: 'product_code', default: '' }, recall_status: { path: 'recall_status', default: '' } } },
    routing_terms: ['device recall', 'medical device', 'fda recall', 'product safety', '医療機器', 'リコール']
  }),
  textDefinition({
    provider_id: 'pubmed-search', source_id: 'PUBMED', authority: 'U.S. National Library of Medicine / NCBI', domains: ['G03', 'G22', 'G23', 'G24', 'G37'], host: 'eutils.ncbi.nlm.nih.gov',
    url_template: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term={query}&retmode=json&retmax=5&tool=ASTERA', smoke_query: 'cancer',
    routing_terms: ['pubmed', 'biomedical literature', 'medicine', 'health', 'biology', '医学', '医療', '生物医学']
  }),
  jsonDefinition({
    provider_id: 'un-digital-library-search', source_id: 'UN_DIGITAL_LIBRARY', authority: 'United Nations', domains: ['G06', 'G07', 'G08', 'G34', 'G35', 'G37'], host: 'digitallibrary.un.org',
    url_template: 'https://digitallibrary.un.org/search?p={query}&of=recjson&ot=recid,title,creation_date&rg=5', smoke_query: 'peacekeeping', records_path: '',
    field_map: { canonical_record_id: 'recid', title: { path: 'title.title', default: '' }, excerpt: { path: 'title.title', default: '' }, published_at: { path: 'creation_date', default: null }, fields: { title: { path: 'title', stringify: true } } },
    routing_terms: ['united nations', 'international relations', 'human rights', 'security', 'peacekeeping', 'criminal justice', '国連', '国際関係', '人権', '安全保障']
  }),
  jsonDefinition({
    provider_id: 'go-packages-search', source_id: 'GO_PACKAGES', authority: 'Go project', domains: ['G29'], host: 'pkg.go.dev',
    url_template: 'https://pkg.go.dev/v1/search?q={query}&limit=5', smoke_query: 'http', records_path: 'items',
    field_map: { canonical_record_id: 'packagePath', title: 'packagePath', excerpt: { path: 'synopsis', default: '' }, version: { path: 'version', default: null }, fields: { module_path: { path: 'modulePath', default: '' }, version: { path: 'version', default: '' } } },
    routing_terms: ['go', 'golang', 'go package', 'module', 'Go言語', 'Golang'], public_source: true
  }),
  jsonDefinition({
    provider_id: 'nominatim-search', source_id: 'NOMINATIM', authority: 'OpenStreetMap / Nominatim', domains: ['G05', 'G17', 'G26', 'G28'], host: 'nominatim.openstreetmap.org',
    url_template: 'https://nominatim.openstreetmap.org/search?q={query}&format=jsonv2&limit=5', smoke_query: 'Tokyo', records_path: '', headers: { 'User-Agent': 'ASTERA-EvidenceSearch/2.4' },
    field_map: { canonical_record_id: 'place_id', title: 'display_name', excerpt: { path: 'type', default: '' }, fields: { lat: 'lat', lon: 'lon', category: 'category', type: 'type' } },
    routing_terms: ['geography', 'map', 'place', 'address', 'city', 'transport', 'travel', 'tourism', '地理', '地図', '住所', '都市', '交通', '旅行'], public_source: true
  }),
  jsonDefinition({
    provider_id: 'metacpan-search', source_id: 'METACPAN', authority: 'MetaCPAN', domains: ['G29'], host: 'fastapi.metacpan.org',
    url_template: 'https://fastapi.metacpan.org/v1/release/_search?q={query}&size=5&fields=name,distribution,version,abstract,date,download_url', smoke_query: 'HTTP', records_path: 'hits.hits',
    field_map: { canonical_record_id: '_id', canonical_url: { path: '_source.download_url', default: '' }, title: { path: '_source.name', default: '' }, excerpt: { path: '_source.abstract', default: '' }, published_at: { path: '_source.date', default: null }, version: { path: '_source.version', default: null }, fields: { distribution: { path: '_source.distribution', default: '' } } },
    routing_terms: ['perl', 'cpan', 'metacpan', 'Perl', 'CPAN'], public_source: true
  }),
  jsonDefinition({
    provider_id: 'who-gho-indicator-search', source_id: 'WHO_GHO', authority: 'World Health Organization', domains: ['G03', 'G06', 'G21', 'G23', 'G24', 'G37'], host: 'ghoapi.azureedge.net',
    url_template: "https://ghoapi.azureedge.net/api/Indicator?$filter=contains(IndicatorName,'{query}')&$top=5", smoke_query: 'Household', records_path: 'value',
    field_map: { canonical_record_id: 'IndicatorCode', title: 'IndicatorName', excerpt: { path: 'IndicatorName', default: '' }, fields: { language: { path: 'Language', default: '' } } },
    routing_terms: ['who', 'global health observatory', 'health indicator', 'country health', 'public health', '世界保健機関', '保健指標', '公衆衛生']
  }),
  jsonDefinition({
    provider_id: 'ror-organization-search', source_id: 'ROR', authority: 'Research Organization Registry', domains: ['G01', 'G03', 'G10', 'G13', 'G19', 'G20', 'G22', 'G23', 'G25', 'G29', 'G30', 'G37'], host: 'api.ror.org',
    url_template: 'https://api.ror.org/v2/organizations?query={query}', smoke_query: 'Bath', records_path: 'items',
    field_map: { canonical_record_id: 'id', canonical_url: 'id', title: { path: 'names.0.value', default: '' }, excerpt: { path: 'types', stringify: true }, fields: { locations: { path: 'locations', stringify: true }, names: { path: 'names', stringify: true }, status: { path: 'status', default: '' } } },
    routing_terms: ['research organization', 'university', 'institute', 'laboratory', 'organization registry', '研究機関', '大学', '研究所'], public_source: true
  })
]);

const ROUTING_OVERRIDES_WORLD_KB = Object.freeze(Object.fromEntries(
  PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_WORLD_KB
    .filter((provider) => Array.isArray(provider.routing_terms) && provider.routing_terms.length)
    .map((provider) => [provider.provider_id, Object.freeze([...provider.routing_terms])])
));

module.exports = { PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_WORLD_KB, ROUTING_OVERRIDES_WORLD_KB };
