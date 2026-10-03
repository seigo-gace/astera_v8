'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { loadUniversalCorpus, DOMAINS } = require('../scripts/universal-judgment-corpus-v1');

const ROOT = path.resolve(__dirname, '..');

function walkJs(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJs(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

test('universal corpus covers JA/EN, known long failures, 10k stress and all G01-G38 pairs', () => {
  const corpus = loadUniversalCorpus();
  assert.equal(DOMAINS.length, 38);
  assert.equal(corpus.length, 82);

  const genreCases = corpus.filter((c) => c.kind === 'domain');
  assert.equal(genreCases.length, 76);
  const genres = [...new Set(genreCases.map((c) => c.expected.genre))].sort();
  assert.deepEqual(genres, Array.from({ length: 38 }, (_, i) => `G${String(i + 1).padStart(2, '0')}`));

  for (const genre of genres) {
    const rows = genreCases.filter((c) => c.expected.genre === genre);
    assert.equal(rows.length, 2, `${genre} must have JA and EN cases`);
    assert.deepEqual([...new Set(rows.map((r) => r.language))].sort(), ['en', 'ja']);
    for (const row of rows) {
      assert.ok(row.expected.material_terms.length >= 6, `${row.id} needs bilingual material-term gold`);
    }
  }

  const known = corpus.filter((c) => c.kind === 'known_failure');
  assert.equal(known.length, 4);
  assert.ok(known.find((c) => c.id === 'known-noisy-multi-ja-1k').input.length >= 1000);
  assert.ok(known.find((c) => c.id === 'known-noisy-multi-en-1k').input.length >= 1000);
  assert.ok(known.find((c) => c.id === 'known-clean-ai-ja-5k').input.length >= 3000);
  assert.ok(known.find((c) => c.id === 'known-clean-ai-en-5k').input.length >= 3000);

  const stress = corpus.filter((c) => c.kind === 'stress');
  assert.equal(stress.length, 2);
  assert.ok(stress.every((c) => c.input.length >= 10000));
  assert.deepEqual(stress.map((c) => c.language).sort(), ['en', 'ja']);
});

test('every bilingual pair has both languages and equivalent high-level acceptance shape', () => {
  const corpus = loadUniversalCorpus();
  const pairs = new Map();
  for (const row of corpus) {
    if (!pairs.has(row.pair)) pairs.set(row.pair, []);
    pairs.get(row.pair).push(row);
  }

  for (const [pair, rows] of pairs) {
    assert.equal(rows.length, 2, `${pair} must have exactly two language variants`);
    const ja = rows.find((r) => r.language === 'ja');
    const en = rows.find((r) => r.language === 'en');
    assert.ok(ja && en, `${pair} missing JA/EN variant`);
    assert.equal(ja.expected.min_requests, en.expected.min_requests, `${pair} request gold differs by language`);
    assert.equal(ja.expected.evidence_requested, en.expected.evidence_requested, `${pair} evidence-intent gold differs by language`);
    assert.equal(ja.expected.genre || null, en.expected.genre || null, `${pair} genre differs by language`);
  }
});

test('production runtime does not import verification corpus', () => {
  const files = walkJs(path.join(ROOT, 'src'));
  const offenders = [];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    if (source.includes('universal-judgment-corpus-v1') || source.includes('known-noisy-multi-ja-1k')) {
      offenders.push(path.relative(ROOT, file));
    }
  }
  assert.deepEqual(offenders, [], 'runtime must not hard-code corpus authority');
});
