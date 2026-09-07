'use strict';

const PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_PREVERIFIED_WAVE3 = Object.freeze([
  Object.freeze({
    provider_id: 'data-gov-datasets', catalog_source_ids: ['DATA_GOV'], type: 'FREE_OFFICIAL_HTTP', enabled: true, certified: true, source_family_id: 'data-gov', priority: 30,
    domains: ['G05','G06','G07','G08','G09','G10','G11','G12','G13','G17','G21','G23','G24','G25','G26','G27','G28','G31','G32','G33','G34','G35','G36','G37'], capabilities: [], allowed_hosts: ['catalog.data.gov'], smoke_query: 'climate',
    endpoints: [{ endpoint_id: 'data-gov-ckan-package-search', url_template: 'https://catalog.data.gov/api/3/action/package_search?q={query}&rows=5', response_format: 'JSON', records_path: 'result.results', authority_id: 'data-gov', publisher_name: 'Data.gov', capability_id: 'public_dataset_catalog_search', maximum_records: 5, timeout_ms: 12000, maximum_attempts: 2,
      field_map: { canonical_record_id: 'name', title: 'title', excerpt: { path: 'notes', default: '' }, updated_at: { path: 'metadata_modified', default: null }, fields: { organization: { path: 'organization.title', default: '' }, tags: { path: 'tags', stringify: true }, resources: { path: 'resources', stringify: true } } },
      fixed_fields: { source_role: 'OFFICIAL', language: 'en', rights: { access: 'public', reuse: 'source_specific' } } }],
    routing_terms: ['government data','public data','dataset','statistics','geospatial','climate','政府データ','公開データ','統計']
  }),
  Object.freeze({
    provider_id: 'open-library-search', catalog_source_ids: ['OPEN_LIBRARY'], type: 'FREE_PUBLIC_HTTP', enabled: true, certified: true, source_family_id: 'open-library', priority: 28,
    domains: ['G01','G02','G04','G14','G15','G16','G17','G38'], capabilities: [], allowed_hosts: ['openlibrary.org'], smoke_query: 'history',
    endpoints: [{ endpoint_id: 'open-library-optimized-search', url_template: 'https://openlibrary.org/search.json?q={query}&fields=key,title,author_name,first_publish_year&limit=5', response_format: 'JSON', records_path: 'docs', authority_id: 'open-library', publisher_name: 'Open Library', capability_id: 'book_catalog_search', maximum_records: 5, timeout_ms: 15000, maximum_attempts: 2,
      field_map: { canonical_record_id: 'key', title: 'title', excerpt: { path: 'author_name', stringify: true }, published_at: { path: 'first_publish_year', default: null }, fields: { author_name: { path: 'author_name', stringify: true } } },
      fixed_fields: { source_role: 'SECONDARY', language: 'und', rights: { access: 'public', reuse: 'metadata_public' } } }],
    routing_terms: ['book','library','author','literature','archive','書籍','図書館','著者','文学']
  }),
  Object.freeze({
    provider_id: 'met-museum-search', catalog_source_ids: ['MET_MUSEUM'], type: 'SEARCH_DETAIL_JSON', enabled: true, certified: true, source_family_id: 'met-museum', priority: 8,
    domains: ['G16'], capabilities: [], allowed_hosts: ['collectionapi.metmuseum.org'], smoke_query: 'painting', authority_id: 'met-museum', publisher_name: 'The Metropolitan Museum of Art', source_role: 'OFFICIAL', timeout_ms: 12000, maximum_attempts: 2,
    search: { endpoint_id: 'met-object-id-search', url_template: 'https://collectionapi.metmuseum.org/public/collection/v1/search?q={query}', records_path: 'objectIDs', maximum_records: 5 },
    detail: { endpoint_id: 'met-object-detail', url_template: 'https://collectionapi.metmuseum.org/public/collection/v1/objects/{record_value}', records_path: '', authority_id: 'met-museum', publisher_name: 'The Metropolitan Museum of Art', capability_id: 'museum_collection_object',
      field_map: { canonical_record_id: { path: 'objectID', stringify: true }, canonical_url: { path: 'objectURL', default: '' }, title: { path: 'title', default: '' }, excerpt: { path: 'artistDisplayName', default: '' }, fields: { object_name: { path: 'objectName', default: '' }, object_date: { path: 'objectDate', default: '' }, culture: { path: 'culture', default: '' }, department: { path: 'department', default: '' }, medium: { path: 'medium', default: '' } } }, fixed_fields: { rights: { access: 'public', reuse: 'source_specific' } } },
    routing_terms: ['art','museum','painting','sculpture','collection','美術','博物館','絵画','彫刻']
  }),
  Object.freeze({
    provider_id: 'pubmed-search', catalog_source_ids: ['PUBMED'], type: 'SEARCH_DETAIL_JSON', enabled: true, certified: true, source_family_id: 'ncbi-pubmed', priority: 8,
    domains: ['G03','G22','G23','G24','G37'], capabilities: [], allowed_hosts: ['eutils.ncbi.nlm.nih.gov'], smoke_query: 'cancer', authority_id: 'ncbi-pubmed', publisher_name: 'U.S. National Library of Medicine / NCBI', source_role: 'OFFICIAL', timeout_ms: 12000, maximum_attempts: 2,
    search: { endpoint_id: 'pubmed-esearch', url_template: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term={query}&retmode=json&retmax=5&tool=ASTERA', records_path: 'esearchresult.idlist', maximum_records: 5 },
    detail: { endpoint_id: 'pubmed-esummary', url_template: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id={record_value}&retmode=json&tool=ASTERA', records_path: 'result.{record_value}', authority_id: 'ncbi-pubmed', publisher_name: 'U.S. National Library of Medicine / NCBI', capability_id: 'pubmed_article_summary',
      field_map: { canonical_record_id: 'uid', title: { path: 'title', default: '' }, excerpt: { path: 'source', default: '' }, published_at: { path: 'pubdate', default: null }, fields: { authors: { path: 'authors', stringify: true }, fulljournalname: { path: 'fulljournalname', default: '' }, sortfirstauthor: { path: 'sortfirstauthor', default: '' }, articleids: { path: 'articleids', stringify: true } } }, fixed_fields: { rights: { access: 'public', reuse: 'source_specific' } } },
    routing_terms: ['pubmed','biomedical literature','medicine','health','biology','医学','医療','生物医学']
  }),
  Object.freeze({
    provider_id: 'jpl-sbdb-verified', catalog_source_ids: ['JPL_SBDB_VERIFIED'], type: 'FREE_OFFICIAL_HTTP', enabled: true, certified: true, source_family_id: 'nasa-jpl-sbdb', priority: 7,
    domains: ['G19'], capabilities: [], allowed_hosts: ['ssd-api.jpl.nasa.gov'], smoke_query: 'Eros',
    endpoints: [{ endpoint_id: 'jpl-sbdb-object-search', url_template: 'https://ssd-api.jpl.nasa.gov/sbdb.api?sstr={query}', response_format: 'JSON', records_path: '', authority_id: 'nasa-jpl-sbdb', publisher_name: 'NASA Jet Propulsion Laboratory', capability_id: 'small_body_object_search', maximum_records: 1, timeout_ms: 10000,
      field_map: { canonical_record_id: 'object.spkid', title: { path: 'object.fullname', default: '' }, excerpt: { path: 'object.orbit_class.name', default: '' }, fields: { designation: { path: 'object.des', default: '' }, kind: { path: 'object.kind', default: '' }, neo: { path: 'object.neo', default: false }, pha: { path: 'object.pha', default: false }, orbit: { path: 'orbit', stringify: true } } },
      fixed_fields: { source_role: 'OFFICIAL', language: 'und', rights: { access: 'public', reuse: 'source_specific' } } }],
    routing_terms: ['asteroid','comet','small body','orbit','eros','jpl','sbdb','小惑星','彗星','小天体','軌道']
  }),
  Object.freeze({
    provider_id: 'gwosc-v2-verified', catalog_source_ids: ['GWOSC_V2_VERIFIED'], type: 'FREE_OFFICIAL_HTTP', enabled: true, certified: true, source_family_id: 'gwosc', priority: 7,
    domains: ['G19'], capabilities: [], allowed_hosts: ['gwosc.org'], smoke_query: 'GW150914',
    endpoints: [{ endpoint_id: 'gwosc-event-version-search', url_template: 'https://gwosc.org/api/v2/event-versions?name-contains={query}&lastver=true&pagesize=5&format=json', response_format: 'JSON', records_path: 'results', authority_id: 'gwosc', publisher_name: 'Gravitational Wave Open Science Center', capability_id: 'gravitational_wave_event_search', maximum_records: 5, timeout_ms: 10000,
      field_map: { canonical_record_id: 'shortName', canonical_url: { path: 'detail_url', default: '' }, title: 'name', excerpt: { path: 'catalog', default: '' }, fields: { gps: { path: 'gps', default: null }, version: { path: 'version', default: null }, detectors: { path: 'detectors', stringify: true }, doi: { path: 'doi', default: '' } } },
      fixed_fields: { source_role: 'OFFICIAL', language: 'en', rights: { access: 'public', reuse: 'CC-BY-4.0' } } }],
    routing_terms: ['gravitational wave','gwosc','ligo','virgo','kagra','GW150914','重力波','LIGO','Virgo','KAGRA']
  }),
  Object.freeze({
    provider_id: 'clinvar-esummary-verified', catalog_source_ids: ['CLINVAR_VERIFIED'], type: 'SEARCH_DETAIL_JSON', enabled: true, certified: true, source_family_id: 'ncbi-clinvar', priority: 7,
    domains: ['G23'], capabilities: [], allowed_hosts: ['eutils.ncbi.nlm.nih.gov'], smoke_query: 'FGFR3', authority_id: 'ncbi-clinvar', publisher_name: 'NCBI ClinVar', source_role: 'OFFICIAL', timeout_ms: 12000, maximum_attempts: 2,
    search: { endpoint_id: 'clinvar-esearch', url_template: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=clinvar&term={query}&retmode=json&retmax=5&tool=ASTERA', records_path: 'esearchresult.idlist', maximum_records: 5 },
    detail: { endpoint_id: 'clinvar-esummary', url_template: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=clinvar&id={record_value}&retmode=json&tool=ASTERA', records_path: 'result.{record_value}', authority_id: 'ncbi-clinvar', publisher_name: 'NCBI ClinVar', capability_id: 'clinical_variant_summary',
      field_map: { canonical_record_id: 'uid', title: { path: 'title', default: '' }, excerpt: { path: 'accession_version', default: '' }, fields: { accession: { path: 'accession', default: '' }, variant_type: { path: 'obj_type', default: '' }, clinical_significance: { path: 'clinical_significance', stringify: true }, genes: { path: 'genes', stringify: true }, trait_set: { path: 'trait_set', stringify: true } } }, fixed_fields: { rights: { access: 'public', reuse: 'source_specific' } } },
    routing_terms: ['clinvar','clinical variant','genomic variant','pathogenic variant','gene variant','遺伝子変異','臨床変異','病原性']
  }),
  Object.freeze({
    provider_id: 'cpsc-recalls-api-verified', catalog_source_ids: ['CPSC_RECALLS_API_VERIFIED'], type: 'FREE_OFFICIAL_HTTP', enabled: true, certified: true, source_family_id: 'us-cpsc-recalls', priority: 7,
    domains: ['G33','G34','G38'], capabilities: [], allowed_hosts: ['www.saferproducts.gov'], smoke_query: 'Toddler',
    endpoints: [{ endpoint_id: 'cpsc-recall-product-search', url_template: 'https://www.saferproducts.gov/RestWebServices/Recall?ProductName={query}&format=json', response_format: 'JSON', records_path: '', authority_id: 'us-cpsc', publisher_name: 'U.S. Consumer Product Safety Commission', capability_id: 'consumer_product_recall_search', maximum_records: 10, timeout_ms: 10000,
      field_map: { canonical_record_id: { path: 'RecallID', stringify: true }, title: { path: 'Title', default: '' }, excerpt: { path: 'Description', default: '' }, fields: { recall_number: { path: 'RecallNumber', default: '' }, products: { path: 'Products', stringify: true }, hazards: { path: 'Hazards', stringify: true }, remedies: { path: 'Remedies', stringify: true } } },
      fixed_fields: { source_role: 'OFFICIAL', language: 'en', rights: { access: 'public', reuse: 'public_data' } } }],
    routing_terms: ['cpsc','product recall','consumer product','product safety','toddler','リコール','製品安全','消費者製品']
  }),
  Object.freeze({
    provider_id: 'eric-api-verified', catalog_source_ids: ['ERIC_API_VERIFIED'], type: 'FREE_OFFICIAL_HTTP', enabled: true, certified: true, source_family_id: 'ies-eric', priority: 7,
    domains: ['G13','G37'], capabilities: [], allowed_hosts: ['api.ies.ed.gov'], smoke_query: 'machine learning',
    endpoints: [{ endpoint_id: 'eric-bibliographic-search', url_template: 'https://api.ies.ed.gov/eric/?search={query}&rows=20&format=json&start=0', response_format: 'JSON', records_path: 'response.docs', authority_id: 'ies-eric', publisher_name: 'U.S. Department of Education / Institute of Education Sciences', capability_id: 'education_research_literature_search', maximum_records: 20, timeout_ms: 10000,
      field_map: { canonical_record_id: 'id', canonical_url: { path: 'url', default: '' }, title: 'title', excerpt: { path: 'description', default: '' }, fields: { author: { path: 'author', stringify: true }, source: { path: 'source', default: '' }, publication_year: { path: 'publicationdateyear', default: null }, descriptor: { path: 'descriptor', stringify: true }, publication_type: { path: 'publicationtype', stringify: true } } },
      fixed_fields: { source_role: 'OFFICIAL', language: 'und', rights: { access: 'public', reuse: 'public_metadata' } } }],
    routing_terms: ['eric','education research','education literature','curriculum research','教育研究','教育文献','学習研究']
  }),
  Object.freeze({
    provider_id: 'egov-laws-v2-verified', catalog_source_ids: ['EGOV_LAWS_V2_VERIFIED'], type: 'FREE_OFFICIAL_HTTP', enabled: true, certified: true, source_family_id: 'jp-egov-laws', priority: 6,
    domains: ['G08'], capabilities: [], allowed_hosts: ['laws.e-gov.go.jp'], smoke_query: '労働',
    endpoints: [{ endpoint_id: 'egov-laws-keyword-search', url_template: 'https://laws.e-gov.go.jp/api/2/keyword?keyword={query}&limit=20&sentences_limit=3&sentence_text_size=240&response_format=json', response_format: 'JSON', records_path: 'items', authority_id: 'jp-digital-agency-egov-laws', publisher_name: 'デジタル庁 e-Gov法令検索', capability_id: 'japan_law_fulltext_keyword_search', maximum_records: 20, timeout_ms: 10000,
      field_map: { canonical_record_id: 'law_info.law_id', title: { path: 'revision_info.law_title', default: '' }, excerpt: { path: 'sentences', stringify: true }, fields: { law_num: { path: 'law_info.law_num', default: '' }, promulgation_date: { path: 'law_info.promulgation_date', default: null }, revision_id: { path: 'revision_info.law_revision_id', default: '' }, amendment_date: { path: 'revision_info.amendment_enforcement_date', default: null } } },
      fixed_fields: { source_role: 'OFFICIAL', language: 'ja', rights: { access: 'public', reuse: 'source_specific' } } }],
    routing_terms: ['e-gov','日本法','法律','法令','条文','規則','政令','省令','労働基準法','個人情報保護法']
  }),
  Object.freeze({
    provider_id: 'itis-anymatch-verified', catalog_source_ids: ['ITIS_VERIFIED'], type: 'FREE_OFFICIAL_HTTP', enabled: true, certified: true, source_family_id: 'us-itis', priority: 7,
    domains: ['G22','G24'], capabilities: [], allowed_hosts: ['www.itis.gov'], smoke_query: 'Panthera leo',
    endpoints: [{ endpoint_id: 'itis-any-match-search', url_template: 'https://www.itis.gov/ITISWebService/jsonservice/searchForAnyMatch?srchKey={query}', response_format: 'JSON', records_path: 'anyMatchList', authority_id: 'us-itis', publisher_name: 'Integrated Taxonomic Information System', capability_id: 'taxonomic_any_match_search', maximum_records: 20, timeout_ms: 10000,
      field_map: { canonical_record_id: 'tsn', title: { path: 'scientificName', default: '' }, excerpt: { path: 'commonNameList', stringify: true }, fields: { match_type: { path: 'matchType', default: '' }, common_names: { path: 'commonNameList', stringify: true } } },
      fixed_fields: { source_role: 'OFFICIAL', language: 'und', rights: { access: 'public', reuse: 'public_data' } } }],
    routing_terms: ['itis','taxonomy','scientific name','common name','species','tsn','分類学','学名','種','生物分類']
  })
]);

const ROUTING_OVERRIDES_PREVERIFIED_WAVE3 = Object.freeze(Object.fromEntries(PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_PREVERIFIED_WAVE3.map((provider) => [provider.provider_id, Object.freeze([...(provider.routing_terms || [])])])));
module.exports = { PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_PREVERIFIED_WAVE3, ROUTING_OVERRIDES_PREVERIFIED_WAVE3 };
