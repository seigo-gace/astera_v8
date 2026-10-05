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
    analyze: '現状、対象範囲、利用者影響、望ましい状態、判断可能になる完了条件',
    improve: '現在状態（現状）、対象範囲、利用者影響、見せる情報と見せない内部情報の境界、改善後の状態、回帰確認を含む完了条件',
    implement: '実装箇所・接続点、イベント/操作経路（イベントまたは操作経路）、ON/OFFなどの発火条件、期待する表示・挙動、既存操作への影響、受入・完了条件',
    remove: '再現条件、不要物の発生源・生成元、UIならcomponent/CSS/style/layout等の生成経路、削除した場合の影響、回帰確認条件',
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
    improve: 'current state, affected scope, user impact, user-visible/internal boundary, desired state, and regression criteria',
    implement: 'implementation/connection point, event/interaction path, ON/OFF trigger state, expected behavior, compatibility impact, and acceptance criteria',
    remove: 'reproduction conditions, generating source, component/CSS/style/layout path, removal impact, and regression criteria',
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
    remove: '症状だけを隠す修正になっていないか、原因や必要な境界を残したままにしていないか、再発しないかを確認する。',
    verify: '支持材料だけでなく反証・例外と、版・バージョン（該当する場合）・時点・対象範囲の違いを同じ強さで確認する。',
    compare: '単一指標だけで優劣を決めず、各候補を同一条件・同一軸で比較できているか確認する。',
    integrate: '片側だけ正常でも契約不一致・失敗時処理・既存経路破壊がないか確認する。',
    migrate: '移行成功だけでなくRollback不能、データ・契約互換性、途中状態の失敗を確認する。',
    preserve: '維持対象を守るために必要な変更まで禁止していないか、境界外の副作用がないか確認する。',
    explain: '説明が確認済み事実と未確認情報を混ぜていないか、対象範囲を越えて一般化していないか確認する。',
    decide: '判断に都合のよい材料だけを残していないか、未確定事項を0や問題なしへ置き換えていないか確認する。',
    analyze: '現状・例外・影響範囲・失敗条件を確認し、利用者報告から原因を推測確定しない。'
  };
  const en = {
    implement: 'Check wrong insertion points, OFF/failure/unconfigured behavior, and regressions in existing actions.',
    improve: 'Check whether useful information is hidden, out-of-scope behavior changes, or new user impact is introduced.',
    remove: 'Check whether the change only hides the symptom, leaves the cause or required boundaries intact, or can recur.',
    verify: 'Check contrary evidence, exceptions, version/revision differences where applicable, time-point differences, and scope differences as strongly as supporting material.',
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
function semanticCounterSummary(request = {}, lang = 'ja') {
  const text = clean(request.request_text || '');
  const action = String(request.action || '');
  if (lang === 'ja') {
    if (action === 'improve' && /(?:見せる|表示)/u.test(text) && /(?:見せない|隠す|非表示)/u.test(text)) {
      return '見せる/見せない境界を誤って必要情報まで隠さないか、対象外まで変えないかを確認する。';
    }
    if (action === 'implement' && /(?:トグル|ON|OFF|オン|オフ)/iu.test(text)) {
      return 'ON/OFFの状態境界で、OFF・失敗・未設定時の表示や既存操作を壊さないか確認する。';
    }
    if (action === 'remove') return counterOntology(action, lang);
  } else {
    if (action === 'improve' && /(?:show|display|visible)/iu.test(text) && /(?:hide|hidden|not\s+show|invisible)/iu.test(text)) {
      return 'Check the show/hide boundary so required information is not hidden and out-of-scope behavior is not changed.';
    }
    if (action === 'implement' && /(?:toggle|\bON\b|\bOFF\b)/iu.test(text)) {
      return 'Check the ON/OFF state boundary, failure/unconfigured display behavior, and regressions in existing actions.';
    }
  }
  return counterOntology(action, lang);
}
function nextStepOntology(request = {}, lang = 'ja') {
  const text = clean(request.request_text || '');
  const action = String(request.action || '');
  if (lang === 'ja') {
    if (action === 'improve' && /(?:見せる|表示)/u.test(text) && /(?:見せない|隠す|非表示)/u.test(text)) {
      return '見せる/見せない境界を含む全体を点検し、現状・対象範囲・利用者影響と回帰を確認する';
    }
    if (action === 'implement' && /(?:トグル|ON|OFF|オン|オフ)/iu.test(text)) {
      return 'OFF時の表示確認を含め、実装箇所・イベント/操作経路・ON/OFF・既存操作の回帰を確認する';
    }
    if (action === 'remove' && /(?:線|境界|罫線|border)/iu.test(text)) {
      return '不要線の再現条件と発生源、component/CSS/style/layoutを確認し、削除後の回帰確認を行う';
    }
  } else {
    if (action === 'improve' && /(?:show|display|visible)/iu.test(text) && /(?:hide|hidden|not\s+show|invisible)/iu.test(text)) {
      return 'inspect the show/hide boundary across the affected scope and verify user impact and regression behavior';
    }
    if (action === 'implement' && /(?:toggle|\bON\b|\bOFF\b)/iu.test(text)) {
      return 'verify OFF-state display behavior, the implementation/event path, ON/OFF handling, and regression behavior';
    }
    if (action === 'remove' && /(?:line|border|divider)/iu.test(text)) {
      return 'verify the unwanted line reproduction/source, component/CSS/style/layout path, and regression after removal';
    }
  }
  return materialOntology(action, lang);
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
function internalMarker(value) {
  return /^(?:PARSE|PARSER|TASK_GRAPH|SCOPE)_[A-Z0-9_]+$/u.test(clean(value));
}
function usefulMissingLine(value, requestText = '') {
  const text = clean(value);
  if (!text) return false;
  if (internalMarker(text)) return false;
  if (emptyCompletionPlaceholder(text) || containsCompletionPlaceholder(text)) return false;
  if (/^Alternative evidence angle$/iu.test(text)) return false;
  if (/^反例\s*条件不成立\s*例外$/u.test(text)) return false;
  if (nearRequestRestatement(text, requestText)) return false;
  return true;
}
function usefulCounterPart(value, requestText = '') {
  const text = clean(value);
  if (!text) return false;
  if (internalMarker(text)) return false;
  if (/Alternative evidence angle/iu.test(text)) return false;
  if (/反例\s*条件不成立\s*例外/u.test(text)) return false;
  if (/(?:肯定形|否定形)\s*$/u.test(text)) return false;
  if (/^検討しろ[。.]?$/u.test(text)) return false;
  if (nearRequestRestatement(text, requestText)) return false;
  return true;
}
const INTERNAL_DOMAIN_TEMPLATE_TOKEN = /(?:Data Loss|Downtime|Recall|保証不履行|現行維持|段階移行|修理|交換|Security Regression|Rollback不能|互換性破壊|Build vs Buy|保守性|\bRisk\b|\bCost\b)/iu;
function spansOverlap(left = {}, right = {}) {
  const start = Math.max(Number(left.start || 0), Number(right.start || 0));
  const end = Math.min(Number(left.end || 0), Number(right.end || 0));
  return end > start;
}
function requestSourceText(model, request = {}) {
  const values = [clean(request.request_text || '')];
  for (const observation of model.observations || []) {
    const belongs = (observation?.request_ids || []).includes(request.id)
      || spansOverlap(observation?.source_span, request?.source_span);
    if (belongs) values.push(clean(observation?.text || ''));
  }
  return values.filter(Boolean).join(' ');
}
function domainTemplateSourceBacked(value, model, request) {
  const text = clean(value);
  const matches = text.match(new RegExp(INTERNAL_DOMAIN_TEMPLATE_TOKEN.source, 'giu')) || [];
  if (!matches.length) return true;
  const source = requestSourceText(model, request).toLocaleLowerCase();
  return matches.every((token) => source.includes(String(token).toLocaleLowerCase()));
}
function usefulRiskPart(value, model, request) {
  const text = clean(value);
  if (!text) return false;
  if (internalMarker(text)) return false;
  if (/Alternative evidence angle/iu.test(text)) return false;
  if (comparable(text) === comparable(request?.request_text || '')) return false;
  if (!domainTemplateSourceBacked(text, model, request)) return false;
  return true;
}
function normalizeDigits(value) {
  return String(value || '').replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xFF10)).replace('．', '.');
}
function quantityMaterial(model, lang = 'ja') {
  const values = [];
  const seen = new Set();
  const pattern = /([A-Za-zＡ-Ｚａ-ｚ0-9０-９一-龠ぁ-んァ-ヶ]{1,24}案)[^0-9０-９。！？!?\n]{0,100}([0-9０-９]+(?:[.．][0-9０-９]+)?)\s*(件|人|回|日|時間|分|秒|円|万円|台|個|社|本|枚|%|％)/gu;
  for (const observation of model.observations || []) {
    const text = clean(observation?.text);
    for (const match of text.matchAll(pattern)) {
      const number = Number(normalizeDigits(match[2]));
      if (!Number.isFinite(number)) continue;
      const key = `${match[1]}|${number}|${match[3]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      values.push({ label: match[1], number, unit: match[3], source: text });
    }
  }
  if (values.length < 2) return '';
  let pair = null;
  for (let i = 0; i < values.length && !pair; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      if (values[i].label !== values[j].label && values[i].unit === values[j].unit) { pair = [values[i], values[j]]; break; }
    }
  }
  if (!pair) return '';
  const [a, b] = pair;
  const diff = Math.abs(a.number - b.number);
  const high = a.number >= b.number ? a : b;
  const low = high === a ? b : a;
  const ratio = low.number > 0 ? high.number / low.number : null;
  const ratioText = ratio && Number.isFinite(ratio) ? ratio.toFixed(ratio >= 10 ? 1 : 2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1') : '';
  return lang === 'ja'
    ? `- 利用者入力から直接計算できる数量差: ${a.label}=${a.number}${a.unit}、${b.label}=${b.number}${b.unit}。差は${diff}${a.unit}${ratioText ? `で、多い側は少ない側の約${ratioText}倍` : ''}。これは入力材料からの算術であり、品質・法務安全性の優劣や外部確認済み事実を意味しない。`
    : `- Quantity difference directly calculable from supplied input: ${a.label}=${a.number}${a.unit}, ${b.label}=${b.number}${b.unit}; difference=${diff}${a.unit}${ratioText ? ` and the larger value is about ${ratioText}x the smaller` : ''}. This is arithmetic over supplied material, not external verification or a quality/safety ranking.`;
}
function normalizeSection03(section, model, lang) {
  const observations = (model.observations || []).map((item) => comparable(item?.text)).filter(Boolean);
  const observationById = new Map((model.observations || []).map((item) => [String(item?.id || ''), item]));
  const lines = section.split('\n').map((line) => {
    const observationMatch = /^  - (O\d{2}):\s*(.*)$/u.exec(line);
    if (observationMatch) {
      const item = observationById.get(observationMatch[1]);
      if (item?.truth_state === 'INPUT_SUPPLIED_UNVERIFIED') {
        const value = clean(observationMatch[2]).replace(/\s*\((?:利用者報告・外部未検証|user-reported, externally unverified)\)\s*$/iu, '');
        return `  - ${observationMatch[1]}: ${value} (${lang === 'ja' ? '入力材料・外部未検証' : 'input-supplied, externally unverified'})`;
      }
      return line;
    }
    const match = /^  - (R\d{2}):\s*(.*)$/u.exec(line);
    if (!match) return line;
    const request = (model.judgment_requests || []).find((item) => item.id === match[1]);
    const value = clean(match[2]);
    const asObservation = observations.includes(comparable(value));
    if (asObservation || nearRequestRestatement(value, request?.request_text || '')) {
      return lang === 'ja'
        ? `  - ${match[1]}: 確認済み事実として追加できる材料はまだない。`
        : `  - ${match[1]}: No additional confirmed factual material is available yet.`;
    }
    return line;
  });
  const quantity = quantityMaterial(model, lang);
  if (quantity && !lines.some((line) => line.includes('直接計算できる数量差') || line.includes('Quantity difference directly calculable'))) {
    const boundaryIndex = lines.findIndex((line) => /^- (?:区別|Boundary)/u.test(line));
    if (boundaryIndex >= 0) lines.splice(boundaryIndex, 0, quantity);
    else lines.push(quantity);
  }
  return lines.join('\n');
}
function normalizeSection04(section, model, lang) {
  return section.split('\n').map((line) => {
    const match = /^  - (R\d{2}):\s*(.*)$/u.exec(line);
    if (!match) return line;
    const request = (model.judgment_requests || []).find((item) => item.id === match[1]);
    if (!request) return line;
    const semantic = semanticCounterSummary(request, lang);
    const extras = clean(match[2])
      .split(/\s*\/\s*/u)
      .map(clean)
      .filter((part) => usefulRiskPart(part, model, request))
      .filter((part) => comparable(part) !== comparable(semantic));
    return `  - ${match[1]}: ${[semantic, ...new Set(extras)].join(' / ')}`;
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
    const semantic = semanticCounterSummary(request, lang);
    block = block.split('\n').flatMap((line) => {
      if (line.startsWith(marker)) return [`${line} / ${semantic}`];
      if (!line.includes(`${label}:`)) return [line];
      const raw = line.slice(line.indexOf(':') + 1);
      const extras = String(request.action || '') === 'verify'
        ? []
        : raw.split(/\s*\/\s*/u).filter((part) => usefulCounterPart(part, request.request_text));
      const out = [`    - ${label}: ${semantic}`];
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
    const ontology = materialOntology(request.action, lang);
    const missingLabel = lang === 'ja'
      ? /(?:まだ不足している材料|追加で必要な材料)/u
      : /(?:Material still missing|Additional material required)/iu;
    const comparisonOnlyLabel = lang === 'ja'
      ? /^\s+-\s+(?:候補|比較観点):/u
      : /^\s+-\s+(?:Candidates|Dimensions):/iu;
    const lines = block.split('\n').flatMap((line) => {
      if (String(request.action || '') !== 'compare' && comparisonOnlyLabel.test(line)) return [];
      if (String(request.action || '') === 'verify' && missingLabel.test(line)) {
        const colon = line.indexOf(':');
        if (colon < 0) return [];
        return [`${line.slice(0, colon + 1)} ${ontology}`];
      }
      if (!missingLabel.test(line)) return [line];
      const colon = line.indexOf(':');
      if (colon < 0) return [line];
      const prefix = line.slice(0, colon + 1);
      const parts = line.slice(colon + 1)
        .split(/\s*\/\s*/u)
        .map(clean)
        .filter((part) => usefulMissingLine(part, request.request_text));
      if (!parts.length) return [];
      return [`${prefix} ${[...new Set(parts)].join(' / ')}`];
    }).map((line) => line.startsWith(marker) ? `${line}: ${ontology}` : line);
    block = lines.join('\n');
    if (!block.includes(ontology)) block += `\n    - ${lang === 'ja' ? '判断に必要な確認材料' : 'Material required for judgment'}: ${ontology}`;
    text = text.slice(0, start) + block + text.slice(end);
  }
  return text;
}
function sourceBackedEvidenceSummary(model, lang) {
  const values = [];
  for (const observation of model.observations || []) {
    const text = clean(observation?.text);
    if (text) values.push(text);
  }
  for (const request of model.judgment_requests || []) {
    if (String(request.action || '') !== 'compare') continue;
    const text = clean(request.request_text || '');
    if (text) values.push(text);
  }
  const uniqueValues = [...new Set(values)].slice(0, 8);
  if (!uniqueValues.length) return '';
  return lang === 'ja'
    ? `- 利用者入力として与えられた材料: ${uniqueValues.join(' / ')}。これは利用者入力の条件・観測・比較要求を保持したもので、外部確認済みの根拠ではない。根拠なし・未確定の部分を推測で確定しない。`
    : `- Material supplied by the user: ${uniqueValues.join(' / ')}. This preserves input conditions, observations, and comparison requests; it is not externally verified evidence. Do not infer unresolved facts without evidence.`;
}
function normalizeSection07(section, model, lang) {
  const lines = section.split('\n').map((line) => {
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
  });
  const sourceSummary = sourceBackedEvidenceSummary(model, lang);
  if (sourceSummary && !lines.some((line) => line.includes(lang === 'ja' ? '利用者入力として与えられた材料' : 'Material supplied by the user'))) {
    lines.push(sourceSummary);
  }
  return lines.join('\n');
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
    const ontology = nextStepOntology(request, lang);
    block = block.split('\n').map((line) => {
      if (!/^\s*-\s*R\d{2}:/.test(line)) return line;
      return lang === 'ja'
        ? `  - ${request.id}: 「${clean(request.request_text)}」について、${ontology}。`
        : `  - ${request.id}: For “${clean(request.request_text)}”, ${ontology}.`;
    }).join('\n');
    text = text.slice(0, start) + block + text.slice(end);
  }
  if (lang === 'ja') {
    text = text.replace(/^- ある判断要求が未確認でも、/mu, '- 共通: ある判断要求が未確認でも、');
  } else {
    text = text.replace(/^- If one judgment request remains unresolved,/miu, '- Common: If one judgment request remains unresolved,');
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
    .replace(/\n[ \t]*-\s*(?:まだ不足している材料|追加で必要な材料)\s*:\s*の(?:完了|合格|受入)(?:・(?:完了|合格|受入))*条件を明示する。?/gu, '')
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
  sections[3] = normalizeSection04(sections[3], model, lang);
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