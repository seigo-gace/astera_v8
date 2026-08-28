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
  })
]);

const ROUTING_OVERRIDES_PREVERIFIED_WAVE3 = Object.freeze(Object.fromEntries(PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_PREVERIFIED_WAVE3.map((provider) => [provider.provider_id, Object.freeze([...(provider.routing_terms || [])])])));
module.exports = { PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_PREVERIFIED_WAVE3, ROUTING_OVERRIDES_PREVERIFIED_WAVE3 };
