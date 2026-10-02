'use strict';

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
function comparable(value) {
  return clean(value).replace(/^(?:また|さらに|なお)\s*/u, '').replace(/[。．.]+$/u, '').trim();
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
function counterOntology(action, lang = 'ja') {
  const ja = {
    implement: '追加先を誤っていないか、OFF・失敗・未設定時に無反応や誤案内にならないか、既存操作を壊さないかを確認する。',
    improve: '見直しで必要情報まで隠さないか、変更対象外まで変えないか、改善後に別の利用者影響を生まないかを確認する。',
    remove: '見えている不要物だけを消して原因を残していないか、必要な境界やAttachment表示まで消さないか、再発しないかを確認する。',
    verify: '支持材料だけでなく反証・例外・対象範囲違い・時点違いを同じ強さで確認する。',
    compare: '単一指標だけで優劣を決めず、各候補を同一条件・同一軸で比較できているか確認する。',
    integrate: '片側だけ正常でも契約不一致・失敗時処理・既存経路破壊がないか確認する。',
    migrate: '移行成功だけでなくRollback不能、データ・契約互換性、途中状態の失敗を確認する。',
    preserve: '維持対象を守るために必要な変更まで禁止していないか、境界外の副作用がないか確認する。',
    explain: '説明が確認済み事実と未確認情報を混ぜていないか、対象範囲を越えて一般化していないか確認する。',
    decide: '判断に都合のよい材料だけを残していないか、未確定事項を0や問題なしへ置き換えていないか確認する。',
    analyze: '現在状態・例外・影響範囲・失敗条件を確認し、利用者報告から原因を推測確定しない。'
  };
  const en = {
    implement: 'Check wrong insertion points, OFF/failure/unconfigured behavior, and regressions in existing actions.',
    improve: 'Check whether useful information is hidden, out-of-scope behavior changes, or new user impact is introduced.',
    remove: 'Check whether only the symptom is hidden, necessary UI boundaries are removed, or the defect can recur.',
    verify: 'Check contrary evidence, exceptions, scope mismatches, and time mismatches as strongly as supporting material.',
    compare: 'Do not choose by one metric; compare candidates under the same conditions and dimensions.',
    integrate: 'Check contract mismatch, failure behavior, and regressions even when one side works.',
    migrate: 'Check rollback failure, data/contract compatibility, and intermediate-state failures.',
    preserve: 'Check whether preservation blocks necessary changes or causes side effects outside the protected boundary.',
    explain: 'Check that verified facts and unresolved information remain separate and are not overgeneralized.',
    decide: 'Check for selection bias and for unresolved items being converted into zero or no-problem assumptions.',
    analyze: 'Check current state, exceptions, scope, and failure conditions without inferring causes from user reports.'
  };
  return (lang === 'ja' ? ja : en)[String(action || '')] || (lang === 'ja' ? ja.analyze : en.analyze);
}
function emptyCompletionPlaceholder(value) {
  return /^の(?:完了|合格|受入)(?:・(?:完了|合格|受入))*条件/u.test(clean(value));
}
function containsCompletionPlaceholder(value) {
  return /の(?:完了|合格|受入)(?:・(?:完了|合格|受入))*条件を明示する/u.test(clean(value));
}
function nearRequestRestatement(value, requestText = '') {
  const text = comparable(value);
  const request = comparable(requestText);
  if (!text || !request) return false;
  return text === request || request.includes(text) || text.includes(request);
}
function usefulMissingLine(value, requestText = '') {
  const text = clean(value);
  if (!text) return false;
  if (emptyCompletionPlaceholder(text) || containsCompletionPlaceholder(text)) return false;
  if (/^Alternative evidence angle$/iu.test(text)) return false;
  if (/^反例\s*条件不成立\s*例外$/u.test(text)) return false;
  if (nearRequestRestatement(text, requestText)) return false;
  return true;
}
function usefulCounterPart(value, requestText = '') {
  const text = clean(value);
  if (!text) return false;
  if (/Alternative evidence angle/iu.test(text)) return false;
  if (/反例\s*条件不成立\s*例外/u.test(text)) return false;
  if (/(?:肯定形|否定形)\s*$/u.test(text)) return false;
  if (/^検討しろ[。.]?$/u.test(text)) return false;
  if (nearRequestRestatement(text, requestText)) return false;
  return true;
}
function normalizeSection03(section, model, lang) {
  if (lang !== 'ja') return section;
  const observations = (model.observations || []).map((item) => comparable(item?.text)).filter(Boolean);
  return section.split('\n').map((line) => {
    const match = /^  - (R\d{2}):\s*(.*)$/u.exec(line);
    if (!match) return line;
    const request = (model.judgment_requests || []).find((item) => item.id === match[1]);
    const value = clean(match[2]);
    const asObservation = observations.includes(comparable(value));
    if (asObservation || nearRequestRestatement(value, request?.request_text || '')) {
      return `  - ${match[1]}: 確認済み事実として追加できる材料はまだない。`;
    }
    return line;
  }).join('\n');
}
function normalizeSection05(section, model, lang) {
  let text = section;
  for (const request of model.judgment_requests || []) {
    const marker = `  - ${request.id}:`;
    const start = text.indexOf(marker);
    if (start < 0) continue;
    const nextMatch = /\n  - R\d{2}:/.exec(text.slice(start + marker.length));
    const end = nextMatch ? start + marker.length + nextMatch.index : text.length;
    let block = text.slice(start, end);
    const label = lang === 'ja' ? '反証・失敗条件' : 'Counter/failure material';
    const extraLabel = lang === 'ja' ? '追加の反証材料' : 'Additional counter material';
    block = block.split('\n').flatMap((line) => {
      if (!line.includes(`${label}:`)) return [line];
      const raw = line.slice(line.indexOf(':') + 1);
      const extras = raw.split(/\s*\/\s*/u).filter((part) => usefulCounterPart(part, request.request_text));
      const out = [`    - ${label}: ${counterOntology(request.action, lang)}`];
      if (extras.length) out.push(`    - ${extraLabel}: ${[...new Set(extras)].join(' / ')}`);
      return out;
    }).join('\n');
    text = text.slice(0, start) + block + text.slice(end);
  }
  return text;
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
      if (!/まだ不足している材料/.test(line)) return true;
      return usefulMissingLine(line.replace(/^.*まだ不足している材料\s*:\s*/u, ''), request.request_text);
    });
    block = lines.join('\n');
    const ontology = materialOntology(request.action, lang);
    if (!block.includes(ontology)) block += `\n    - ${lang === 'ja' ? '判断に必要な確認材料' : 'Material required for judgment'}: ${ontology}`;
    text = text.slice(0, start) + block + text.slice(end);
  }
  return text;
}
function normalizeSection07(section, model, lang) {
  return section.split('\n').map((line) => {
    const match = /^  - (R\d{2}):\s*(.*)$/u.exec(line);
    if (!match) return line;
    const request = (model.judgment_requests || []).find((item) => item.id === match[1]);
    if (!request || request.external_evidence_requested === true) return line;
    const current = clean(match[2]);
    const accepted = lang === 'ja'
      ? /成立した外部根拠候補がある/u.test(current)
      : /Accepted external evidence exists/iu.test(current);
    const intent = lang === 'ja'
      ? '利用者は外部Evidenceを明示要求していない。'
      : 'The user did not explicitly request external evidence.';
    if (accepted) return `  - ${match[1]}: ${intent} ${current}`;
    return lang === 'ja'
      ? `  - ${match[1]}: ${intent} 内部TaskのEvidence検索状態を要求レベルの外部Evidence要求へ昇格せず、実装事実・原因は未確認として分離する。`
      : `  - ${match[1]}: ${intent} Do not promote internal Task evidence-search state into a request-level external-evidence requirement; implementation facts and causes remain separately unverified.`;
  }).join('\n');
}
function normalizeSection08(section, model, lang) {
  let text = section;
  for (const request of model.judgment_requests || []) {
    const marker = `  - ${request.id}:`;
    const start = text.indexOf(marker);
    if (start < 0) continue;
    const nextMatch = /\n(?:  - R\d{2}:|- )/.exec(text.slice(start + marker.length));
    const end = nextMatch ? start + marker.length + nextMatch.index : text.length;
    let block = text.slice(start, end);
    const ontology = materialOntology(request.action, lang);
    block = block.split('\n').map((line) => {
      if (!/^\s*-\s*R\d{2}:/.test(line)) return line;
      return lang === 'ja'
        ? `  - ${request.id}: 「${clean(request.request_text)}」について、${ontology}を確認する。`
        : `  - ${request.id}: For “${clean(request.request_text)}”, verify ${ontology}.`;
    }).join('\n');
    text = text.slice(0, start) + block + text.slice(end);
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
    .replace(/\n[ \t]*-\s*まだ不足している材料\s*:\s*の(?:完了|合格|受入)(?:・(?:完了|合格|受入))*条件を明示する。?/gu, '')
    .replace(/\n[ \t]*-?\s*の(?:完了|合格|受入)(?:・(?:完了|合格|受入))*条件を明示する。?/gu, '')
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
  sections[2] = normalizeSection03(sections[2], model, lang);
  sections[4] = normalizeSection05(sections[4], model, lang);
  sections[5] = normalizeSection06(sections[5], model, lang);
  sections[6] = normalizeSection07(sections[6], model, lang);
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
  usefulMissingLine,
  emptyCompletionPlaceholder
};