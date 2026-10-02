'use strict';

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
function modelOf(judgment = {}) {
  return judgment.observable_material?.case_model || judgment.case_model || null;
}
function isMulti(model) {
  return Boolean(model?.multi_judgment && Number(model.request_count || 0) > 1);
}
function materialOntology(action, lang = 'ja') {
  const ja = {
    analyze: '現在状態、対象範囲、利用者影響、望ましい状態、判断可能になる完了条件',
    improve: '現在状態、表示・挙動の対象範囲、利用者影響、見せる情報と見せない内部情報の境界、改善後の状態、回帰を含む完了条件',
    implement: '実装箇所・接続点、現在のイベントまたは操作経路、機能ON/OFFなどの発火条件、期待する表示・挙動、既存操作への影響、受入・完了条件',
    remove: '正確な再現条件、不要物の発生源・生成元、UIならコンポーネント/CSS/style/layout等の生成経路、削除した場合の影響、再発しないことを確認する回帰条件',
    verify: '検証対象、再現条件、確認するコード・Source・Record、成立条件、反証・例外、確認完了条件',
    compare: '比較候補、比較軸、同一条件で測れる値、各候補の不足値、優劣を確定できない条件',
    decide: '判断対象、固定条件、未確定事項、比較可能な差、判断可能になる完了条件',
    integrate: '接続点、入力/出力契約、既存経路、失敗時挙動、互換性、統合完了条件',
    migrate: '現在状態と移行先、依存関係、移行順序、Rollback条件、互換性、完了条件',
    preserve: '維持対象、壊してはいけない境界、変更可能範囲、回帰確認、維持できたと判定する条件',
    explain: '説明対象、前提、確認済みSource、対象範囲、まだ不明な点'
  };
  const en = {
    analyze: 'current state, scope, user impact, desired state, and completion criteria',
    improve: 'current state, affected display/behavior scope, user impact, user-visible/internal boundary, desired state, and regression-aware completion criteria',
    implement: 'implementation/connection point, current event or interaction path, trigger state such as ON/OFF, expected behavior, compatibility impact, and acceptance criteria',
    remove: 'exact reproduction, generating source, UI component/CSS/style/layout path when applicable, removal impact, and regression criteria',
    verify: 'verification target, reproduction conditions, code/source/record to inspect, validity conditions, contrary evidence, and completion criteria',
    compare: 'candidates, dimensions, same-condition measurements, missing values, and conditions preventing a winner',
    decide: 'decision target, fixed conditions, unresolved items, comparable differences, and decision-ready criteria',
    integrate: 'integration point, input/output contract, existing path, failure behavior, compatibility, and completion criteria',
    migrate: 'current and target states, dependencies, order, rollback conditions, compatibility, and completion criteria',
    preserve: 'behavior to preserve, invariant boundary, editable scope, regression checks, and preservation criteria',
    explain: 'subject, premises, verified sources, scope, and unresolved points'
  };
  return (lang === 'ja' ? ja : en)[String(action || '')] || (lang === 'ja' ? ja.analyze : en.analyze);
}
function usefulMissingLine(value) {
  const text = clean(value);
  if (!text) return false;
  if (/^の(?:完了|合格|受入)条件/u.test(text)) return false;
  if (/^Alternative evidence angle$/iu.test(text)) return false;
  if (/^反例\s*条件不成立\s*例外$/u.test(text)) return false;
  return true;
}
function normalizeSection06(section, model, lang) {
  let text = section;
  for (const request of model.judgment_requests || []) {
    const marker = `  - ${request.id} [`;
    const start = text.indexOf(marker);
    if (start < 0) continue;
    const nextMatch = /\n  - R\d{2} \[/.exec(text.slice(start + marker.length));
    const end = nextMatch ? start + marker.length + nextMatch.index : text.length;
    let block = text.slice(start, end);
    const lines = block.split('\n').filter((line) => {
      if (/まだ不足している材料\s*:\s*の(?:完了|合格|受入)条件/u.test(line)) return false;
      if (!/まだ不足している材料/.test(line)) return true;
      return usefulMissingLine(line.replace(/^.*まだ不足している材料\s*:\s*/u, ''));
    });
    block = lines.join('\n');
    const ontology = materialOntology(request.action, lang);
    if (!block.includes(ontology)) block += `\n    - ${lang === 'ja' ? '判断に必要な確認材料' : 'Material required for judgment'}: ${ontology}`;
    text = text.slice(0, start) + block + text.slice(end);
  }
  return text;
}
function normalizeSection08(section, model, lang) {
  let text = section;
  for (const request of model.judgment_requests || []) {
    const marker = `  - ${request.id}:`;
    const start = text.indexOf(marker);
    if (start < 0) continue;
    const nextMatch = /\n  - R\d{2}:/.exec(text.slice(start + marker.length));
    const end = nextMatch ? start + marker.length + nextMatch.index : text.length;
    const block = text.slice(start, end);
    const ontology = materialOntology(request.action, lang);
    if (!block.includes(ontology)) {
      const insert = `\n    - ${lang === 'ja' ? '判断可能にするため確認する材料' : 'Material to verify before judgment'}: ${ontology}`;
      text = text.slice(0, end) + insert + text.slice(end);
    }
  }
  return text;
}
function scrubNoise(text) {
  return String(text || '')
    .replace(/\s*\/\s*\/\s*Alternative evidence angle/giu, '')
    .replace(/\s*\/\s*Alternative evidence angle/giu, '')
    .replace(/Alternative evidence angle/giu, '')
    .replace(/\s*\/\s*\/\s*/g, ' / ')
    .replace(/:\s*\/\s*/g, ': ')
    .replace(/\n[ \t]*-\s*まだ不足している材料\s*:\s*の(?:完了|合格|受入)条件を明示する。?/gu, '')
    .replace(/\n[ \t]*-?\s*の(?:完了|合格|受入)条件を明示する。?/gu, '')
    .replace(/\n[ \t]*-\s*$/gmu, '')
    .replace(/\n{3,}/g, '\n\n');
}
function normalizeMultiJudgmentPublicMaterial(material, judgment = {}) {
  const model = modelOf(judgment);
  if (!material || !isMulti(model)) return material;
  const lang = String(judgment.output_language || 'ja').split('-')[0] === 'ja' ? 'ja' : 'en';
  const sections = String(material.text || '').split('\n---\n');
  if (sections.length !== 8) return material;
  if (lang === 'ja') {
    sections[0] = sections[0].replace(/今回の入力には\d+件の判断要求がある。/u, `今回の入力は1件ではなく、${model.request_count}件の判断要求として扱う。`);
    sections[6] = sections[6].replace(/根拠成立状態も判断要求ごとに分離する/u, '要求ごとに根拠状態を分離する');
  } else {
    sections[0] = sections[0].replace(/This input contains \d+ judgment requests\./u, `Treat this input as ${model.request_count} distinct judgment requests rather than one collapsed request.`);
    sections[6] = sections[6].replace(/Keep evidence status separate by judgment request/u, 'Keep evidence status separate for every judgment request');
  }
  sections[5] = normalizeSection06(sections[5], model, lang);
  sections[7] = normalizeSection08(sections[7], model, lang);
  const text = scrubNoise(sections.join('\n---\n'));
  const nextSections = text.split('\n---\n');
  return {
    ...material,
    text,
    compact_text: nextSections.map((section) => section.replace(/\n\s*/g, ' / ')).join('\n'),
    sections: Array.isArray(material.sections)
      ? material.sections.map((section, index) => ({ ...section, text: nextSections[index]?.split('\n').slice(1).join('\n') || section.text }))
      : material.sections
  };
}

module.exports = {
  normalizeMultiJudgmentPublicMaterial,
  materialOntology,
  usefulMissingLine
};