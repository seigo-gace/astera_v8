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
  assert.equal(graph.source, row.input, `${row.id} original source changed`);
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

test('source graph preserves original Unicode while keeping separate normalized text', () => {
  const input = '＋ボタン\r\nＡＢＣとABCを区別して保持する。';
  const graph = buildSourceGraph(input, 'ja');
  assert.equal(graph.source, input);
  assert.notEqual(graph.normalized_source, input);
  assert.equal(graph.nodes[0].text, input);
});

test('language detection distinguishes Japanese and English without document-type assumptions', () => {
  assert.equal(detectLanguage('契約条項の適用判断について確認する。'), 'ja');
  assert.equal(detectLanguage('Review the contract clause and preserve the evidence boundary.'), 'en');
});

test('English periods split ordinary sentences but preserve dotted identifiers, versions, decimals, and domains', () => {
  const input = 'Review Node.js v1.2.3 at 99.9% coverage on example.com. Verify rollback behavior next.';
  const graph = buildSourceGraph(input, 'en');
  const sentences = graph.nodes.filter((node) => node.kind === 'sentence').map((node) => node.text);
  assert.deepEqual(sentences, [
    'Review Node.js v1.2.3 at 99.9% coverage on example.com.',
    'Verify rollback behavior next.'
  ]);
  assert.equal(sentences.join(' '), input);
});

test('English abbreviations do not create phantom sentence boundaries', () => {
  const input = 'Review the evidence, e.g. the incident log. Verify the conclusion.';
  const graph = buildSourceGraph(input, 'en');
  const sentences = graph.nodes.filter((node) => node.kind === 'sentence').map((node) => node.text);
  assert.deepEqual(sentences, [
    'Review the evidence, e.g. the incident log.',
    'Verify the conclusion.'
  ]);
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

test('dependent Japanese continuation keeps literal message text inside one judgment request', () => {
  const text = 'OptionがOFFの場合は、オプション名をオンにしてください。の表示を入れるようにしろ。';
  const { semantic_atoms: atoms } = buildUniversalSourceUnderstanding(text, 'ja');
  assert.equal(atoms.request_atoms.length, 1, JSON.stringify(atoms.request_atoms, null, 2));
  assert.match(atoms.request_atoms[0].text, /オプション名をオンにしてください/u);
  assert.match(atoms.request_atoms[0].text, /表示を入れるようにしろ/u);
  assert.equal(atoms.request_atoms[0].operation, 'implement');
  assert.ok((atoms.request_atoms[0].merged_source_atom_ids || []).length >= 2);
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


test('English dependent correction and conjunction-led prohibition do not become phantom requests', () => {
  const input = 'History seems to disappear after reload, so verify whether persistence is broken or only rendering is broken, fix the correct side, but do not invent a new DB.';
  const { semantic_atoms: atoms } = buildUniversalSourceUnderstanding(input, 'en');
  assert.equal(atoms.request_atoms.length, 1, JSON.stringify(atoms.request_atoms, null, 2));
  assert.match(atoms.request_atoms[0].text, /verify whether persistence is broken or only rendering is broken, fix the correct side/iu);
  const prohibitions = atoms.atoms.filter((atom) => atom.type === 'PROHIBITION').map((atom) => atom.text);
  assert.ok(prohibitions.some((value) => /do not invent a new DB/iu.test(value)));
  assert.ok(!atoms.request_atoms.some((request) => /do not invent a new DB/iu.test(request.text)));
});

test('short command with its own explicit subject remains an independent request', () => {
  const input = 'Verify whether persistence is broken. Fix the API.';
  const { semantic_atoms: atoms } = buildUniversalSourceUnderstanding(input, 'en');
  assert.equal(atoms.request_atoms.length, 2, JSON.stringify(atoms.request_atoms, null, 2));
  assert.ok(atoms.request_atoms.some((request) => /Fix the API/iu.test(request.text)));
});


test('English subject-led and contracted prohibitions stay context instead of phantom requests', () => {
  const input = [
    'Separate user-actionable errors from internal failures: limits, credits, purchase failure, permission and unsupported file types can be explained, but internal API names, service hosts and stack traces must not leak.',
    "Don't add unrelated screens and prefer the existing structure."
  ].join(' ');
  const { semantic_atoms: atoms } = buildUniversalSourceUnderstanding(input, 'en');
  assert.equal(atoms.request_atoms.length, 1, JSON.stringify(atoms.request_atoms, null, 2));
  assert.match(atoms.request_atoms[0].text, /Separate user-actionable errors/iu);
  assert.ok(!atoms.request_atoms.some((request) => /service hosts and stack traces must not leak|Don't add unrelated screens/iu.test(request.text)));
  const prohibitions = atoms.atoms.filter((atom) => atom.type === 'PROHIBITION').map((atom) => atom.text);
  assert.ok(prohibitions.some((value) => /stack traces must not leak/iu.test(value)));
  assert.ok(prohibitions.some((value) => /Don't add unrelated screens/iu.test(value)));
});

test('English observation of uncertainty does not hide a following review request', () => {
  const input = "Users don't always know what to press so review the posting form again, and when the option is OFF don't do nothing, show an enable-option hint.";
  const { semantic_atoms: atoms } = buildUniversalSourceUnderstanding(input, 'en');
  assert.ok(atoms.request_atoms.some((request) => /review the posting form again/iu.test(request.text)), JSON.stringify(atoms.request_atoms));
  assert.ok(atoms.request_atoms.some((request) => /show an enable-option hint/iu.test(request.text)), JSON.stringify(atoms.request_atoms));
});

test('English user uncertainty is an observation, not a prohibition', () => {
  const input = "Users don't always know what to press, so review the posting form again.";
  const { semantic_atoms: atoms } = buildUniversalSourceUnderstanding(input, 'en');
  assert.ok(atoms.request_atoms.some((item) => /review the posting form/iu.test(item.text)));
  assert.equal(atoms.atoms.filter((item) => item.type === 'PROHIBITION').length, 0);
  const negativeCommand = buildUniversalSourceUnderstanding("Don't add unrelated screens.", 'en').semantic_atoms;
  assert.ok(negativeCommand.atoms.some((item) => item.type === 'PROHIBITION'));
});

test('narrow clause prohibition supersedes broad sentence prohibition', () => {
  const input = "Users are confused so review the form, and when the option is OFF do not remove the hint, show guidance.";
  const atoms = buildUniversalSourceUnderstanding(input, 'en').semantic_atoms;
  const bans = atoms.atoms.filter((item) => item.type === 'PROHIBITION');
  assert.ok(bans.some((item) => item.text.includes('do not remove')));
  assert.ok(!bans.some((item) => item.text.startsWith('Users are confused')));
});

test('subject-led product authority restriction stays a constraint, not a user Request', () => {
  const input = 'Astera must only provide judgment material and must not say this is optimal.';
  const atoms = buildUniversalSourceUnderstanding(input, 'en').semantic_atoms;
  assert.equal(atoms.request_atoms.length, 0, JSON.stringify(atoms.request_atoms));
  assert.ok(atoms.atoms.some((item) => item.type === 'PROHIBITION'));
});

test('condition atom belongs to local when-clause rather than unrelated user observation', () => {
  const input = 'Users are unsure which control to press, and when the option is OFF show an enable hint.';
  const atoms = buildUniversalSourceUnderstanding(input, 'en').semantic_atoms;
  const conditions = atoms.atoms.filter((item) => item.type === 'CONDITION');
  assert.ok(conditions.length > 0);
  assert.ok(!conditions.some((item) => item.text.startsWith('Users are unsure')), JSON.stringify(conditions));
});

test('observed nonresponsive button is not an instruction prohibiting button response', () => {
  const symptom = 'コピーはできるけど編集ボタンが反応しないことがあったので編集開始から確認してほしい。';
  const observed = buildUniversalSourceUnderstanding(symptom, 'ja').semantic_atoms.atoms;
  assert.ok(observed.some((atom) => atom.type === 'OBSERVATION' && atom.text.includes('反応しない')));
  assert.equal(observed.filter((atom) => atom.type === 'PROHIBITION').length, 0,
    'a report that a button did not respond must not become a prohibition');
  const instruction = '編集ログを保存しないこと。';
  const prohibited = buildUniversalSourceUnderstanding(instruction, 'ja').semantic_atoms.atoms;
  assert.ok(prohibited.some((atom) => atom.type === 'PROHIBITION'),
    'actual explicit negative instructions must remain prohibitions');
});

test('error-handling directive stays a request, while an observed upload error stays an observation', () => {
  const directive = '対応外なら内部エラーじゃなく普通に利用者へ案内を出すようにする。';
  const instructionAtoms = buildUniversalSourceUnderstanding(directive, 'ja').semantic_atoms.atoms;
  assert.equal(instructionAtoms.filter((atom) => atom.type === 'OBSERVATION').length, 0,
    'mentioning error in a user directive must not become a reported failure');
  const reported = 'ファイル投稿でエラーが発生したので原因を確認して。';
  const reportedAtoms = buildUniversalSourceUnderstanding(reported, 'ja').semantic_atoms.atoms;
  assert.ok(reportedAtoms.some((atom) => atom.type === 'OBSERVATION'));
});

test('noisy multi-request R11 retains conditional error guidance in one parent request', () => {
  const row = byId('known-noisy-multi-ja-1k');
  const requests = buildUniversalSourceUnderstanding(row.input, row.language).semantic_atoms.request_atoms;
  assert.ok(requests.some((atom) =>
    atom.text.includes('ファイル投稿はzipや画像でエラーになることがあるから')
    && atom.text.includes('対応外なら内部エラーじゃなく普通に利用者へ案内を出すようにする')
  ), 'conditional remediation must stay inside the source-backed upload request');
});
