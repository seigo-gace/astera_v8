'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REQUIRED_DOMAINS = Object.freeze(Array.from({ length: 38 }, (_, index) => `G${String(index + 1).padStart(2, '0')}`));
const DEFAULT_KB_TARGET_FILE = path.join(__dirname, '..', '..', '..', 'config', 'evidence-kb-targets.public.tsv');
const EXPECTED_HEADER = Object.freeze(['kb', 'official_url', 'genres_csv', 'accesses_csv', 'statuses_csv']);

function splitCsv(value) {
  return [...new Set(String(value || '').split(',').map((item) => item.trim()).filter(Boolean))];
}

function parseGenres(value) {
  return [...new Set(String(value || '').toUpperCase().match(/G(?:0[1-9]|[12][0-9]|3[0-8])/g) || [])].sort();
}

function tokenize(value) {
  return [...new Set(String(value || '').toLowerCase().match(/[\p{L}\p{N}._+-]{2,}/gu) || [])];
}

function normalizeTarget(columns, index) {
  if (columns.length !== EXPECTED_HEADER.length) throw new Error(`KB target row ${index} must contain ${EXPECTED_HEADER.length} columns`);
  const [kbRaw, urlRaw, genresRaw, accessesRaw, statusesRaw] = columns;
  const kb = String(kbRaw || '').trim();
  const officialUrl = String(urlRaw || '').trim();
  if (!kb || !officialUrl) throw new Error(`KB target row ${index} is missing kb or official_url`);
  const parsedUrl = new URL(officialUrl);
  if (!['https:', 'http:'].includes(parsedUrl.protocol)) throw new Error(`KB target row ${index} must use HTTP(S)`);
  const genres = parseGenres(genresRaw);
  for (const domain of genres) if (!REQUIRED_DOMAINS.includes(domain)) throw new Error(`KB target row ${index} has invalid domain ${domain}`);
  const accesses = splitCsv(accessesRaw).map((value) => value.toUpperCase()).sort();
  const statuses = splitCsv(statusesRaw).map((value) => value.toUpperCase()).sort();
  const blocked = statuses.includes('BLOCKED');
  const publicNoAuth = accesses.includes('FREE_NO_AUTH');
  const targetState = blocked ? 'BLOCKED' : publicNoAuth ? 'PUBLIC_NO_AUTH' : accesses.includes('FREE_AUTH') ? 'AUTH_REQUIRED' : accesses.includes('CONSTRAINED') ? 'CONSTRAINED' : 'RECORDED';
  const target = {
    target_id: `kb_target_${String(index).padStart(4, '0')}`,
    kb,
    official_url: officialUrl,
    host: parsedUrl.hostname.toLowerCase(),
    genres: Object.freeze(genres),
    recorded_accesses: Object.freeze(accesses),
    recorded_statuses: Object.freeze(statuses),
    target_state: targetState,
    automatic_search_eligible: publicNoAuth && !blocked
  };
  return Object.freeze(target);
}

class KbTargetRegistry {
  constructor(targets, options = {}) {
    if (!Array.isArray(targets) || targets.length === 0) throw new TypeError('KB targets must not be empty');
    const seen = new Set();
    for (const target of targets) {
      const key = target.official_url.trim().toLowerCase();
      if (seen.has(key)) throw new Error(`duplicate KB target URL: ${target.official_url}`);
      seen.add(key);
    }
    this.targets = Object.freeze([...targets]);
    this.source_record_count = Number(options.source_record_count || targets.length);
    this.target_count = targets.length;
    this.automatic_target_count = targets.filter((target) => target.automatic_search_eligible).length;
    Object.freeze(this);
  }

  static load(filePath = DEFAULT_KB_TARGET_FILE, options = {}) {
    const text = fs.readFileSync(path.resolve(filePath), 'utf8').replace(/^\uFEFF/, '');
    const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
    if (lines.length < 2) throw new Error('KB target registry is empty');
    const header = lines[0].split('\t');
    if (header.length !== EXPECTED_HEADER.length || header.some((value, index) => value !== EXPECTED_HEADER[index])) throw new Error('KB target registry header is invalid');
    const targets = lines.slice(1).map((line, index) => normalizeTarget(line.split('\t'), index + 1));
    const expectedCount = Number(options.expected_target_count || 663);
    if (expectedCount > 0 && targets.length !== expectedCount) throw new Error(`KB target registry expected ${expectedCount} targets, got ${targets.length}`);
    return new KbTargetRegistry(targets, { source_record_count: options.source_record_count || 714 });
  }

  select(plan, options = {}) {
    const limit = Math.max(1, Math.min(128, Number(options.limit || 32)));
    const domain = plan?.domain_lens?.id ? String(plan.domain_lens.id).toUpperCase() : null;
    const queryText = [...(plan?.primary_query_set || []), ...(plan?.reinforcement_query_set || [])].map((query) => query?.text || '').join(' ');
    const tokens = tokenize(queryText);
    const ranked = [];
    for (const target of this.targets) {
      if (!target.automatic_search_eligible) continue;
      const domainMatch = !domain || target.genres.includes(domain);
      const haystack = `${target.kb} ${target.host} ${target.official_url}`.toLowerCase();
      const tokenMatches = tokens.filter((token) => haystack.includes(token)).length;
      if (domain && !domainMatch && tokenMatches === 0) continue;
      if (!domain && tokens.length > 0 && tokenMatches === 0) continue;
      const passBoost = target.recorded_statuses.includes('PASS') ? 5 : 0;
      const score = (domainMatch ? 100 : 0) + tokenMatches * 20 + passBoost;
      ranked.push({ target, score });
    }
    ranked.sort((a, b) => b.score - a.score || a.target.kb.localeCompare(b.target.kb) || a.target.official_url.localeCompare(b.target.official_url));
    return Object.freeze(ranked.slice(0, limit).map(({ target }) => target));
  }

  summary() {
    return Object.freeze({ source_record_count: this.source_record_count, target_count: this.target_count, automatic_target_count: this.automatic_target_count });
  }
}

module.exports = { KbTargetRegistry, DEFAULT_KB_TARGET_FILE, REQUIRED_DOMAINS };
