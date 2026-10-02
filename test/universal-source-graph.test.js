'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { loadUniversalCorpus } = require('../scripts/universal-judgment-corpus-v1');
const {
  buildSourceGraph,
  buildSemanticAtoms,
  buildUniversalSourceUnderstanding,
  detectLanguage
} = require('../src/runtime/universal-source-graph');

function byId(id) {
  const row = loadUniversalCorpus().find((item) => item.id === id);
  assert.ok(row, `missing corpus case ${id}`);
  return row;
}

function assertLossless(row) {
  const graph = buildSourceGraph(row.input, row.language);
  assert.equal(graph.source, row.input.normalize('NFKC').replace(/\r\n?/g, '\n'));
  assert.equal(graph.language, row.language);
  assert.equal(graph.source_length, graph.source.length);
  assert.ok(graph.nodes.length > 1);
  for (const node of graph.nodes) {
    assert.ok(node.source_span.start >= 0, `${row.id}:${node.id} invalid start`);
    assert.ok(node.source_span.end <= graph.source.length, `${row.id}:${node.id} invalid end`);
    assert.ok(node.source_span.end > node.source_span.start, `${row.id}:${node.id} empty span`);
    assert.equal(
      graph.source.slice(node.source_span.start, node.source_span.end),
      node.text,
      `${row.id}:${node.id} span does not reproduce exact source`
    );
  }
  return graph;
}

for (const id of [
  'known-noisy-multi-ja-1k',
  'known-noisy-multi-en-1k',
  'known-clean-ai-ja-5k',
  'known-clean-ai-en-5k',
  'stress-ja-10k',
  'stress-en-10k'
]) {
  test(`source graph is lossless for ${id}`, () => {
    assertLossless(byId(id));
  });
}

test('language detection distinguishes Japanese and English without document-type assumptions', () => {
  assert.equal(detectLanguage('契約条項の適用判断について確認する。'), 'ja');
  assert.equal(detectLanguage('Review the contract clause and preserve the evidence boundary.'), 'en');
});

test('noisy JA/EN examples expose many source-backed requests rather than one post = one request', () => {
  for (const id of ['known-noisy-multi-ja-1k', 'known-noisy-multi-en-1k']) {
    const row = byId(id);
    const understanding = buildUniversalSourceUnderstanding(row.input, row.language);
    const requests = understanding.semantic_atoms.request_atoms;
    assert.ok(requests.length >= 10, `${id} request atoms collapsed to ${requests.length}`);
    assert.ok(requests.every((request) => request.source_span.end > request.source_span.start));
    assert.ok(new Set(requests.map((request) => request.text)).size >= 8, `${id} request atoms were duplicated instead of decomposed`);
  }
});

test('formal AI design objectives are recognized in JA and EN even without imperative endings', () => {
  for (const id of ['known-clean-ai-ja-5k', 'known-clean-ai-en-5k']) {
    const row = byId(id);
    const graph = assertLossless(row);
    const atoms = buildSemanticAtoms(graph);
    const requests = atoms.request_atoms;
    const objectives = atoms.atoms.filter((atom) => atom.type === 'OBJECTIVE');
    assert.ok(requests.length >= 12, `${id} expected >=12 request atoms, got ${requests.length}`);
    assert.ok(objectives.length >= 10, `${id} expected many objective atoms, got ${objectives.length}`);
  }
});

test('10k stress input preserves multiple semantic units in both languages', () => {
  for (const id of ['stress-ja-10k', 'stress-en-10k']) {
    const row = byId(id);
    const understanding = buildUniversalSourceUnderstanding(row.input, row.language);
    assert.ok(understanding.semantic_atoms.request_atoms.length >= 8, `${id} request collapse`);
    assert.ok((understanding.semantic_atoms.counts.PROHIBITION || 0) >= 1, `${id} lost prohibition semantics`);
    assert.ok((understanding.semantic_atoms.counts.OBSERVATION || 0) >= 1, `${id} lost observation semantics`);
  }
});

test('conditions/exceptions/prohibitions remain semantic atoms instead of being lost', () => {
  const text = [
    '画像投稿後の不要線を削除して。',
    'ただし必要なAttachment境界は残す。',
    'OptionがOFFの場合は対象Option名を案内すること。',
    '新しいDatabaseは追加しない。'
  ].join('\n');
  const { semantic_atoms: atoms } = buildUniversalSourceUnderstanding(text, 'ja');
  assert.ok(atoms.request_atoms.length >= 2);
  assert.ok((atoms.counts.EXCEPTION || 0) >= 1);
  assert.ok((atoms.counts.CONDITION || 0) >= 1);
  assert.ok((atoms.counts.PRESERVE || 0) >= 1);
  assert.ok((atoms.counts.PROHIBITION || 0) >= 1);
});

test('source graph does not assign truth to user observations', () => {
  const { semantic_atoms: atoms } = buildUniversalSourceUnderstanding('画像投稿後に線が出ることがあるので原因を確認して。', 'ja');
  const observations = atoms.atoms.filter((atom) => atom.type === 'OBSERVATION');
  assert.ok(observations.length >= 1);
  assert.ok(observations.every((atom) => atom.truth_state === 'USER_REPORTED_UNVERIFIED'));
});

test('G01-G38 JA/EN cases remain parseable through the same source graph contract', () => {
  const domainRows = loadUniversalCorpus().filter((row) => row.kind === 'domain');
  assert.equal(domainRows.length, 76);
  for (const row of domainRows) {
    const understanding = buildUniversalSourceUnderstanding(row.input, row.language);
    assert.equal(understanding.source_graph.language, row.language, row.id);
    assert.ok(understanding.semantic_atoms.request_atoms.length >= 1, `${row.id} has no source-backed request`);
    assert.ok(understanding.semantic_atoms.atoms.some((atom) => atom.type === 'EVIDENCE_REQUIREMENT'), `${row.id} lost evidence intent`);
  }
});
