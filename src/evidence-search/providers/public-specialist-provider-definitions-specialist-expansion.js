'use strict';

function textDefinition({ provider_id, source_id, authority, domains, host, url_template, smoke_query, routing_terms = [], headers = {}, public_source = false }) {
  return Object.freeze({
    provider_id,
    catalog_source_ids: [source_id],
    type: public_source ? 'FREE_PUBLIC_HTTP' : 'FREE_OFFICIAL_HTTP',
    enabled: true,
    certified: true,
    source_family_id: provider_id,
    priority: 9,
    domains,
    capabilities: [],
    allowed_hosts: Array.isArray(host) ? host : [host],
    smoke_query,
    endpoints: [{
      endpoint_id: `${provider_id}-endpoint`,
      url_template,
      response_format: 'TEXT',
      authority_id: provider_id,
      publisher_name: authority,
      capability_id: 'specialist_search',
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

function jsonDefinition({ provider_id, source_id, authority, domains, host, url_template, smoke_query, records_path = '', field_map = {}, routing_terms = [], headers = {}, public_source = false }) {
  return Object.freeze({
    provider_id,
    catalog_source_ids: [source_id],
    type: public_source ? 'FREE_PUBLIC_HTTP' : 'FREE_OFFICIAL_HTTP',
    enabled: true,
    certified: true,
    source_family_id: provider_id,
    priority: 9,
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
      capability_id: 'specialist_search',
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

const PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_SPECIALIST_EXPANSION = Object.freeze([
  textDefinition({
    provider_id: 'sep-search', source_id: 'SEP', authority: 'Stanford Encyclopedia of Philosophy', domains: ['G02'], host: 'plato.stanford.edu',
    url_template: 'https://plato.stanford.edu/search/searcher.py?query={query}', smoke_query: 'ethics',
    routing_terms: ['philosophy', 'ethics', 'epistemology', 'metaphysics', '哲学', '倫理', '思想']
  }),
  jsonDefinition({
    provider_id: 'loc-newspapers-search', source_id: 'LOC_NEWSPAPERS', authority: 'Library of Congress', domains: ['G04', 'G15', 'G16'], host: 'www.loc.gov',
    url_template: 'https://www.loc.gov/newspapers/?fo=json&q={query}&c=5', smoke_query: 'history', records_path: 'results',
    field_map: { canonical_record_id: 'id', canonical_url: { path: 'url', default: '' }, title: { path: 'title', default: '' }, excerpt: { path: 'description', stringify: true } },
    routing_terms: ['newspaper', 'history', 'archive', 'press', '新聞', '歴史', 'アーカイブ', '出版']
  }),
  jsonDefinition({
    provider_id: 'nominatim-search', source_id: 'NOMINATIM', authority: 'OpenStreetMap / Nominatim', domains: ['G05', 'G26', 'G28'], host: 'nominatim.openstreetmap.org',
    url_template: 'https://nominatim.openstreetmap.org/search?q={query}&format=jsonv2&limit=5', smoke_query: 'Tokyo', records_path: '', headers: { 'User-Agent': 'ASTERA-EvidenceSearch/2.4' },
    field_map: { canonical_record_id: 'place_id', title: 'display_name', excerpt: { path: 'type', default: '' }, fields: { lat: 'lat', lon: 'lon', category: 'category', type: 'type' } },
    routing_terms: ['geography', 'map', 'place', 'address', 'city', 'transport', '地理', '地図', '住所', '都市', '交通'], public_source: true
  }),
  textDefinition({
    provider_id: 'reliefweb-search', source_id: 'RELIEFWEB', authority: 'United Nations OCHA ReliefWeb', domains: ['G06', 'G07', 'G21', 'G34', 'G35'], host: 'reliefweb.int',
    url_template: 'https://reliefweb.int/updates?search={query}', smoke_query: 'earthquake',
    routing_terms: ['humanitarian', 'disaster', 'crisis', 'conflict', 'emergency', '災害', '人道', '危機', '紛争']
  }),
  jsonDefinition({
    provider_id: 'wiktionary-search', source_id: 'WIKTIONARY', authority: 'Wikimedia Foundation', domains: ['G14'], host: 'en.wiktionary.org',
    url_template: 'https://en.wiktionary.org/w/api.php?action=query&list=search&srsearch={query}&format=json&srlimit=5', smoke_query: 'language', records_path: 'query.search',
    field_map: { canonical_record_id: 'pageid', title: 'title', excerpt: { path: 'snippet', default: '' } }, routing_terms: ['dictionary', 'word', 'language', 'translation', '辞書', '単語', '言語', '翻訳'], public_source: true
  }),
  textDefinition({
    provider_id: 'met-museum-search', source_id: 'MET_MUSEUM', authority: 'The Metropolitan Museum of Art', domains: ['G16'], host: 'collectionapi.metmuseum.org',
    url_template: 'https://collectionapi.metmuseum.org/public/collection/v1/search?q={query}', smoke_query: 'painting', routing_terms: ['art', 'museum', 'painting', 'culture', '美術', '博物館', '絵画', '文化']
  }),
  jsonDefinition({
    provider_id: 'sportsdb-search', source_id: 'THESPORTSDB', authority: 'TheSportsDB', domains: ['G17'], host: 'www.thesportsdb.com',
    url_template: 'https://www.thesportsdb.com/api/v1/json/123/searchteams.php?t={query}', smoke_query: 'Arsenal', records_path: 'teams',
    field_map: { canonical_record_id: 'idTeam', title: 'strTeam', excerpt: { path: 'strDescriptionEN', default: '' }, fields: { sport: 'strSport', league: 'strLeague', country: 'strCountry' } },
    routing_terms: ['sports', 'team', 'league', 'football', 'soccer', 'スポーツ', 'チーム', 'リーグ'], public_source: true
  }),
  jsonDefinition({
    provider_id: 'wikivoyage-search', source_id: 'WIKIVOYAGE', authority: 'Wikimedia Foundation', domains: ['G17'], host: 'en.wikivoyage.org',
    url_template: 'https://en.wikivoyage.org/w/api.php?action=query&list=search&srsearch={query}&format=json&srlimit=5', smoke_query: 'Tokyo', records_path: 'query.search',
    field_map: { canonical_record_id: 'pageid', title: 'title', excerpt: { path: 'snippet', default: '' } }, routing_terms: ['travel', 'tourism', 'destination', '旅行', '観光', '目的地'], public_source: true
  }),
  jsonDefinition({
    provider_id: 'steam-store-search', source_id: 'STEAM_STORE', authority: 'Valve / Steam', domains: ['G17'], host: 'store.steampowered.com',
    url_template: 'https://store.steampowered.com/api/storesearch/?term={query}&l=english&cc=US', smoke_query: 'Portal', records_path: 'items',
    field_map: { canonical_record_id: 'id', title: 'name', excerpt: { path: 'tiny_image', default: '' }, fields: { price: { path: 'price', stringify: true } } },
    routing_terms: ['game', 'video game', 'steam', 'ゲーム'], public_source: true
  }),
  textDefinition({ provider_id: 'zbmath-search', source_id: 'ZBMATH', authority: 'zbMATH Open', domains: ['G18', 'G37'], host: 'api.zbmath.org', url_template: 'https://api.zbmath.org/v1/document/_search?search_string={query}', smoke_query: 'prime', routing_terms: ['mathematics', 'math', 'theorem', 'algebra', 'geometry', '数学', '定理', '代数', '幾何'] }),
  jsonDefinition({
    provider_id: 'nasa-ntrs-search', source_id: 'NASA_NTRS', authority: 'NASA', domains: ['G19', 'G25', 'G27', 'G30', 'G35', 'G37'], host: 'ntrs.nasa.gov',
    url_template: 'https://ntrs.nasa.gov/api/citations/search?q={query}&page.size=5', smoke_query: 'Apollo', records_path: 'results',
    field_map: { canonical_record_id: 'id', title: { path: 'title', default: '' }, excerpt: { path: 'abstract', default: '' }, published_at: { path: 'publicationDate', default: null } },
    routing_terms: ['nasa', 'space', 'aerospace', 'engineering', 'energy', 'robotics', '宇宙', '航空宇宙', '工学', 'ロボット']
  }),
  textDefinition({ provider_id: 'nist-webbook-search', source_id: 'NIST_WEBBOOK', authority: 'National Institute of Standards and Technology', domains: ['G20', 'G25'], host: 'webbook.nist.gov', url_template: 'https://webbook.nist.gov/cgi/cbook.cgi?Name={query}&Units=SI', smoke_query: 'water', routing_terms: ['chemistry', 'compound', 'thermochemistry', 'spectra', '化学', '化合物', 'スペクトル'] }),
  textDefinition({
    provider_id: 'cpsc-recalls-search', source_id: 'CPSC_RECALLS', authority: 'U.S. Consumer Product Safety Commission', domains: ['G33', 'G34', 'G38'], host: 'www.cpsc.gov',
    url_template: 'https://www.cpsc.gov/search?search_api_fulltext={query}', smoke_query: 'child recall',
    routing_terms: ['recall', 'consumer product', 'product safety', 'リコール', '消費者製品', '製品安全']
  }),
  jsonDefinition({
    provider_id: 'openfda-device-search', source_id: 'OPENFDA_DEVICE', authority: 'U.S. Food and Drug Administration', domains: ['G23', 'G33', 'G34'], host: 'api.fda.gov',
    url_template: 'https://api.fda.gov/device/enforcement.json?search=product_description:{query}&limit=5', smoke_query: 'pacemaker', records_path: 'results',
    field_map: { canonical_record_id: 'recall_number', title: { path: 'product_description', default: '' }, excerpt: { path: 'reason_for_recall', default: '' }, published_at: { path: 'report_date', default: null } },
    routing_terms: ['medical device', 'device recall', 'fda', '医療機器', 'リコール']
  }),
  textDefinition({ provider_id: 'iana-search', source_id: 'IANA_SEARCH', authority: 'Internet Assigned Numbers Authority', domains: ['G29', 'G31', 'G32', 'G36'], host: 'www.iana.org', url_template: 'https://www.iana.org/search?q={query}', smoke_query: 'IPv6', routing_terms: ['iana', 'protocol', 'port', 'domain', 'internet registry', 'プロトコル', 'ポート', 'ドメイン', 'インターネット'] }),
  textDefinition({ provider_id: 'un-digital-library-search', source_id: 'UN_DIGITAL_LIBRARY', authority: 'United Nations', domains: ['G07', 'G08', 'G35', 'G37'], host: 'digitallibrary.un.org', url_template: 'https://digitallibrary.un.org/search?ln=en&p={query}', smoke_query: 'peacekeeping', routing_terms: ['united nations', 'international relations', 'security', 'peacekeeping', '国連', '国際関係', '安全保障', '平和維持'] }),
  textDefinition({ provider_id: 'sba-search', source_id: 'SBA_SEARCH', authority: 'U.S. Small Business Administration', domains: ['G10'], host: 'www.sba.gov', url_template: 'https://www.sba.gov/search?page=0&query={query}', smoke_query: 'business', routing_terms: ['small business', 'entrepreneurship', 'business', 'startup', '中小企業', '起業', '経営'] }),
  textDefinition({ provider_id: 'irs-search', source_id: 'IRS_SEARCH', authority: 'Internal Revenue Service', domains: ['G11'], host: 'www.irs.gov', url_template: 'https://www.irs.gov/instructions-and-publications-xml-source-files?find={query}&items_per_page=25', smoke_query: 'tax credit', routing_terms: ['tax', 'irs', 'deduction', 'tax credit', '税務', '税金', '控除'] }),
  textDefinition({ provider_id: 'naic-search', source_id: 'NAIC_SEARCH', authority: 'National Association of Insurance Commissioners', domains: ['G11'], host: 'content.naic.org', url_template: 'https://content.naic.org/search?search_api_fulltext={query}', smoke_query: 'insurance', routing_terms: ['insurance', 'insurer', 'policy', '保険', '保険会社'] }),
  textDefinition({ provider_id: 'google-patents-search', source_id: 'GOOGLE_PATENTS', authority: 'Google Patents', domains: ['G32'], host: 'patents.google.com', url_template: 'https://patents.google.com/?q={query}', smoke_query: 'battery', routing_terms: ['patent', 'invention', 'intellectual property', '特許', '発明', '知的財産'], public_source: true }),
  textDefinition({ provider_id: 'pypi-search', source_id: 'PYPI', authority: 'Python Software Foundation / PyPI', domains: ['G29'], host: 'pypi.org', url_template: 'https://pypi.org/search/?q={query}', smoke_query: 'requests', routing_terms: ['python', 'pypi', 'pip', 'python package', 'Python', 'パッケージ'], public_source: true }),
  textDefinition({ provider_id: 'go-packages-search', source_id: 'GO_PACKAGES', authority: 'Go project', domains: ['G29'], host: 'pkg.go.dev', url_template: 'https://pkg.go.dev/search?q={query}', smoke_query: 'http', routing_terms: ['go', 'golang', 'go package', 'Go言語', 'Golang'], public_source: true }),
  textDefinition({ provider_id: 'dart-pub-search', source_id: 'DART_PUB', authority: 'Dart / Flutter', domains: ['G29'], host: 'pub.dev', url_template: 'https://pub.dev/packages?q={query}', smoke_query: 'http', routing_terms: ['dart', 'flutter', 'pub.dev', 'Dart', 'Flutter'], public_source: true }),
  textDefinition({
    provider_id: 'swift-package-index-search', source_id: 'SWIFT_PACKAGE_INDEX', authority: 'Swift Package Index', domains: ['G29'], host: 'swiftpackageindex.com',
    url_template: 'https://swiftpackageindex.com/keywords/{query}', smoke_query: 'swift',
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ASTERA-EvidenceSearch/2.4; +https://github.com/seigo-gace/astera_v8)', 'Accept-Language': 'en-US,en;q=0.9' },
    routing_terms: ['swift', 'swift package', 'ios development', 'Swift', 'iOS'], public_source: true
  }),
  textDefinition({ provider_id: 'conan-center-search', source_id: 'CONAN_CENTER', authority: 'JFrog ConanCenter', domains: ['G29'], host: 'conan.io', url_template: 'https://conan.io/center/recipes?value={query}', smoke_query: 'zlib', routing_terms: ['c++', 'cpp', 'c package', 'conan', 'C++', 'C言語'], public_source: true }),
  textDefinition({ provider_id: 'hex-packages-search', source_id: 'HEX_PACKAGES', authority: 'Hex', domains: ['G29'], host: 'hex.pm', url_template: 'https://hex.pm/packages?search={query}', smoke_query: 'phoenix', routing_terms: ['elixir', 'erlang', 'hex package', 'Elixir', 'Erlang'], public_source: true }),
  textDefinition({ provider_id: 'metacpan-search', source_id: 'METACPAN', authority: 'MetaCPAN', domains: ['G29'], host: ['metacpan.org', 'www.metacpan.org'], url_template: 'https://metacpan.org/search?q={query}', smoke_query: 'HTTP', routing_terms: ['perl', 'cpan', 'metacpan', 'Perl', 'CPAN'], public_source: true }),
  jsonDefinition({
    provider_id: 'maven-kotlin-search', source_id: 'MAVEN_KOTLIN', authority: 'Sonatype Maven Central', domains: ['G29'], host: 'search.maven.org',
    url_template: 'https://search.maven.org/solrsearch/select?q=kotlin+{query}&rows=5&wt=json', smoke_query: 'coroutines', records_path: 'response.docs',
    field_map: { canonical_record_id: 'id', title: { path: 'a', default: '' }, excerpt: { path: 'g', default: '' }, fields: { latest_version: { path: 'latestVersion', default: '' } } },
    routing_terms: ['kotlin', 'maven kotlin', 'Kotlin'], public_source: true
  })
]);

const ROUTING_OVERRIDES_SPECIALIST_EXPANSION = Object.freeze(Object.fromEntries(
  PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_SPECIALIST_EXPANSION
    .filter((provider) => Array.isArray(provider.routing_terms) && provider.routing_terms.length)
    .map((provider) => [provider.provider_id, Object.freeze([...provider.routing_terms])])
));

module.exports = {
  PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_SPECIALIST_EXPANSION,
  ROUTING_OVERRIDES_SPECIALIST_EXPANSION
};