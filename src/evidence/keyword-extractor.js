'use strict';

const DEFAULT_STOPWORDS = new Set([
  'about', 'after', 'again', 'against', 'also', 'and', 'are', 'because', 'before', 'being', 'between',
  'can', 'could', 'does', 'for', 'from', 'have', 'into', 'its', 'latest', 'more', 'most', 'not', 'now',
  'only', 'other', 'should', 'that', 'the', 'their', 'then', 'there', 'these', 'this', 'those', 'today',
  'using', 'want', 'what', 'when', 'where', 'which', 'will', 'with', 'would'
]);

function clean(value) {
  return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function stableUnique(values, limit = Infinity) {
  const output = [];
  const seen = new Set();
  for (const value of values) {
    const item = clean(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
    if (output.length >= limit) break;
  }
  return output;
}

function lensSignals(domain = {}) {
  const signals = [];
  const lenses = [domain.primary, ...(Array.isArray(domain.secondary) ? domain.secondary : [])];
  for (const lens of lenses) {
    if (!lens || !Array.isArray(lens.matched_signals)) continue;
    signals.push(...lens.matched_signals);
  }
  for (const overlay of Array.isArray(domain.overlays) ? domain.overlays : []) {
    if (Array.isArray(overlay.matched_signals)) signals.push(...overlay.matched_signals);
  }
  return stableUnique(signals);
}

function extractIdentifiers(text) {
  const source = clean(text);
  const patterns = [
    /\bCVE-\d{4}-\d{4,7}\b/gi,
    /\bGHSA-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4}\b/gi,
    /\bCWE-\d+\b/gi,
    /\bRFC[ -]?\d{3,5}\b/gi,
    /\bISO(?:\/IEC)?[ -]?\d{3,6}(?::\d{4})?\b/gi,
    /\bJIS[ -]?[A-Z]\s?\d{3,6}(?::\d{4})?\b/gi
  ];
  const values = [];
  for (const pattern of patterns) values.push(...(source.match(pattern) || []));
  return stableUnique(values, 16);
}

function extractVersions(text) {
  const source = clean(text);
  const values = [];
  const labeled = source.match(/\b(?:version|ver\.?|v|node(?:\.js)?|python|java|go|rust|php|ruby)\s*v?\d+(?:\.\d+){0,3}(?:[-+][A-Za-z0-9._-]+)?\b/gi) || [];
  values.push(...labeled);
  const standalone = source.match(/\bv?\d+\.\d+(?:\.\d+){0,2}(?:[-+][A-Za-z0-9._-]+)?\b/g) || [];
  values.push(...standalone);
  return stableUnique(values, 16);
}

function extractQuotedPhrases(text) {
  const source = String(text || '');
  const values = [];
  const patterns = [/"([^"\n]{2,120})"/g, /'([^'\n]{2,120})'/g, /「([^」\n]{2,120})」/g, /『([^』\n]{2,120})』/g];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) values.push(match[1]);
  }
  return stableUnique(values, 12);
}

function extractTechnicalTokens(text) {
  const source = clean(text);
  const tokens = source.match(/\b[A-Za-z][A-Za-z0-9_.@/+:#-]{1,63}\b/g) || [];
  const selected = tokens.filter((token) => {
    const lower = token.toLowerCase();
    if (DEFAULT_STOPWORDS.has(lower)) return false;
    if (/^(https?|file|text|data|input|output|source|search)$/i.test(token)) return false;
    if (/^[A-Z0-9]{2,12}$/.test(token)) return true;
    if (/[0-9_.@/+:#-]/.test(token)) return true;
    if (/[a-z][A-Z]/.test(token)) return true;
    return false;
  });
  const katakana = source.match(/[ァ-ヶー]{3,32}/g) || [];
  return stableUnique([...selected, ...katakana], 20);
}

function parseAliasMap(value = process.env.ASTERA_EVIDENCE_ALIASES_JSON || '') {
  if (!value) return {};
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

function expandAliases(keywords, aliasMap, maxPerKeyword = 3) {
  const aliases = [];
  for (const keyword of keywords) {
    const direct = aliasMap[keyword] || aliasMap[keyword.toLowerCase()];
    if (!Array.isArray(direct)) continue;
    aliases.push(...direct.slice(0, maxPerKeyword));
  }
  return stableUnique(aliases);
}

function needsFreshness({ text = '', domain = {}, identifiers = [] } = {}) {
  if ((domain.overlays || []).some((overlay) => overlay.id === 'current_information')) return true;
  if (identifiers.some((item) => /^(CVE|GHSA)-/i.test(item))) return true;
  return /最新|現在|今日|昨日|今年|現行|料金|価格|法改正|更新|発売|リリース|current|latest|today|pricing|price|release|updated?|version/i.test(String(text || ''));
}

function extractKeywordPacket({ question = '', context = '', domain = {}, aliasMap, maxKeywords } = {}) {
  const inputText = [question, context].filter(Boolean).join('\n');
  const detected = stableUnique([
    ...lensSignals(domain),
    ...extractIdentifiers(inputText),
    ...extractVersions(inputText),
    ...extractQuotedPhrases(inputText),
    ...extractTechnicalTokens(inputText)
  ]);
  const aliases = expandAliases(detected, parseAliasMap(aliasMap));
  const limit = Math.max(1, Number(maxKeywords || process.env.ASTERA_EVIDENCE_MAX_KEYWORDS || 24));
  const keywords = stableUnique([...detected, ...aliases], limit);
  const identifiers = extractIdentifiers(inputText);
  const versions = extractVersions(inputText);
  const phrases = extractQuotedPhrases(inputText);
  const freshnessRequired = needsFreshness({ text: inputText, domain, identifiers });

  return {
    schema_version: 'astera.evidence.keywords.v1',
    keywords,
    detected_keywords: stableUnique(detected, limit),
    aliases: stableUnique(aliases, limit),
    identifiers,
    versions,
    phrases,
    freshness_required: freshnessRequired,
    source: 'lens_matched_signals_and_input_identifiers'
  };
}

module.exports = {
  extractKeywordPacket,
  extractIdentifiers,
  extractVersions,
  extractQuotedPhrases,
  extractTechnicalTokens,
  lensSignals,
  needsFreshness,
  stableUnique
};
