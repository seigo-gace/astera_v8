'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildUniversalSourceUnderstanding,
  isMaterialShapingDirective
} = require('../src/runtime/universal-source-graph');

function materialAtoms(understanding) {
  return understanding.semantic_atoms.atoms.filter((atom) => atom.type === 'MATERIAL_REQUIREMENT');
}

test('English judgment-material shaping directives stay inside one owning decision request', () => {
  const input = [
    'Review the software architecture change.',
    'Separate known facts from unresolved items, identify material risks and disconfirming conditions, state comparison dimensions and evidence requirements, and say what should be verified next.'
  ].join(' ');
  const understanding = buildUniversalSourceUnderstanding(input, 'en');
  assert.equal(understanding.semantic_atoms.request_atoms.length, 1, JSON.stringify(understanding.semantic_atoms, null, 2));
  assert.match(understanding.semantic_atoms.request_atoms[0].text, /software architecture change/i);
  assert.ok(materialAtoms(understanding).length >= 3, JSON.stringify(understanding.semantic_atoms, null, 2));
  assert.ok(materialAtoms(understanding).every((atom) => atom.material_requirement_owner_atom_id));
});

test('Japanese judgment-material shaping sentence stays with its owning decision request', () => {
  const input = 'System設計変更を検討して。現在分かっている事実、未確認事項、主要な危険、反対側から確認すべき条件、比較に必要な軸、必要な根拠とその成立状態、次に確認する材料を示して。';
  const understanding = buildUniversalSourceUnderstanding(input, 'ja');
  assert.equal(understanding.semantic_atoms.request_atoms.length, 1, JSON.stringify(understanding.semantic_atoms, null, 2));
  assert.match(understanding.semantic_atoms.request_atoms[0].text, /System設計変更/u);
  assert.ok(materialAtoms(understanding).length >= 1, JSON.stringify(understanding.semantic_atoms, null, 2));
});

test('material instruction with its own explicit subject remains an independent request', () => {
  const inputs = [
    'Review the API migration; Identify material risks for the payment migration.',
    'Review Project A; State comparison dimensions for Project B.'
  ];
  for (const input of inputs) {
    const understanding = buildUniversalSourceUnderstanding(input, 'en');
    assert.equal(understanding.semantic_atoms.request_atoms.length, 2, JSON.stringify(understanding.semantic_atoms, null, 2));
  }
});

test('material shaping detection does not classify ordinary implementation requests as output shaping', () => {
  assert.equal(isMaterialShapingDirective('Fix the API response and verify rollback behavior.'), false);
  assert.equal(isMaterialShapingDirective('画像投稿後の不要線を消して。'), false);
});
