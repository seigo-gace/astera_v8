'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { routeDomainTemplates } = require('../src/domain-template-router');

const IDS = Array.from({ length: 38 }, (_, index) => `G${String(index + 1).padStart(2, '0')}`);

test('explicit G01-G38 identifiers select the same primary lens in Japanese and English framing', () => {
  for (const id of IDS) {
    const ja = routeDomainTemplates({ question: `【${id}】この分野について判断材料を整理する。` });
    const en = routeDomainTemplates({ question: `[${id}] Organize judgment material for this domain.` });

    assert.equal(ja.primary?.id, id, `${id} ja -> ${ja.primary?.id || 'ABSTAIN'}`);
    assert.equal(en.primary?.id, id, `${id} en -> ${en.primary?.id || 'ABSTAIN'}`);
    assert.ok(ja.primary?.matched_signals.includes(id), `${id} ja missing controlled identity signal`);
    assert.ok(en.primary?.matched_signals.includes(id), `${id} en missing controlled identity signal`);
  }
});

test('genre-like but invalid identifiers do not become controlled aliases', () => {
  for (const id of ['G00', 'G39', 'G99']) {
    const out = routeDomainTemplates({ question: `[${id}] Organize judgment material.` });
    assert.notEqual(out.primary?.id, id);
  }
});
