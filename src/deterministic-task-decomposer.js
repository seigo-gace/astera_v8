'use strict';

const { unique, tokenOverlap } = require('./judgment-materials-analyzer');

const norm = (value) => String(value || '').normalize('NFKC').replace(/\r\n?/g, '\n').trim();
const genericTarget = (value) => !value || /^(?:入力対象|input target|対象|target|これ|それ|あれ|これら|それら)$/iu.test(norm(value));

const ACTION_PATTERNS = Object.freeze([
  ['verify', /検証|確認|監査|調査|分析|解析|評価|テスト|試験|verify|validate|audit|investigat|analy[sz]|evaluate|check|test/i],
  ['compare', /比較|比べ|compare|versus|\bvs\b/i],
  ['decide', /判断|選定|選ぶ|決め|採用|decid|select|choose/i],
  ['improve', /改善|改良|修正|直(?:す|せ|し)|最適化|強化|更新|improv|optimi[sz]e|fix|refactor|strengthen|update/i],
  ['implement', /実装|作成|構築|開発|追加|implement|build|create|develop|add/i],
  ['integrate', /統合|接続|連携|組み込|integrat|connect|link|incorporat/i],
  ['migrate', /移行|切替|入れ替|migrat|switch/i],
  ['remove', /削除|除去|外す|remove|delete|eliminate/i],
  ['preserve', /維持|保持|残す|壊さず|変えず|keep|preserve|retain/i],
  ['explain', /説明|教え|解説|explain|describe|tell me/i]
]);

const NEGATED_DECIDE_PATTERNS = [
  /do\s+not\s+(?:decide|select|choose|adopt|recommend)/gi,
  /must\s+not\s+(?:decide|select|choose)/gi,
  /never\s+(?:decide|select|choose)/gi,
  /(?:最終)?判断(?:は)?(?:するな|しない|しないで)/gu,
  /(?:候補|A案|B案)?を?(?:選ぶな|選定するな|採用するな)/gu,
  /(?:採用|選定|選ぶ)(?:するな|するな。)/gu
];
const PROHIBITION_CUE = /(?:禁止|するな|しない(?:で|。|$)|変更しない|変更せず|してはいけ|勝手に|must not|do not|never)/i;

const GLOBAL_SCOPE_CUE = /(?:全体|すべて|全て|全部|共通|各Task|各タスク|全Task|全タスク|globally|across all|all tasks|every task)/i;
const GLOBAL_BOUNDARY_CUE = /(?:\bmain\b|\bmaster\b|branch|ブランチ|repository|repo\b|リポジトリ|本番|production|server|サーバー|直置き|deploy|release)/i;
const DEPENDENCY_CUE = /(?:その後|次に|最後に|完了後|終了後|検証後|確認後|成立後|終わったら|完了したら|してから|した上で|依存|両方|双方|これら|前二つ|前2つ|after|afterward|once|depends?\s+on|when .* complete|after .* complete)/i;
const BRANCH_CUE = /(?:問題なければ|問題がなければ|問題があれば|成功したら|失敗したら|成立したら|不成立|確認できたら|確認できなければ|検証できたら|検証できなければ|場合|なら|ならば|ただし|例外|unless|if\b|when\b|except|however)/i;
const REFERENCE_CUE = /(?:^|[\s、,。])(?:これ|それ|あれ|これら|それら|上記|前述|同じ対象|前者|後者|両方|双方)(?:を|について|に|は|が|の|\b)/i;

function regions(text) {
  const input = String(text || '');
  const out = [];
  for (const match of input.matchAll(/```[\s\S]*?```|~~~[\s\S]*?~~~/gu)) out.push({ start: match.index, end: match.index + match[0].length, role: 'CODE_OR_QUOTED_BLOCK' });
  for (const match of input.matchAll(/^[ \t]*>.*(?:\n[ \t]*>.*)*/gmu)) out.push({ start: match.index, end: match.index + match[0].length, role: 'ATTRIBUTED_OR_QUOTED' });
  const quotePairs = [['「', '」'], ['『', '』'], ['“', '”'], ['"', '"']];
  for (const [open, close] of quotePairs) {
    let start = -1;
    for (let index = 0; index < input.length; index += 1) {
      if (input[index] === open && start < 0) start = index;
      else if (input[index] === close && start >= 0) {
        out.push({ start, end: index + 1, role: 'ATTRIBUTED_OR_QUOTED' });
        start = -1;
      }
    }
  }
  return out.sort((a, b) => a.start - b.start || a.end - b.end);
}

function isolatedRole(span, sourceRegions) {
  const hit = sourceRegions.find((region) => span.start >= region.start && span.end <= region.end);
  return hit?.role || 'DIRECT_INPUT';
}

function splitWithSpans(text) {
  const input = String(text || '');
  const items = [];
  let start = 0;
  for (let index = 0; index < input.length; index += 1) {
    if (!/[。！？!?;；\n]/u.test(input[index])) continue;
    const raw = input.slice(start, index + 1);
    const left = raw.length - raw.trimStart().length;
    const right = raw.length - raw.trimEnd().length;
    if (index + 1 - right > start + left) items.push({ start: start + left, end: index + 1 - right, text: input.slice(start + left, index + 1 - right) });
    start = index + 1;
  }
  if (start < input.length) {
    const raw = input.slice(start);
    const left = raw.length - raw.trimStart().length;
    const right = raw.length - raw.trimEnd().length;
    if (input.length - right > start + left) items.push({ start: start + left, end: input.length - right, text: input.slice(start + left, input.length - right) });
  }
  return items;
}

function tokenSet(text) {
  const value = norm(text).toLowerCase();
  const ascii = value.match(/[a-z][a-z0-9_.:/-]{1,}/g) || [];
  const ja = value.match(/[一-龠々ァ-ヶぁ-ん]{2,24}/g) || [];
  return new Set([...ascii, ...ja].filter((item) => !/^(?:これ|それ|あれ|もの|こと|ため|よう|対象|入力対象)$/.test(item)));
}

function overlapScore(left, right) {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const item of a) if (b.has(item)) hit += 1;
  return hit / Math.max(a.size, b.size);
}

function contextBindings(context) {
  const bindings = [];
  for (const span of splitWithSpans(context)) {
    const text = norm(span.text);
    if (!text) continue;
    const source = { source: 'context', source_span: { start: span.start, end: span.end, text: span.text } };
    const push = (kind) => bindings.push({ kind, value: text, scope: 'UNRESOLVED', task_ids: [], ...source });
    if (/前提|現状|現在|既存|対象は|given\b|assume|existing|currently|予算|円|万円/i.test(text)) push('premise');
    if (/[^。！？!?\n]{1,80}は[^。！？!?\n]{1,80}/u.test(text) && /予算|円|万円|現状|現在|既存|対象|環境|version|バージョン/i.test(text)) push('premise');
    if (/禁止|するな|しない(?:で|。|$)|変更しない|変更せず|してはいけ|勝手に|must not|do not|never/i.test(text)) push('prohibition');
    if (/維持|保持|残す|壊さず|変えず|そのまま|keep|preserve|retain/i.test(text)) push('preserve');
    if (/置換|差し替|変更対象|replace|swap/i.test(text) && !/禁止|するな|must not|do not|never/i.test(text)) push('replace');
    if (/必ず|のみ|限定|守る|変更せず|must\b|only\b|without/i.test(text)) push('constraint');
    if (/成功条件|合格条件|success criteria|acceptance criteria/i.test(text)) push('success');
    if (/完了条件|completion criteria|done when/i.test(text)) push('completion');
    if (/検証|確認|テスト|test|verify|validate|assert|check/i.test(text)) push('verification');
    if (/(?:場合|とき|なら|ならば|であれば|を条件に|if\b|when\b|provided that|unless)/i.test(text)) push('condition');
    if (/(?:ただし|例外|除く|を除き|except|however|but only)/i.test(text)) push('exception');
    if (/(?:最優先|優先|先に|まず|priority|first|before)/i.test(text)) push('priority');
    if (/(?:期限|納期|締切|締め切|deadline|due date|hard_deadline|来週|来月|今週|今月|金曜|月曜|火曜|水曜|木曜|土曜|日曜|までに)/i.test(text)) push('deadline');
  }
  return bindings;
}

function deliverables(text) {
  const value = norm(text);
  const out = [];
  const patterns = [
    ['README', /README(?:\.md)?/ig],
    ['CODE', /(?:Code|コード|実装Code|source code)/ig],
    ['TEST_EVIDENCE', /(?:Test Evidence|テスト証拠|テスト結果|test log)/ig],
    ['REPORT', /(?:報告書|レポート|report)/ig],
    ['NOTION_RECORD', /(?:Notion(?:記録|議事録)?)/ig],
    ['PR', /(?:Pull Request|\bPR\b)/ig],
    ['COMMIT', /(?:Commit|コミット)/ig],
    ['BUILD_LOG', /(?:Build Log|ビルドログ)/ig]
  ];
  for (const [name, re] of patterns) if (re.test(value)) out.push(name);
  for (const match of value.matchAll(/(?:^|\s|`)([\w./-]+\.(?:js|cjs|mjs|ts|tsx|json|md|yaml|yml|html|css))(?:`|\s|$)/g)) out.push(match[1]);
  return unique(out);
}

function decisionMaterialRanges(text) {
  const ranges = [];
  const re = /(?:採用|選定)?判断(?:材料|に必要な(?:材料|情報|根拠|条件))|(?:採用|選定)(?:判断)?に必要な(?:材料|情報|根拠|条件)/gu;
  for (const match of String(text || '').matchAll(re)) ranges.push({ start: match.index, end: match.index + match[0].length });
  return ranges;
}

function negatedDecisionRanges(text) {
  const ranges = [];
  const value = String(text || '');
  for (const re of NEGATED_DECIDE_PATTERNS) {
    const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
    const pattern = new RegExp(re.source, flags);
    for (const match of value.matchAll(pattern)) ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  for (const span of splitWithSpans(value)) {
    if (!PROHIBITION_CUE.test(span.text)) continue;
    for (const match of span.text.matchAll(/判断|選定|選ぶ|決め|採用|decid|select|choose|recommend/gi)) {
      ranges.push({ start: span.start + match.index, end: span.start + match.index + match[0].length });
    }
  }
  return ranges;
}

function isNegatedDecideMatch(text, item) {
  if (item.id !== 'decide') return false;
  return negatedDecisionRanges(text).some((range) => item.index >= range.start && item.index < range.end);
}

function actionOccurrences(text) {
  const found = [];
  const protectedDecisionRanges = decisionMaterialRanges(text);
  for (const [id, pattern] of ACTION_PATTERNS) {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    const re = new RegExp(pattern.source, flags);
    for (const match of String(text || '').matchAll(re)) {
      const item = { id, index: match.index, end: match.index + match[0].length, match: match[0] };
      if (id === 'decide' && protectedDecisionRanges.some((range) => item.index >= range.start && item.index < range.end)) continue;
      if (isNegatedDecideMatch(text, item)) continue;
      found.push(item);
    }
  }
  found.sort((a, b) => a.index - b.index || a.end - b.end || a.id.localeCompare(b.id));
  const dedup = [];
  for (const item of found) {
    const overlap = dedup.find((existing) => item.index < existing.end && item.end > existing.index);
    if (!overlap) dedup.push(item);
  }
  const nonPreserve = dedup.filter((item) => item.id !== 'preserve');
  const preferred = nonPreserve.length ? nonPreserve : dedup;
  return preferred.filter((item, index) => {
    const next = preferred[index + 1];
    if (!next) return true;
    const between = String(text || '').slice(item.end, next.index);
    if (/^\s*(?:完了後|終了後|完了|終了|済み|結果|内容|計画|手順|状態|対象|機能)/u.test(between)) return false;
    return !/^\s*(?:(?:結果|内容|計画|手順|状態|対象|機能)\s*)?(?:を|の|に|が|は|で)\s*/u.test(between);
  });
}

function taskPurpose(action, target, fallback = '') {
  if (fallback) return fallback;
  const name = target || '対象';
  const map = {
    verify: `${name}を明示条件と根拠に基づいて検証する。`,
    compare: `${name}を同一条件で比較可能な材料へ分解する。`,
    decide: `${name}に必要な判断材料を構造化する。`,
    improve: `${name}を制約と維持条件を保って改善する。`,
    implement: `${name}を制約・依存・検証条件を保って実装する。`,
    integrate: `${name}を責務境界と依存を保って統合する。`,
    migrate: `${name}を互換性とRollback条件を保って移行する。`,
    remove: `${name}を維持対象を壊さず除去する。`,
    preserve: `${name}を他変更から保護する。`,
    explain: `${name}を明示事実と制約に基づいて説明する。`,
    analyze: `${name}を判断材料へ構造化する。`
  };
  return map[action] || map.analyze;
}

const USER_GOAL_WISH_RE = /(.{2,120}?(?:を|の)[^。！？\n]{0,48}?(?:改善したい|を改善したい|を実現したい|にしたい|してほしい|が欲しい|を欲しい|したい))/u;

function explicitPurposeSpan(text) {
  const value = norm(text);
  const wish = USER_GOAL_WISH_RE.exec(value);
  if (wish) {
    const start = wish.index;
    const end = start + wish[0].length;
    const phrase = norm(wish[1] || wish[0]).replace(/(?:が|を)?(?:欲しい|ほしい)$/u, '').replace(/したい$/u, 'する');
    return { phrase: phrase || norm(wish[0]), span: { start, end, text: value.slice(start, end) } };
  }
  const named = /(?:目的|狙い)(?:は|:|=)\s*([^。！？!?]{2,160})/i.exec(value);
  if (named) {
    const start = named.index;
    const end = start + named[0].length;
    return { phrase: norm(named[1]), span: { start, end, text: value.slice(start, end) } };
  }
  return null;
}

function explicitPurpose(text, fallback = '') {
  const extracted = explicitPurposeSpan(text);
  if (extracted?.phrase) return extracted.phrase;
  const value = norm(text);
  const ja = /^(.{2,120}?)(?:ために|ため、|ため、?)(?=.{1,120}(?:検証|確認|改善|修正|実装|作成|移行|統合|削除))/u.exec(value);
  if (ja) return norm(ja[1]);
  const en = /(?:in order to|so that)\s+([^.;!?]{2,160})/i.exec(value);
  return en ? norm(en[1]) : fallback;
}

function extractDesiredEffect(text) {
  const value = norm(text);
  if (!/(?:%|％|\d+\s*(?:秒|ms|ミリ秒|倍|件\/|req\/))/u.test(value)) return { status: '未指定', text: '未指定' };
  const match = value.match(/(?:期待効果|効果|KPI|指標)(?:は|:|=)\s*([^。！？\n]{2,160})/u);
  if (match) return { status: '指定あり', text: norm(match[1]) };
  return { status: '未指定', text: '未指定' };
}

function extractOutputPolicy(text) {
  const value = norm(text);
  const policies = [];
  if (/(?:最終結論|最終判断)(?:は|を)?(?:出さ|しない|禁止)/u.test(value)) policies.push('FINAL_DECISION_PROHIBITED');
  if (/判断材料(?:だけ|のみ|のみを)?(?:欲しい|ほしい|が欲しい)|材料(?:だけ|のみ)(?:欲しい|ほしい|が欲しい|で)/u.test(value)) policies.push('MATERIAL_ONLY_REQUIRED');
  return Object.freeze({
    ids: policies,
    natural_ja: policies.length
      ? '最終判断は行わず、利用者が判断できる材料のみを整理する。'
      : ''
  });
}

function extractInstructionUnderstandingFields(question) {
  const q = norm(question);
  const goalSpan = explicitPurposeSpan(q);
  const desired = extractDesiredEffect(q);
  const outputPolicy = extractOutputPolicy(q);
  return {
    user_goal: goalSpan?.phrase || '',
    user_goal_span: goalSpan?.span || null,
    desired_effect: desired.text,
    effect_status: desired.status,
    output_policy: outputPolicy
  };
}

function mergeConstraintCarrierIntoPrimary(primary, carrier) {
  const merged = { ...primary };
  merged.constraints = unique([...(merged.constraints || []), ...(carrier.constraints || []), ...(carrier.raw_text ? [carrier.raw_text] : [])]);
  merged.prohibitions = unique([...(merged.prohibitions || []), ...(carrier.prohibitions || [])]);
  merged.preserve = unique([...(merged.preserve || []), ...(carrier.preserve || []), ...(carrier.clause_type === 'preserve' && carrier.raw_text ? [carrier.raw_text] : [])]);
  merged.deadlines = unique([...(merged.deadlines || []), ...(carrier.deadlines || [])]);
  merged.constraint_records = [
    ...(merged.constraint_records || []),
    ...(carrier.constraint_records || [])
  ];
  merged.conditions = unique([...(merged.conditions || []), ...(carrier.conditions || [])]);
  merged.exceptions = unique([...(merged.exceptions || []), ...(carrier.exceptions || [])]);
  if (carrier.source_span?.text && carrier.source_span.text !== merged.source_span?.text) {
    appendSource(merged.field_sources || (merged.field_sources = {}), 'constraints', { source: 'merged_clause', source_span: carrier.source_span });
  }
  return merged;
}

function isConstraintCarrierTask(task) {
  const text = norm(task.raw_text || task.source_span?.text || '');
  if (task.clause_type === 'preserve' || task.clause_type === 'prohibition') return true;
  if (task.action === 'preserve') return true;
  if (/(?:予算|納期|期限|締切|デッドライン|操作は変えない|変えない|維持)/u.test(text)) return true;
  if (/(?:最終結論|判断材料)/u.test(text)) return true;
  if (task.action === 'analyze' && /UNRESOLVED/i.test(String(task.target || ''))) return true;
  return false;
}

function consolidateMaterialOnlyConsultTasks(question, tasks) {
  if (tasks.length <= 1) return tasks;
  const q = norm(question);
  if (!isMaterialOnlyQuestion(q)) return tasks;
  let primary = tasks.find((task) => ['improve', 'implement', 'compare', 'migrate', 'integrate'].includes(task.action))
    || tasks.find((task) => /改善したい|したい/u.test(task.raw_text || task.source_span?.text || ''))
    || tasks[0];
  const carriers = tasks.filter((task) => task.id !== primary.id && isConstraintCarrierTask(task));
  if (!carriers.length) return tasks;
  for (const carrier of carriers) primary = mergeConstraintCarrierIntoPrimary(primary, carrier);
  const instruction = extractInstructionUnderstandingFields(q);
  primary.user_goal = instruction.user_goal || explicitPurpose(primary.raw_text || q, primary.purpose || primary.objective);
  primary.purpose = primary.user_goal || primary.purpose;
  primary.objective = primary.user_goal || primary.objective;
  primary.desired_effect = instruction.desired_effect;
  primary.effect_status = instruction.effect_status;
  primary.output_policy = instruction.output_policy;
  primary.material_only = true;
  primary.replace = (primary.replace || []).filter((item) => !/UNRESOLVED/i.test(String(item)));
  if (primary.action === 'improve') {
    primary.unresolved = unique((primary.unresolved || []).filter((item) => item !== 'deliverable'));
  }
  return [primary];
}

function extractPublicConstraintLines(question) {
  const q = norm(question);
  const lines = [];
  const budget = q.match(/予算(?:は|:)?\s*([^。！？\n]+)/u);
  if (budget) {
    const value = norm(budget[1]).split(/[、,]/u)[0].trim();
    if (value) lines.push(`予算上限: ${value}`);
  }
  const deadline = q.match(/(?:納期|期限)(?:は|:)?\s*([^。！？\n]+)/u);
  if (deadline) {
    const value = norm(deadline[1]).split(/[、,]/u)[0].trim();
    if (value) lines.push(`期限: ${value}`);
  }
  const preserve = q.match(/既存[^。！？\n]+/u);
  if (preserve) lines.push(`維持条件: ${norm(preserve[0])}`);
  return unique(lines);
}

function inferTarget(text, actionMatch, fallback = '') {
  const value = norm(text);
  if (!value) return fallback;
  const named = /(?:対象|target)(?:は|:|=)\s*([^。！？!?\n]{1,140})/i.exec(value);
  if (named) return norm(named[1]);
  const matches = actionOccurrences(value);
  const match = actionMatch && matches.some((item) => item.index === actionMatch.index && item.id === actionMatch.id)
    ? actionMatch
    : (matches.find((item) => item.id !== 'decide') || matches[0] || actionMatch);
  if (match) {
    const before = value.slice(0, match.index).replace(/^(?:そして|その後|次に|最後に|then|next|and then)\s*/i, '').trim();
    if (/^(?:do\s+not|don'?t|must\s+not|never)\b/i.test(before)) {
      const nextMatch = matches.find((item) => item.index > match.index);
      if (nextMatch) return inferTarget(value, nextMatch, fallback);
    }
    const jp = before.match(/([^。！？!?\n、,]{1,120}?)(?:を|について|に対して)\s*$/i);
    if (jp) {
      let candidate = norm(jp[1])
        .replace(/^(?:訂正[、,]?\s*)/u, '')
        .replace(/^(?:問題なければ|問題がなければ|問題があれば|成功したら|成功した場合(?:に|は)?|失敗したら|失敗した場合(?:に|は)?|成立したら|成立した場合(?:に|は)?|不成立なら|確認できたら|確認できなければ|検証できたら|検証できなければ|ただし|例外として)\s*/u, '')
        .replace(/^(?:これ|それ|あれ|これら|それら)$/u, '');
      const replacement = candidate.match(/(?:ではなく|じゃなく)\s*(.+)$/u);
      if (replacement) candidate = norm(replacement[1]);
      const conditionalTail = candidate.match(/^.+?(?:場合に|場合は|場合、|ならば|なら)\s*(.+)$/u);
      if (conditionalTail) candidate = norm(conditionalTail[1]);
      if (candidate) return candidate;
    }
    if (/^[A-Za-z]/.test(value.slice(match.index))) {
      const after = value.slice(match.end).replace(/^(?:\s+the|\s+an?|\s+)/i, '').split(/\b(?:and|then|while|without|if|when)\b|[.,;!?]/i)[0].trim();
      if (after && after.length <= 120) return after;
    }
    if (before && before.length <= 120 && !REFERENCE_CUE.test(before)) return before.replace(/(?:は|が|を|で|の)$/u, '').trim();
  }
  return fallback;
}

function connectorBoundary(text, current, next) {
  const betweenStart = current.end;
  const between = text.slice(betweenStart, next.index);
  const english = [...between.matchAll(/\b(?:and then|then|and|next)\b/ig)].pop();
  if (english) return betweenStart + english.index + english[0].length;
  const japanese = /^(?:する|した|して|し|せよ|してください|してから|した後)?\s*(?:、|,)?\s*/u.exec(between);
  if (japanese && japanese[0].length) return betweenStart + japanese[0].length;
  return next.index;
}

function cloneTaskPart(task, part, actionMatch, partIndex, partCount) {
  const action = actionMatch.id;
  const target = inferTarget(part.text, { ...actionMatch, index: Math.max(0, actionMatch.index - part.local_start), end: Math.max(0, actionMatch.end - part.local_start) }, task.target);
  const objective = taskPurpose(action, target, partCount === 1 ? task.objective : '');
  const purpose = explicitPurpose(part.text, objective);
  return {
    ...task,
    id: `${task.id}#${partIndex + 1}`,
    origin_task_id: task.id,
    split_parent_task_id: partCount > 1 ? task.id : null,
    source_span: { start: part.start, end: part.end, text: part.text },
    raw_text: norm(part.text),
    action,
    target,
    objective,
    purpose,
    order: task.order,
    depends_on: [],
    deliverables: unique([...(task.deliverables || []), ...deliverables(part.text)]),
    constraints: [...(task.constraints || [])],
    prohibitions: [...(task.prohibitions || [])],
    preserve: [...(task.preserve || [])],
    replace: [...(task.replace || [])],
    conditions: [...(task.conditions || [])],
    exceptions: [...(task.exceptions || [])],
    deadlines: [...(task.deadlines || [])],
    priority_records: [...(task.priority_records || [])],
    constraint_records: (task.constraint_records || []).map((record) => ({ ...record })),
    field_sources: task.field_sources ? JSON.parse(JSON.stringify(task.field_sources)) : undefined,
    unresolved: unique(task.unresolved || []),
    split_sequence: partIndex + 1,
    split_sequence_count: partCount
  };
}

function splitCompoundTask(task) {
  const raw = String(task.raw_text || task.source_span?.text || '');
  const matches = actionOccurrences(raw);
  if (matches.length <= 1) return [cloneTaskPart(task, { start: task.source_span.start, end: task.source_span.end, text: task.source_span.text, local_start: 0 }, matches[0] || { id: task.action || 'analyze', index: 0, end: 0 }, 0, 1)];
  const starts = [0];
  for (let index = 0; index < matches.length - 1; index += 1) starts.push(connectorBoundary(raw, matches[index], matches[index + 1]));
  const parts = [];
  for (let index = 0; index < starts.length; index += 1) {
    const localStart = starts[index];
    const localEnd = index + 1 < starts.length ? starts[index + 1] : raw.length;
    const rawPart = raw.slice(localStart, localEnd);
    const left = rawPart.length - rawPart.trimStart().length;
    const right = rawPart.length - rawPart.trimEnd().length;
    const start = localStart + left;
    const end = localEnd - right;
    if (end <= start) continue;
    parts.push({ start: task.source_span.start + start, end: task.source_span.start + end, text: raw.slice(start, end), local_start: start });
  }
  if (parts.length !== matches.length) return [cloneTaskPart(task, { start: task.source_span.start, end: task.source_span.end, text: task.source_span.text, local_start: 0 }, matches[0], 0, 1)];
  return parts.map((part, index) => cloneTaskPart(task, part, matches[index], index, parts.length));
}

function dependencyPrefixTask(task) {
  const raw = norm(task.raw_text || task.source_span?.text || '');
  if (!raw || !DEPENDENCY_CUE.test(raw)) return false;
  return /(?:完了後|終了後|検証後|確認後|成立後|終わったら|完了したら|終了したら|after\s+.+\s+complete(?:s|d)?|once\s+.+\s+complete(?:s|d)?)\s*[、,]?\s*$/iu.test(raw);
}

function collapseDependencyPrefixes(tasks, question = '') {
  const output = [];
  const aliases = new Map();
  const collapsed = [];
  for (let index = 0; index < tasks.length; index += 1) {
    const task = tasks[index];
    const next = tasks[index + 1] || null;
    if (!next || !dependencyPrefixTask(task)) {
      output.push(task);
      continue;
    }
    const start = task.source_span?.start;
    const end = next.source_span?.end;
    const exact = Number.isInteger(start) && Number.isInteger(end) && end > start
      ? String(question || '').slice(start, end)
      : `${task.source_span?.text || task.raw_text || ''}${next.source_span?.text || next.raw_text || ''}`;
    const mergedText = exact || `${task.raw_text || ''}${next.raw_text || ''}`;
    const merged = {
      ...next,
      source_span: {
        start: Number.isInteger(start) ? start : next.source_span?.start,
        end: Number.isInteger(end) ? end : next.source_span?.end,
        text: mergedText
      },
      raw_text: norm(mergedText),
      dependency_prefixes: unique([
        ...((next.dependency_prefixes || []).map((item) => JSON.stringify(item))),
        JSON.stringify({ source_task_id: task.id, source_span: task.source_span, text: norm(task.raw_text || task.source_span?.text || '') })
      ]).map((item) => JSON.parse(item))
    };
    output.push(merged);
    aliases.set(task.id, next.id);
    collapsed.push({ prefix_task_id: task.id, merged_into_task_id: next.id, source_span: task.source_span });
    index += 1;
  }
  return { tasks: output, aliases, collapsed };
}

function applyOriginAliases(originMap, aliases) {
  const mapped = new Map(originMap);
  for (const [alias, target] of aliases.entries()) {
    const children = mapped.get(target);
    if (children?.length) mapped.set(alias, [...children]);
  }
  return mapped;
}

function expandCompoundTasks(tasks) {
  const output = [];
  const originMap = new Map();
  let splitCount = 0;
  for (const task of tasks) {
    const parts = splitCompoundTask(task);
    if (parts.length > 1) splitCount += 1;
    for (let index = 1; index < parts.length; index += 1) parts[index].depends_on = [parts[index - 1].id];
    output.push(...parts);
    originMap.set(task.id, parts.map((item) => item.id));
  }
  return { tasks: output, originMap, splitCount };
}

function remapTasks(tasks) {
  const idMap = new Map();
  const output = tasks.map((task, index) => {
    const next = `T${String(index + 1).padStart(2, '0')}`;
    idMap.set(task.id, next);
    return { ...task, id: next, order: index + 1 };
  });
  for (const task of output) {
    task.depends_on = unique((task.depends_on || []).map((taskId) => idMap.get(taskId)).filter(Boolean));
    if (!task.field_sources) continue;
    for (const entries of Object.values(task.field_sources)) {
      for (const entry of entries) {
        if (Array.isArray(entry.source_task_ids)) {
          entry.source_task_ids = entry.source_task_ids.map((taskId) => idMap.get(taskId) || taskId);
        }
      }
    }
  }
  return { tasks: output, idMap };
}

function remapOriginMap(originMap, idMap) {
  const mapped = new Map();
  for (const [origin, childIds] of originMap.entries()) mapped.set(origin, childIds.map((id) => idMap.get(id)).filter(Boolean));
  return mapped;
}

function taskScoreForBinding(binding, task) {
  const target = norm(task.target);
  const value = norm(binding.value);
  let score = 0;
  if (target && !genericTarget(target) && (value.toLowerCase().includes(target.toLowerCase()) || target.toLowerCase().includes(value.toLowerCase()))) score += 10;
  score += overlapScore(value, `${target} ${task.raw_text || ''}`) * 5;
  return score;
}

function scopeContextBindings(bindings, tasks) {
  const scoped = [];
  for (const binding of bindings) {
    const scored = tasks.map((task) => ({ task, score: taskScoreForBinding(binding, task) })).sort((a, b) => b.score - a.score || a.task.order - b.task.order);
    const best = scored[0]?.score || 0;
    let taskIds = [];
    let scope = 'UNRESOLVED';
    if (best > 0) {
      taskIds = scored.filter((item) => item.score === best).map((item) => item.task.id);
      scope = taskIds.length === 1 ? 'TASK' : 'MULTI_TASK';
    } else if (tasks.length === 1) {
      taskIds = [tasks[0].id];
      scope = 'TASK';
    } else if (GLOBAL_SCOPE_CUE.test(binding.value) || GLOBAL_BOUNDARY_CUE.test(binding.value)) {
      taskIds = tasks.map((task) => task.id);
      scope = 'GLOBAL';
    }
    scoped.push({ ...binding, scope, task_ids: taskIds });
  }
  return scoped;
}

function appendSource(fieldSources, field, source) {
  if (!fieldSources[field]) fieldSources[field] = [];
  fieldSources[field].push(source);
}

function baseFieldSources(task) {
  const own = { source: 'question', source_span: task.source_span };
  const local = (field) => Array.isArray(task[field]) && task[field].length ? [own] : [];
  return {
    action: [own], target: [own], purpose: [own], objective: [own],
    premises: local('premises'), constraints: local('constraints'), prohibitions: local('prohibitions'), preserve: local('preserve'), replace: local('replace'),
    conditions: local('conditions'), exceptions: local('exceptions'), deadlines: local('deadlines'), priority: [own],
    success_criteria: local('success_criteria'), completion_criteria: local('completion_criteria'), verification: local('verification'),
    evidence_need: task.evidence_need?.required || (task.evidence_need?.queries || []).length ? [own] : [],
    dependencies: local('depends_on'), parallel_group: [], deliverables: local('deliverables'), unresolved: local('unresolved')
  };
}

function applyContextBindings(tasks, bindings) {
  const byTask = new Map(tasks.map((task) => [task.id, []]));
  const unresolved = [];
  for (const binding of bindings) {
    if (!binding.task_ids.length) {
      unresolved.push(`CONTEXT_SCOPE_UNRESOLVED:${binding.kind}:${binding.source_span.start}-${binding.source_span.end}`);
      continue;
    }
    for (const taskId of binding.task_ids) byTask.get(taskId)?.push(binding);
  }
  for (const task of tasks) {
    task.field_sources = task.field_sources || baseFieldSources(task);
    for (const binding of byTask.get(task.id) || []) {
      const source = { source: 'context', source_span: binding.source_span, scope: binding.scope, value: binding.value };
      if (binding.kind === 'premise') { task.premises = unique([...(task.premises || []), binding.value]); appendSource(task.field_sources, 'premises', source); }
      if (binding.kind === 'constraint') { task.constraints = unique([...(task.constraints || []), binding.value]); appendSource(task.field_sources, 'constraints', source); }
      if (binding.kind === 'prohibition') { task.prohibitions = unique([...(task.prohibitions || []), binding.value]); appendSource(task.field_sources, 'prohibitions', source); }
      if (binding.kind === 'preserve') { task.preserve = unique([...(task.preserve || []), binding.value]); appendSource(task.field_sources, 'preserve', source); }
      if (binding.kind === 'replace') { task.replace = unique([...(task.replace || []), binding.value]); appendSource(task.field_sources, 'replace', source); }
      if (binding.kind === 'condition') { task.conditions = unique([...(task.conditions || []), binding.value]); appendSource(task.field_sources, 'conditions', source); }
      if (binding.kind === 'exception') { task.exceptions = unique([...(task.exceptions || []), binding.value]); appendSource(task.field_sources, 'exceptions', source); }
      if (binding.kind === 'success') { task.success_criteria = unique([...(task.success_criteria || []), binding.value]); appendSource(task.field_sources, 'success_criteria', source); }
      if (binding.kind === 'completion') { task.completion_criteria = unique([...(task.completion_criteria || []), binding.value]); appendSource(task.field_sources, 'completion_criteria', source); }
      if (binding.kind === 'verification') { task.verification = unique([...(task.verification || []), binding.value]); appendSource(task.field_sources, 'verification', source); }
      if (binding.kind === 'priority') {
        task.priority_records = unique([...(task.priority_records || []), binding.value]);
        task.priority = task.priority_records[0] || task.priority || 'normal';
        appendSource(task.field_sources, 'priority', { ...source, value: binding.value });
      }
      if (binding.kind === 'deadline') {
        task.deadlines = unique([...(task.deadlines || []), binding.value]);
        appendSource(task.field_sources, 'deadlines', source);
      }
    }
  }
  return unresolved;
}

function referenceKind(text) {
  if (/(?:これら|それら|両方|双方|前二つ|前2つ)/i.test(text)) return 'PLURAL_PREVIOUS';
  if (/前者/i.test(text)) return 'FORMER';
  if (/後者/i.test(text)) return 'LATTER';
  if (/(?:これ|それ|あれ|上記|前述|同じ対象)/i.test(text)) return 'PREVIOUS';
  return null;
}

function resolveReferences(tasks) {
  const unresolved = [];
  const resolutions = [];
  for (let index = 0; index < tasks.length; index += 1) {
    const task = tasks[index];
    const raw = norm(task.raw_text || task.source_span?.text || '');
    const kind = referenceKind(`${task.target || ''} ${raw}`);
    if (!kind || (!genericTarget(task.target) && !REFERENCE_CUE.test(raw))) continue;
    const prior = tasks.slice(0, index).filter((item) => !genericTarget(item.target));
    let selected = [];
    if (kind === 'PREVIOUS') selected = prior.slice(-1);
    if (kind === 'FORMER') selected = prior.slice(-2, -1);
    if (kind === 'LATTER') selected = prior.slice(-1);
    if (kind === 'PLURAL_PREVIOUS') selected = prior.slice(-2);
    if (!selected.length || (kind === 'PLURAL_PREVIOUS' && selected.length < 2)) {
      task.unresolved = unique([...(task.unresolved || []), 'reference']);
      unresolved.push(`${task.id}:reference`);
      continue;
    }
    const previousTarget = task.target;
    task.target = unique(selected.map((item) => item.target)).join('・');
    task.objective = taskPurpose(task.action, task.target);
    task.purpose = explicitPurpose(raw, task.objective);
    task.reference_resolution = { kind, from_task_ids: selected.map((item) => item.id), previous_target: previousTarget, resolved_target: task.target };
    task.unresolved = unique((task.unresolved || []).filter((item) => item !== 'target' && item !== 'reference'));
    task.field_sources = task.field_sources || baseFieldSources(task);
    task.field_sources.target = [{ source: 'task_reference', source_task_ids: selected.map((item) => item.id), source_spans: selected.map((item) => item.source_span) }];
    resolutions.push({ task_id: task.id, ...task.reference_resolution });
  }
  return { unresolved, resolutions };
}

function explicitDependencies(task, tasks) {
  const known = new Set(tasks.map((item) => item.id));
  const raw = String(task.raw_text || task.source_span?.text || '');
  if (!DEPENDENCY_CUE.test(raw) && !BRANCH_CUE.test(raw)) return [];
  const refs = [...raw.matchAll(/\bT\d{2,4}\b/g)].map((match) => match[0]).filter((taskId) => known.has(taskId) && taskId !== task.id);
  return unique(refs);
}

function semanticDependencies(task, tasks, index) {
  const raw = norm(task.raw_text || task.source_span?.text || '');
  if (!DEPENDENCY_CUE.test(raw)) return [];
  const prior = tasks.slice(0, index);
  if (!prior.length) return [];
  if (/(?:両方|双方|これら|前二つ|前2つ|both|these tasks)/i.test(raw)) return prior.slice(-2).map((item) => item.id);
  const explicitTargets = prior.filter((candidate) => {
    const target = norm(candidate.target);
    return target && !genericTarget(target) && raw.toLowerCase().includes(target.toLowerCase());
  });
  if (explicitTargets.length) return explicitTargets.map((item) => item.id);
  if (/^(?:その後|次に|最後に|then|next|afterward)/i.test(raw)) return [prior.at(-1).id];
  return [];
}

function branchOutcome(text) {
  const value = norm(text);
  if (/(?:問題なければ|問題がなければ|問題がない場合|成功したら|成功した場合|成立したら|成立した場合|確認できたら|確認できた場合|検証できたら|検証できた場合|if\b[^.!?]*(?:pass|valid|success)|when\b[^.!?]*(?:pass|valid|success))/i.test(value)) return 'TRUE';
  if (/(?:問題があれば|問題がある場合|失敗したら|失敗した場合|不成立|確認できなければ|確認できない場合|検証できなければ|検証できない場合|unless\b|if\b[^.!?]*(?:fail|invalid|error))/i.test(value)) return 'FALSE';
  if (/(?:ただし|例外|except|however)/i.test(value)) return 'EXCEPTION';
  return BRANCH_CUE.test(value) ? 'CONDITIONAL' : null;
}

function buildBranchRelations(tasks) {
  const relations = [];
  const dependencyEdges = [];
  const unresolved = [];
  const relationType = (outcome) => outcome === 'EXCEPTION' ? 'EXCEPTION' : outcome === 'FALSE' ? 'ELSE' : 'IF';
  const makeRelation = ({ task, parentId = null, outcome = 'CONDITIONAL', conditions = [], inline = false, suffix = '' }) => ({
    branch_id: inline ? `BR-INLINE-${task.id}${suffix}` : `BR-${parentId}-${task.id}${suffix}`,
    branch_group_id: inline ? `BR-INLINE-${task.id}` : `BR-${parentId}`,
    condition_task_id: inline ? null : parentId,
    source_task_id: inline ? task.id : parentId,
    target_task_id: task.id,
    type: relationType(outcome),
    outcome,
    inline_condition: inline,
    conditions: unique(conditions),
    source_span: task.source_span
  });

  for (let index = 0; index < tasks.length; index += 1) {
    const task = tasks[index];
    const raw = norm(task.raw_text || task.source_span?.text || '');
    const outcome = branchOutcome(raw);
    const taskConditions = unique(task.conditions || []);
    const taskExceptions = unique(task.exceptions || []);
    if (!outcome && !taskConditions.length && !taskExceptions.length) continue;
    const previous = tasks[index - 1] || null;
    const siblingSource = previous?.conditional_branch && ['TRUE', 'FALSE'].includes(outcome)
      ? previous.conditional_branch.condition_task_id
      : null;
    const parentId = siblingSource || (task.depends_on || []).at(-1) || previous?.id || null;

    if (!parentId) {
      const exceptionSet = new Set(taskExceptions.map((item) => norm(item)));
      const inlineConditions = taskConditions.filter((item) => !exceptionSet.has(norm(item)) && !/(?:ただし|例外|except|however)/i.test(item));
      const primaryOutcome = outcome && outcome !== 'EXCEPTION' ? outcome : (inlineConditions.length ? 'TRUE' : null);
      if (primaryOutcome) {
        relations.push(makeRelation({
          task,
          outcome: primaryOutcome,
          conditions: unique([...inlineConditions, ...(BRANCH_CUE.test(raw) ? [raw] : [])]),
          inline: true,
          suffix: '-IF'
        }));
      }
      if (taskExceptions.length) {
        relations.push(makeRelation({ task, outcome: 'EXCEPTION', conditions: taskExceptions, inline: true, suffix: '-EXCEPTION' }));
      }
      if (!primaryOutcome && !taskExceptions.length) {
        unresolved.push(`${task.id}:branch_source`);
        continue;
      }
      task.conditional_branch = relations.find((item) => item.target_task_id === task.id && item.inline_condition) || null;
      task.execution_gate = 'CONDITIONAL';
      continue;
    }

    const relation = makeRelation({
      task,
      parentId,
      outcome: outcome || 'CONDITIONAL',
      conditions: unique([...taskConditions, ...taskExceptions, ...(BRANCH_CUE.test(raw) ? [raw] : [])])
    });
    relations.push(relation);
    dependencyEdges.push({ from: parentId, to: task.id, type: 'CONDITIONAL_DEPENDENCY', reason: relation.outcome });
    task.conditional_branch = relation;
    task.execution_gate = 'CONDITIONAL';
  }
  const groups = [];
  for (const groupId of unique(relations.map((item) => item.branch_group_id))) {
    const items = relations.filter((item) => item.branch_group_id === groupId);
    groups.push({
      branch_group_id: groupId,
      condition_task_id: items[0].condition_task_id,
      source_task_id: items[0].source_task_id,
      on_true: items.filter((item) => item.outcome === 'TRUE').map((item) => item.target_task_id),
      on_false: items.filter((item) => item.outcome === 'FALSE').map((item) => item.target_task_id),
      exceptions: items.filter((item) => item.outcome === 'EXCEPTION').map((item) => item.target_task_id),
      conditional: items.filter((item) => item.outcome === 'CONDITIONAL').map((item) => item.target_task_id)
    });
  }
  return { relations, groups, dependencyEdges, unresolved };
}

function correctionRelations(question, tasks) {
  const corrections = splitWithSpans(question).filter((span) => /(?:訂正|撤回|前言|ではなく|じゃなく|違う|correct|withdraw|retract|instead)/i.test(span.text));
  const relations = [];
  const unresolved = [];
  for (const correction of corrections) {
    const current = tasks.find((task) => task.source_span.start < correction.end && task.source_span.end > correction.start) || tasks.find((task) => task.source_span.start >= correction.start);
    const priorTasks = tasks.filter((task) => task.source_span.end <= correction.start && task.id !== current?.id);
    const named = priorTasks.filter((task) => task.target && norm(correction.text).toLowerCase().includes(norm(task.target).toLowerCase()));
    const prior = (named.length === 1 ? named[0] : priorTasks.sort((a, b) => b.source_span.end - a.source_span.end)[0]);
    if (current && prior) relations.push({ supersedes: prior.id, superseded_by: current.id, type: named.length === 1 ? 'TARGETED_CORRECTION' : 'EXPLICIT_CORRECTION', source_span: correction });
    else unresolved.push(`CORRECTION_SCOPE_UNRESOLVED:${correction.start}-${correction.end}`);
  }
  return { relations, unresolved };
}

function buildGraph(tasks, baseDependencies = []) {
  const known = new Set(tasks.map((task) => task.id));
  const edges = [];
  for (const edge of baseDependencies) if (known.has(edge.from) && known.has(edge.to) && edge.from !== edge.to) edges.push({ ...edge });
  for (let index = 0; index < tasks.length; index += 1) {
    const task = tasks[index];
    for (const parent of explicitDependencies(task, tasks)) edges.push({ from: parent, to: task.id, type: 'EXPLICIT_TASK_REFERENCE', reason: 'explicit_task_reference' });
    for (const parent of semanticDependencies(task, tasks, index)) edges.push({ from: parent, to: task.id, type: 'SEMANTIC_DEPENDENCY', reason: 'deterministic_target_or_order_reference' });
  }
  const dedup = [...new Map(edges.map((edge) => [`${edge.from}>${edge.to}>${edge.type}`, edge])).values()];
  const incoming = new Map(tasks.map((task) => [task.id, new Set()]));
  for (const edge of dedup) incoming.get(edge.to)?.add(edge.from);
  const remaining = new Set(tasks.map((task) => task.id));
  const waves = [];
  while (remaining.size) {
    const ready = [...remaining].filter((taskId) => [...incoming.get(taskId)].every((parent) => !remaining.has(parent))).sort();
    if (!ready.length) return { dependencies: dedup, execution_waves: waves, cycle: [...remaining].sort(), valid: false };
    waves.push(ready);
    ready.forEach((taskId) => remaining.delete(taskId));
  }
  return { dependencies: dedup, execution_waves: waves, cycle: [], valid: true };
}

function isMaterialOnlyQuestion(question) {
  const q = String(question || '');
  if (/(?:API|api)[^。！？\n]{0,32}変更するな|変更するな[^。！？\n]{0,32}(?:API|api)/i.test(q)) return false;
  return /判断材料|材料整理|材料だけ|材料のみ|材料化|比較材料|比較軸|最終結論|最終判断は外部|外部AIに委ね|勝者|採用案|断定せず|材料を|構造化|分類と材料/i.test(q);
}

function isNaturalUserConsult(question) {
  const q = norm(question);
  if (!q || isMaterialOnlyQuestion(q)) return false;
  const consultCue = /(?:したい|困って|相談|教えて|進め|比較|確認|整理|考え|手を付|方向|リスク|原因|どうす|何を先|漠然|うまくいっ|エラー|ぶつか|疲れ|条件|来月|来週|予算|納期)/i.test(q);
  if (!consultCue && !/改善/i.test(q)) return false;
  if (q.length < 20 && !/(?:困|相談|漠然|疲れ|ぶつか|条件|来月|来週|予算|納期|手を付|方向|どうす|何を先)/i.test(q)) return false;
  return consultCue || /改善/i.test(q);
}

function dedupeEnrichedConstraintRecords(packetRecords = [], tasks = []) {
  const out = [];
  const seen = new Set();
  for (const record of [...objectList(packetRecords), ...tasks.flatMap((task) => task.constraint_records || [])]) {
    const key = record?.constraint_id || `${record?.type}:${record?.value}:${record?.target || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(record);
  }
  return out;
}

function objectList(items) {
  return Array.isArray(items) ? items : [];
}

function parserFailClosedRequest(request = {}) {
  const packet = request.analysis_task_packet || {};
  const markers = [
    ...(packet.hard_blockers || []),
    ...(packet.unresolved || []),
    ...((request.instruction_understanding?.blocked_reasons) || [])
  ].map((item) => String(item));
  if (request.instruction_understanding?.mode === 'FAIL_CLOSED') return true;
  return markers.some((item) => /JAPANESE_PARSER_FAIL_CLOSED|PARSER_OVERALL_FAILED|PARSER_CLIENT_NOT_CONFIGURED|PARSER_ERROR/i.test(item));
}

function isMcpDeepPathRequest(request = {}) {
  const understanding = request.instruction_understanding || {};
  if (understanding.mode === 'DEEP_PATH') return true;
  return /Deterministic-Japanese-Parser-MCP|deterministic-japanese-parser/i.test(String(understanding.parser || ''));
}

function parserActionGuardOnly(request = {}) {
  const packet = request.analysis_task_packet || {};
  const blockers = (packet.hard_blockers || []).map(String);
  if (!(packet.tasks || []).length && blockers.length) {
    return blockers.every((item) => /PARSER_ACTION_GUARD_BLOCKED|NO_EXECUTABLE_ACTION|parser_task_graph_empty/i.test(item));
  }
  return false;
}

function synthesizeFallbackTasks(question) {
  const q = norm(question);
  if (!q) return [];
  const span = { start: 0, end: q.length, text: q };
  const target = inferTarget(q, actionOccurrences(q)[0], '判断対象');
  const shell = () => ({
    source_span: span,
    raw_text: q,
    source_role: 'DIRECT_INPUT',
    actionable: true,
    unresolved: [],
    deliverables: [],
    depends_on: [],
    premises: [],
    constraints: [],
    prohibitions: [],
    preserve: [],
    replace: [],
    verification: [],
    completion_criteria: [],
    branches: [],
    conditional_branch: null,
    execution_gate: 'ALWAYS',
    parallel_group: null,
    supersedes: [],
    superseded_by: []
  });
  const acts = actionOccurrences(q).filter((item) => item.id !== 'preserve');
  if (!acts.length) {
    return [{
      ...shell(),
      id: 'T01',
      order: 1,
      action: 'analyze',
      target,
      objective: taskPurpose('analyze', target),
      purpose: explicitPurpose(q, taskPurpose('analyze', target))
    }];
  }
  return acts.slice(0, 4).map((act, index) => {
    const action = act.id === 'decide' ? 'analyze' : act.id;
    const taskTarget = inferTarget(q, act, target);
    return {
      ...shell(),
      id: `T${String(index + 1).padStart(2, '0')}`,
      order: index + 1,
      action,
      target: taskTarget,
      objective: taskPurpose(action, taskTarget),
      purpose: explicitPurpose(q, taskPurpose(action, taskTarget))
    };
  });
}

function supplementMaterialOnlyTasks(question, tasks) {
  const q = norm(question);
  if (!isMaterialOnlyQuestion(q)) return tasks;
  const instruction = extractInstructionUnderstandingFields(q);
  return tasks.map((task) => {
    const copy = { ...task, material_only: true };
    if (copy.action === 'decide') copy.action = 'analyze';
    const goal = instruction.user_goal || explicitPurpose(copy.raw_text || copy.source_span?.text || q, copy.purpose || copy.objective);
    if (goal) {
      copy.user_goal = goal;
      if (!/^(?:analyze|verify)$/u.test(copy.action) || /改善/u.test(goal)) {
        copy.purpose = goal;
      }
    }
    copy.desired_effect = instruction.desired_effect;
    copy.effect_status = instruction.effect_status;
    copy.output_policy = instruction.output_policy;
    return copy;
  });
}

function expandNaturalConsultTasks(question, tasks) {
  if (!isNaturalUserConsult(question) || tasks.length !== 1) return tasks;
  const q = norm(question);
  const first = { ...tasks[0] };
  const target = first.target && !genericTarget(first.target)
    ? first.target
    : inferTarget(q, actionOccurrences(q)[0], first.target || '判断対象');
  const secondAction = /比較|対立|案|vs|トレードオフ/i.test(q) ? 'compare' : 'verify';
  const t1 = {
    ...first,
    id: 'T01',
    order: 1,
    target,
    action: first.action === 'decide' ? 'analyze' : (first.action || 'analyze'),
    objective: taskPurpose(first.action === 'decide' ? 'analyze' : (first.action || 'analyze'), target),
    purpose: explicitPurpose(q, taskPurpose(first.action === 'decide' ? 'analyze' : (first.action || 'analyze'), target)),
    source_span: { start: 0, end: q.length, text: q },
    raw_text: q,
    depends_on: []
  };
  const t2 = {
    ...t1,
    id: 'T02',
    order: 2,
    action: secondAction,
    objective: taskPurpose(secondAction, target),
    purpose: explicitPurpose(q, taskPurpose(secondAction, target)),
    depends_on: []
  };
  return [t1, t2];
}

function enrichRequest(request, input = {}) {
  if (!request?.analysis_task_packet) return request;
  const question = String(input.question ?? request.original_question ?? request.normalized_question ?? '');
  const context = String(input.context || '');
  const materialOnlyRequest = isMaterialOnlyQuestion(question);
  const sourceRegions = regions(question);
  const packet = request.analysis_task_packet;
  const mcpDeepPath = isMcpDeepPathRequest(request);
  let kept = (packet.tasks || []).filter((task) => isolatedRole(task.source_span || { start: 0, end: 0 }, sourceRegions) === 'DIRECT_INPUT');
  const maySynthesizeFallback = !parserFailClosedRequest(request)
    && !mcpDeepPath
    && (materialOnlyRequest || isNaturalUserConsult(question) || parserActionGuardOnly(request));
  let usedSynthesizedFallback = false;
  if (!kept.length && norm(question) && maySynthesizeFallback) {
    kept = synthesizeFallbackTasks(question);
    usedSynthesizedFallback = kept.length > 0;
  }
  const removed = (packet.tasks || []).filter((task) => !kept.includes(task));

  const collapsedPrefixes = collapseDependencyPrefixes(kept, question);
  const expanded = expandCompoundTasks(collapsedPrefixes.tasks);
  const remapped = remapTasks(expanded.tasks);
  let tasks = remapped.tasks.map((task) => ({
    ...task,
    source_role: 'DIRECT_INPUT',
    source_axes: { container_role: ['PLAIN_CONTAINER'], content_role: ['INSTRUCTION_OR_REQUEST'], quotation_role: ['DIRECT'] },
    purpose: explicitPurpose(task.raw_text || task.source_span?.text || '', task.purpose || task.objective || taskPurpose(task.action, task.target)),
    material_only: materialOnlyRequest,
    branches: [],
    conditional_branch: null,
    execution_gate: 'ALWAYS',
    parallel_group: null,
    supersedes: [],
    superseded_by: []
  }));
  tasks = supplementMaterialOnlyTasks(question, tasks);
  if (materialOnlyRequest) {
    tasks = consolidateMaterialOnlyConsultTasks(question, tasks);
  } else if (!mcpDeepPath && (!parserFailClosedRequest(request) || parserActionGuardOnly(request))) {
    tasks = expandNaturalConsultTasks(question, tasks);
  }

  const originFinalMap = remapOriginMap(applyOriginAliases(expanded.originMap, collapsedPrefixes.aliases), remapped.idMap);
  const baseDeps = [];
  for (const edge of packet.dependencies || []) {
    const fromChildren = originFinalMap.get(edge.from) || [];
    const toChildren = originFinalMap.get(edge.to) || [];
    if (fromChildren.length && toChildren.length) baseDeps.push({ from: fromChildren.at(-1), to: toChildren[0], type: edge.type || 'BASE_DEPENDENCY', reason: edge.reason || 'base_dependency' });
  }
  for (const task of tasks) for (const parent of task.depends_on || []) baseDeps.push({ from: parent, to: task.id, type: 'INTRA_SENTENCE_ORDER', reason: 'compound_action_sequence' });

  for (const task of tasks) {
    task.field_sources = baseFieldSources(task);
    if (!genericTarget(task.target)) task.unresolved = unique((task.unresolved || []).filter((item) => item !== 'target'));
  }
  const references = resolveReferences(tasks);
  const scopedContext = scopeContextBindings(contextBindings(context), tasks);
  const contextUnresolved = applyContextBindings(tasks, scopedContext);

  let graph = buildGraph(tasks, baseDeps);
  for (const task of tasks) task.depends_on = unique(graph.dependencies.filter((edge) => edge.to === task.id).map((edge) => edge.from));
  const branches = buildBranchRelations(tasks);
  if (branches.dependencyEdges.length) {
    graph = buildGraph(tasks, [...graph.dependencies, ...branches.dependencyEdges]);
    for (const task of tasks) task.depends_on = unique(graph.dependencies.filter((edge) => edge.to === task.id).map((edge) => edge.from));
  }

  for (const task of tasks) {
    if (!genericTarget(task.target) || !(task.depends_on || []).length) continue;
    const parent = tasks.find((item) => item.id === task.depends_on[task.depends_on.length - 1]);
    if (!parent?.target || genericTarget(parent.target)) continue;
    if (!['verify', 'improve', 'implement', 'integrate', 'migrate', 'remove'].includes(task.action)) continue;
    task.target = parent.target;
    task.objective = taskPurpose(task.action, task.target, task.objective);
    task.purpose = explicitPurpose(task.raw_text || task.source_span?.text || '', task.objective);
    task.unresolved = unique((task.unresolved || []).filter((item) => item !== 'target'));
  }

  const corrections = correctionRelations(question, tasks);
  for (const relation of corrections.relations) {
    const newer = tasks.find((task) => task.id === relation.superseded_by);
    const older = tasks.find((task) => task.id === relation.supersedes);
    if (newer) newer.supersedes = unique([...(newer.supersedes || []), relation.supersedes]);
    if (older) older.superseded_by = unique([...(older.superseded_by || []), relation.superseded_by]);
  }

  const cycleBlockers = graph.valid ? [] : [`TASK_GRAPH_CYCLE:${graph.cycle.join(',')}`];
  const isolatedNotes = removed.map((task) => `SOURCE_ROLE_ISOLATED:${task.id}:${isolatedRole(task.source_span, sourceRegions)}`);
  const inheritedUnresolved = (packet.unresolved || []).map((item) => {
    const match = /^(T\d+):(.*)$/.exec(String(item));
    if (!match) return item;
    const children = originFinalMap.get(match[1]) || [];
    if (!children.length) return null;
    const childId = children[0];
    const child = tasks.find((task) => task.id === childId);
    const reason = match[2];
    if (reason === 'target' && child && !genericTarget(child.target)) return null;
    if (reason === 'reference' && child?.reference_resolution) return null;
    return `${childId}:${reason}`;
  }).filter(Boolean);

  for (const task of tasks) {
    const waveIndex = graph.execution_waves.findIndex((wave) => wave.includes(task.id));
    const wave = waveIndex >= 0 ? graph.execution_waves[waveIndex] : [];
    task.parallel_group = wave.length > 1 ? `W${String(waveIndex + 1).padStart(2, '0')}` : null;
    task.parallelizable = wave.length > 1;
    task.branches = branches.relations.filter((item) => item.target_task_id === task.id || item.condition_task_id === task.id);
    if (!task.deliverables.length && ['implement', 'improve', 'integrate', 'migrate', 'remove'].includes(task.action)) task.unresolved = unique([...(task.unresolved || []), 'deliverable']);
    if (genericTarget(task.target)) task.unresolved = unique([...(task.unresolved || []), 'target']);
    if ((task.depends_on || []).length) appendSource(task.field_sources, 'dependencies', { source: 'task_graph', source_task_ids: task.depends_on });
    if (task.parallel_group) appendSource(task.field_sources, 'parallel_group', { source: 'task_graph', value: task.parallel_group });
    if ((task.unresolved || []).length) appendSource(task.field_sources, 'unresolved', { source: 'task_graph', values: task.unresolved });
  }

  if (usedSynthesizedFallback && isNaturalUserConsult(question) && !materialOnlyRequest) {
    for (const task of tasks) {
      if (task.action === 'improve') {
        task.action = 'analyze';
        task.objective = taskPurpose('analyze', task.target);
        task.purpose = explicitPurpose(question, task.objective);
      }
      task.unresolved = unique((task.unresolved || []).filter((item) => item !== 'deliverable'));
    }
  }

  let unresolved = unique([
    ...inheritedUnresolved,
    ...corrections.unresolved,
    ...references.unresolved,
    ...contextUnresolved,
    ...branches.unresolved,
    ...tasks.flatMap((task) => (task.unresolved || []).map((item) => `${task.id}:${item}`))
  ]);
  if (usedSynthesizedFallback && isNaturalUserConsult(question)) {
    unresolved = unresolved.filter((item) => !/^parser_/i.test(String(item)));
  }
  const prohibitionReplaceBlockers = [];
  const modifyTasks = tasks.filter((task) => (task.replace || []).length || task.action === 'improve');
  const prohibitionTasks = tasks.filter((task) => task.clause_type === 'prohibition');
  const effectiveProhibitionTasks = prohibitionTasks.filter((task) => {
    if (normativeOnlyProhibition(task)) return false;
    const target = String(task.target || '');
    if (/UNRESOLVED|予算上限と為替リスクのトレードオフ/i.test(target)) return false;
    return true;
  });
  function normativeOnlyProhibition(task) {
    const text = [task.raw_text, task.target, ...(task.prohibitions || [])].join(' ');
    return /断定|結論|勝者|採用案|実行指示|判断材料/i.test(text)
      && !/変更|置換|削除|API|実装|移行/i.test(text);
  }
  for (const left of modifyTasks) {
    for (const right of effectiveProhibitionTasks) {
      if (left.id === right.id) continue;
      if (normativeOnlyProhibition(right)) continue;
      const leftText = [left.raw_text, left.target, ...(left.replace || [])].join(' ');
      const rightText = [right.raw_text, right.target, ...(right.prohibitions || [])].join(' ');
      if (tokenOverlap(leftText, rightText) >= 0.25) {
        prohibitionReplaceBlockers.push('PROHIBITION_REPLACE_OVERLAP');
        break;
      }
    }
    if (prohibitionReplaceBlockers.length) break;
  }
  if (!prohibitionReplaceBlockers.length && /(?:API|api)[^。！？\n]{0,24}変更するな|変更するな[^。！？\n]{0,24}(?:API|api)/i.test(question)) {
    const modifies = tasks.filter((task) => ['improve', 'implement', 'migrate', 'remove', 'integrate'].includes(task.action));
    if (modifies.length) prohibitionReplaceBlockers.push('PROHIBITION_REPLACE_OVERLAP');
  }
  const sourceConflicts = [];
  if (/矛盾|食い違|逆の指示|一次情報矛盾/i.test(question)) {
    sourceConflicts.push({ type: 'SOURCE_GUIDANCE_CONFLICT', note: 'CONFLICTING_PRIMARY_SOURCES_PRESERVED' });
  }
  let prohibitionBlockers = [...prohibitionReplaceBlockers];
  if (materialOnlyRequest && prohibitionBlockers.length) {
    sourceConflicts.push({ type: 'PROHIBITION_REPLACE_TENSION', note: prohibitionBlockers.join('|') });
    prohibitionBlockers = [];
  }
  const materialOnlyParserTensionCodes = new Set([
    'PARSER_ACTION_GUARD_BLOCKED',
    'NO_EXECUTABLE_ACTION',
    'NEGATED_ACTION'
  ]);
  let hardBlockers = unique([...(packet.hard_blockers || []), ...cycleBlockers, ...prohibitionBlockers]);
  const relaxParserGuardBlockers = (materialOnlyRequest || mcpDeepPath || (usedSynthesizedFallback && isNaturalUserConsult(question)))
    && tasks.length > 0
    && graph.valid;
  if (relaxParserGuardBlockers) {
    for (const item of hardBlockers) {
      const code = String(item);
      if (materialOnlyParserTensionCodes.has(code)) {
        sourceConflicts.push({ type: 'PARSER_MATERIAL_ONLY_TENSION', note: code });
      }
    }
  }
  const instructionFields = extractInstructionUnderstandingFields(question);
  const enrichedPacket = {
    ...packet,
    user_goal: instructionFields.user_goal,
    desired_effect: instructionFields.desired_effect,
    effect_status: instructionFields.effect_status,
    output_policy: instructionFields.output_policy,
    conflicts: [...(packet.conflicts || []), ...sourceConflicts],
    schema_version: 'astera.analysis-task-packet.v2',
    task_decomposition_version: '3.0-canonical',
    tasks,
    dependencies: graph.dependencies,
    execution_waves: graph.execution_waves,
    branches: branches.relations,
    branch_groups: branches.groups,
    supersession_relations: corrections.relations,
    reference_resolutions: references.resolutions,
    unresolved,
    hard_blockers: hardBlockers,
    source_isolation: { removed_task_count: removed.length, notes: isolatedNotes, regions: sourceRegions },
    context_bindings: scopedContext,
    task_graph_validation: {
      valid: graph.valid,
      cycle: graph.cycle,
      dependency_count: graph.dependencies.length,
      wave_count: graph.execution_waves.length,
      branch_count: branches.relations.length,
      reference_resolution_count: references.resolutions.length,
      compound_split_count: expanded.splitCount,
      dependency_prefix_collapse_count: collapsedPrefixes.collapsed.length,
      unresolved_context_binding_count: contextUnresolved.length
    },
    source_spans: tasks.map((task) => ({ task_id: task.id, ...task.source_span })),
    constraint_records: dedupeEnrichedConstraintRecords(packet.constraint_records, tasks),
    deadlines: unique([...(packet.deadlines || []), ...tasks.flatMap((task) => task.deadlines || [])]),
    conditions: unique([...(packet.conditions || []), ...tasks.flatMap((task) => task.conditions || [])]),
    exceptions: unique([...(packet.exceptions || []), ...tasks.flatMap((task) => task.exceptions || [])]),
    priority_records: unique([
      ...(packet.priority_records || []),
      ...tasks.flatMap((task) => task.priority_records || [])
    ]),
    constraints: unique([...(packet.constraints || []), ...tasks.flatMap((task) => task.constraints || [])]),
    prohibitions: unique([...(packet.prohibitions || []), ...tasks.flatMap((task) => task.prohibitions || [])]),
    preserve: unique([...(packet.preserve || []), ...tasks.flatMap((task) => task.preserve || [])]),
    replace: unique([...(packet.replace || []), ...tasks.flatMap((task) => task.replace || [])]),
    verification: unique([...(packet.verification || []), ...tasks.flatMap((task) => task.verification || [])]),
    completion_criteria: unique([...(packet.completion_criteria || []), ...tasks.flatMap((task) => task.completion_criteria || [])])
  };

  return {
    ...request,
    schema_version: 'astera.request-model.v3',
    target: tasks[0]?.target || request.target || '',
    objective: tasks[0]?.purpose || tasks[0]?.objective || request.objective || '',
    user_goal: instructionFields.user_goal || tasks[0]?.user_goal || '',
    desired_effect: instructionFields.desired_effect,
    effect_status: instructionFields.effect_status,
    output_policy: instructionFields.output_policy,
    instruction_understanding: {
      ...(request.instruction_understanding || {}),
      task_decomposition: 'DETERMINISTIC_CANONICAL_V3',
      source_role_isolation: true,
      context_scope_binding: true,
      correction_history: true,
      reference_resolution: true,
      conditional_branching: true,
      multi_parent_dependencies: true,
      graph_validation: graph.valid ? 'VALID' : 'BLOCKED',
      execution_allowed: graph.valid && tasks.length > 0
        && !hardBlockers.some((item) => String(item).startsWith('TASK_GRAPH_CYCLE') || /^JAPANESE_PARSER_FAIL_CLOSED/i.test(String(item)))
        && (hardBlockers.length === 0
          || materialOnlyRequest
          || (usedSynthesizedFallback && isNaturalUserConsult(question))
          || (mcpDeepPath && graph.valid))
        && ((request.instruction_understanding?.execution_allowed !== false)
          || materialOnlyRequest
          || (usedSynthesizedFallback && isNaturalUserConsult(question))
          || mcpDeepPath),
      blocked_reasons: hardBlockers
    },
    analysis_task_packet: enrichedPacket
  };
}

module.exports = {
  enrichRequest,
  extractInstructionUnderstandingFields,
  extractPublicConstraintLines,
  explicitPurposeSpan,
  isMaterialOnlyQuestion,
  isNaturalUserConsult,
  isMcpDeepPathRequest,
  parserFailClosedRequest,
  regions,
  contextBindings,
  deliverables,
  actionOccurrences,
  splitCompoundTask,
  scopeContextBindings,
  resolveReferences,
  semanticDependencies,
  buildBranchRelations,
  buildGraph,
  correctionRelations
};
