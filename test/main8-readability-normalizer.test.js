'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeUnifiedMain8Text,
  deadlinePhrase,
  requestTarget
} = require('../src/runtime/main8-readability-normalizer');

function main8() {
  return [
    '01 本当の目的\n- 今回の目的: FAQ判断材料',
    [
      '02 前提不足',
      '- 判断中も変えてはいけない前提・制約・未確定事項:',
      '  - 禁止条件: 最終判断や推奨は',
      '  - 期限: 来週金曜までにFAQへ新しい問い合わせ例を追加するための判断材料を整理して。',
      '  - 維持条件: 公開済みの返金ポリシー文言は変えない。',
      '  - 禁止条件: 最終判断や推奨はを禁止する',
      '  - 禁止条件: 最終判断や推奨はしないで。',
      '  - 未確定条件: 法務確認はまだ終わっていない。'
    ].join('\n'),
    [
      '03 事実確認',
      '- 入力で与えられた具体材料:',
      '  - 2026年10月1日時点のNode.js 22の公式サポート状況を、公式根拠を確認して判断材料として整理してください。',
      '- 区別: 上記は利用者が与えた材料として保持する。外部事実として確認済みという意味ではない。'
    ].join('\n'),
    '04 危機察知\n- 未確認事項を断定しない。',
    [
      '05 反対視点',
      '- 確認対象: 2026年10月1日時点のNode.js 22の公式サポート状況を、公式根拠を確認して判断材料として整理してください。',
      '  - A案: A案とB案を作業時間で比較して。 / A案は問い合わせ例を3件追加、B案は10件追加。',
      '  - B案: A案とB案を作業時間で比較して。 / A案は問い合わせ例を3件追加、B案は10件追加。'
    ].join('\n'),
    [
      '06 比較案',
      '- A案 について現在ある材料: A案とB案を作業時間で比較して。 / A案は問い合わせ例を3件追加、B案は10件追加。',
      '- B案 について現在ある材料: A案とB案を作業時間で比較して。 / A案は問い合わせ例を3件追加、B案は10件追加。',
      '- 数量だけで確実に言える差: A案=3件、B案=10件。数量差は7件。'
    ].join('\n'),
    [
      '07 根拠成立状態',
      '- 根拠状態を判定する対象になっている入力材料:',
      '  - 2026年10月1日時点のNode.js 22の公式サポート状況を、公式根拠を確認して判断材料として整理してください。',
      '- 外部根拠は未成立。'
    ].join('\n'),
    '08 主役AI／利用者への再指示\n- 未確定のまま保持する。'
  ].join('\n---\n');
}

test('readability normalization removes duplicate prohibition templates and normalizes deadline', () => {
  const out = normalizeUnifiedMain8Text(main8());
  const section = out.split('\n---\n')[1];
  assert.equal((section.match(/禁止条件:/g) || []).length, 1);
  assert.match(section, /禁止条件: 最終判断や推奨はしないで。/);
  assert.match(section, /期限: 来週金曜まで(?:\n|$)/);
  assert.doesNotMatch(section, /はを禁止する/);
});

test('request instructions are not presented as facts and verification target is shortened', () => {
  const out = normalizeUnifiedMain8Text(main8());
  const sections = out.split('\n---\n');
  assert.match(sections[2], /依頼文そのものは事実として数えない/);
  assert.doesNotMatch(sections[2], /入力で与えられた具体材料:\n\s+- .*してください/);
  assert.match(sections[4], /確認対象: 2026年10月1日時点のNode\.js 22の公式サポート状況/);
  assert.match(sections[6], /2026年10月1日時点のNode\.js 22の公式サポート状況/);
  assert.doesNotMatch(sections[6], /判断材料として整理してください/);
});

test('candidate material is candidate-specific when quantities are known', () => {
  const out = normalizeUnifiedMain8Text(main8());
  const sections = out.split('\n---\n');
  assert.match(sections[4], /A案について入力で確認できる数量は3件/);
  assert.match(sections[4], /B案について入力で確認できる数量は10件/);
  assert.match(sections[5], /A案について入力で確認できる数量は3件/);
  assert.match(sections[5], /B案について入力で確認できる数量は10件/);
});

test('deadline and request target helpers are deterministic', () => {
  assert.equal(deadlinePhrase('来週金曜までにFAQへ追加する'), '来週金曜まで');
  assert.equal(
    requestTarget('2026年10月1日時点のNode.js 22の公式サポート状況を、公式根拠を確認して判断材料として整理してください。'),
    '2026年10月1日時点のNode.js 22の公式サポート状況'
  );
});

test('public readability strips internal task/status/comparison field markers without deleting semantic text', () => {
  const source = [
    '01 本当の目的\n- 目的: 判断材料を整理する',
    '02 前提不足\n- 未確認事項を保持する',
    '03 事実確認\n- 事実は未確認',
    [
      '04 危機察知',
      '- T06:undetermined:[22] 未確定Claimを確定事実として扱う危険',
      '- T07:medical_safety[28] 健康・安全への高影響判断'
    ].join('\n'),
    '05 反対視点\n- 反証を確認する',
    [
      '06 比較案',
      '- candidates: A / B',
      '- dimensions: Cost / Risk',
      '- label: A',
      '- observations: :UNDETERMINED:利用者入力',
      '- supported_scopes: -',
      '- evidence_refs: -',
      '- dimension: Cost',
      '- conditions: same scope',
      '- constraints: same assumptions',
      '- unsupported_scope: claim_id=C01; reasons=MISSING',
      '- 判断・比較で揃える専門軸:',
      '  - Cost',
      '  - Risk'
    ].join('\n'),
    '07 根拠成立状態\n- 外部根拠は未成立',
    '08 主役AI／利用者への再指示\n- 未確定を保持する'
  ].join('\n---\n');

  const out = normalizeUnifiedMain8Text(source);
  assert.match(out, /未確定Claimを確定事実として扱う危険/);
  assert.match(out, /健康・安全への高影響判断/);
  assert.match(out, /判断・比較で揃える専門軸/);
  assert.match(out, /Cost/);
  assert.match(out, /Risk/);
  assert.doesNotMatch(out, /T06:undetermined|T07:medical_safety|:UNDETERMINED:/);
  assert.doesNotMatch(out, /^\s*-\s*(?:candidates|dimensions|label|observations|supported_scopes|evidence_refs|dimension|conditions|constraints|unsupported_scope)\s*:/mu);
  assert.doesNotMatch(out, /claim_id\s*=/u);
});
