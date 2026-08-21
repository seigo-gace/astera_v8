'use strict';

const { unique } = require('./judgment-materials-analyzer');

const norm = (value) => String(value || '').normalize('NFKC').replace(/\r\n?/g, '\n').trim();
const genericTarget = (value) => !value || /^(?:入力対象|input target|対象|target|これ|それ|あれ|これら|それら)$/iu.test(norm(value));

const ACTION_PATTERNS = Object.freeze([
  ['verify', /検証|確認|監査|調査|分析|解析|評価|verify|validate|audit|investigat|analy[sz]|evaluate|check/i],
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
    if (/前提|現状|現在|既存|対象は|given\b|assume|existing|currently/i.test(text)) push('premise');
    if (/禁止|するな|しないで|してはいけ|勝手に|must not|do not|never/i.test(text)) push('prohibition');
    if (/維持|保持|残す|壊さず|変えず|そのまま|keep|preserve|retain/i.test(text)) push('preserve');
    if (/置換|差し替|変更対象|replace|swap/i.test(text) && !/禁止|するな|must not|do not|never/i.test(text)) push('replace');
    if (/必ず|のみ|限定|守る|変更せず|must\b|only\b|without/i.test(text)) push('constraint');
    if (/成功条件|合格条件|success criteria|acceptance criteria/i.test(text)) push('success');
    if (/完了条件|completion criteria|done when/i.test(text)) push('completion');
    if (/検証|確認|テスト|test|verify|validate|assert|check/i.test(text)) push('verification');
    if (/(?:場合|とき|なら|ならば|であれば|を条件に|if\b|when\b|provided that|unless)/i.test(text)) push('condition');
    if (/(?:ただし|例外|除く|を除き|except|however|but only)/i.test(text)) push('exception');
    if (/(?:最優先|優先|先に|まず|priority|first|before)/i.test(text)) push('priority');
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

function actionOccurrences(text) {
  const found = [];
  for (const [id, pattern] of ACTION_PATTERNS) {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    const re = new RegExp(pattern.source, flags);
    for (const match of String(text || '').matchAll(re)) found.push({ id, index: match.index, end: match.index + match[0].length, match: match[0] });
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

function explicitPurpose(text, fallback = '') {
  const value = norm(text);
  const named = /(?:目的|狙い)(?:は|:|=)\s*([^。！？!?]{2,160})/i.exec(value);
  if (named) return norm(named[1]);
  const ja = /^(.{2,120}?)(?:ために|ため、|ため、?)(?=.{1,120}(?:検証|確認|改善|修正|実装|作成|移行|統合|削除))/u.exec(value);
  if (ja) return norm(ja[1]);
  const en = /(?:in order to|so that)\s+([^.;!?]{2,160})/i.exec(value);
  return en ? norm(en[1]) : fallback;
}

function inferTarget(text, actionMatch, fallback = '') {
  const value = norm(text);
  if (!value) return fallback;
  const named = /(?:対象|target)(?:は|:|=)\s*([^。！？!?\n]{1,140})/i.exec(value);
  if (named) return norm(named[1]);
  const match = actionMatch || actionOccurrences(value)[0];
  if (match) {
    const before = value.slice(0, match.index).replace(/^(?:そして|その後|次に|最後に|then|next|and then)\s*/i, '').trim();
    const jp = before.match(/([^。！？!?\n、,]{1,120}?)(?:を|について|に対して)\s*$/i);
    if (jp) {
      const candidate = norm(jp[1])
        .replace(/^(?:問題なければ|問題がなければ|問題があれば|成功したら|失敗したら|成立したら|不成立なら|確認できたら|確認できなければ|検証できたら|検証できなければ|ただし|例外として)\s*/u, '')
        .replace(/^(?:これ|それ|あれ|これら|それら)$/u, '');
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
  for (const task of output) task.depends_on = unique((task.depends_on || []).map((taskId) => idMap.get(taskId)).filter(Boolean));
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
    task.field_sources = baseFieldSources(task);
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
      if (binding.kind === 'priority') { task.priority = 'high'; appendSource(task.field_sources, 'priority', source); }
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
  if (/(?:問題なければ|問題がなければ|成功したら|成立したら|確認できたら|検証できたら|if\b[^.!?]*(?:pass|valid|success)|when\b[^.!?]*(?:pass|valid|success))/i.test(value)) return 'TRUE';
  if (/(?:問題があれば|失敗したら|不成立|確認できなければ|検証できなければ|unless\b|if\b[^.!?]*(?:fail|invalid|error))/i.test(value)) return 'FALSE';
  if (/(?:ただし|例外|except|however)/i.test(value)) return 'EXCEPTION';
  return BRANCH_CUE.test(value) ? 'CONDITIONAL' : null;
}

function buildBranchRelations(tasks) {
  const relations = [];
  const dependencyEdges = [];
  const unresolved = [];
  for (let index = 0; index < tasks.length; index += 1) {
    const task = tasks[index];
    const raw = norm(task.raw_text || task.source_span?.text || '');
    const outcome = branchOutcome(raw);
    if (!outcome && !(task.conditions || []).length && !(task.exceptions || []).length) continue;
    const previous = tasks[index - 1] || null;
    const siblingSource = previous?.conditional_branch && ['TRUE', 'FALSE'].includes(outcome)
      ? previous.conditional_branch.condition_task_id
      : null;
    const parentId = siblingSource || (task.depends_on || []).at(-1) || previous?.id || null;
    if (!parentId) {
      unresolved.push(`${task.id}:branch_source`);
      continue;
    }
    const relation = {
      branch_id: `BR-${parentId}-${task.id}`,
      branch_group_id: `BR-${parentId}`,
      condition_task_id: parentId,
      target_task_id: task.id,
      outcome: outcome || 'CONDITIONAL',
      conditions: unique([...(task.conditions || []), ...(task.exceptions || []), ...(BRANCH_CUE.test(raw) ? [raw] : [])]),
      source_span: task.source_span
    };
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
    const current = tasks.find((task) => task.source_span.start <= correction.end && task.source_span.end >= correction.start) || tasks.find((task) => task.source_span.start >= correction.start);
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

function enrichRequest(request, input = {}) {
  if (!request?.analysis_task_packet) return request;
  const question = String(input.question ?? request.original_question ?? request.normalized_question ?? '');
  const context = String(input.context || '');
  const sourceRegions = regions(question);
  const packet = request.analysis_task_packet;
  const kept = (packet.tasks || []).filter((task) => isolatedRole(task.source_span || { start: 0, end: 0 }, sourceRegions) === 'DIRECT_INPUT');
  const removed = (packet.tasks || []).filter((task) => !kept.includes(task));

  const expanded = expandCompoundTasks(kept);
  const remapped = remapTasks(expanded.tasks);
  const tasks = remapped.tasks.map((task) => ({
    ...task,
    source_role: 'DIRECT_INPUT',
    source_axes: { container_role: ['PLAIN_CONTAINER'], content_role: ['INSTRUCTION_OR_REQUEST'], quotation_role: ['DIRECT'] },
    purpose: explicitPurpose(task.raw_text || task.source_span?.text || '', task.purpose || task.objective || taskPurpose(task.action, task.target)),
    branches: [],
    conditional_branch: null,
    execution_gate: 'ALWAYS',
    parallel_group: null,
    supersedes: [],
    superseded_by: []
  }));

  const originFinalMap = remapOriginMap(expanded.originMap, remapped.idMap);
  const baseDeps = [];
  for (const edge of packet.dependencies || []) {
    const fromChildren = originFinalMap.get(edge.from) || [];
    const toChildren = originFinalMap.get(edge.to) || [];
    if (fromChildren.length && toChildren.length) baseDeps.push({ from: fromChildren.at(-1), to: toChildren[0], type: edge.type || 'BASE_DEPENDENCY', reason: edge.reason || 'base_dependency' });
  }
  for (const task of tasks) for (const parent of task.depends_on || []) baseDeps.push({ from: parent, to: task.id, type: 'INTRA_SENTENCE_ORDER', reason: 'compound_action_sequence' });

  for (const task of tasks) task.field_sources = baseFieldSources(task);
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
    return children.length ? `${children[0]}:${match[2]}` : null;
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

  const unresolved = unique([
    ...inheritedUnresolved,
    ...corrections.unresolved,
    ...references.unresolved,
    ...contextUnresolved,
    ...branches.unresolved,
    ...tasks.flatMap((task) => (task.unresolved || []).map((item) => `${task.id}:${item}`))
  ]);
  const hardBlockers = unique([...(packet.hard_blockers || []), ...cycleBlockers]);
  const enrichedPacket = {
    ...packet,
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
      unresolved_context_binding_count: contextUnresolved.length
    },
    source_spans: tasks.map((task) => ({ task_id: task.id, ...task.source_span })),
    constraints: unique(tasks.flatMap((task) => task.constraints || [])),
    prohibitions: unique(tasks.flatMap((task) => task.prohibitions || [])),
    preserve: unique(tasks.flatMap((task) => task.preserve || [])),
    replace: unique(tasks.flatMap((task) => task.replace || [])),
    verification: unique(tasks.flatMap((task) => task.verification || [])),
    completion_criteria: unique(tasks.flatMap((task) => task.completion_criteria || []))
  };

  return {
    ...request,
    schema_version: 'astera.request-model.v3',
    target: tasks[0]?.target || request.target || '',
    objective: tasks[0]?.purpose || tasks[0]?.objective || request.objective || '',
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
      execution_allowed: (request.instruction_understanding?.execution_allowed !== false) && hardBlockers.length === 0,
      blocked_reasons: hardBlockers
    },
    analysis_task_packet: enrichedPacket
  };
}

module.exports = {
  enrichRequest,
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
