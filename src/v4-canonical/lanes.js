'use strict';

const { ClaimStatus, UndeterminedReason } = require('./confirmation');
const { deepFreeze } = require('./core');
const { compileLensPlan, lensPlanEntries, lensPlanValues } = require('../lens-plan');

const RISK_RULES = Object.freeze([
  { id: 'RISK-SECURITY', key: 'security', re: /api.?key|secret|token|password|鍵|認証|credential|権限|permission/i, weight: 25, impact: '秘密情報漏洩・不正利用・権限逸脱' },
  { id: 'RISK-PRODUCTION', key: 'production', re: /本番|公開|deploy|デプロイ|release|リリース|0\.0\.0\.0|https/i, weight: 20, impact: '未検証変更の公開・Rollback不能・利用者影響' },
  { id: 'RISK-DATA', key: 'data', re: /ログ|保存|個人情報|プライバシ|履歴|DB|SQLite|データ|record/i, weight: 18, impact: '機密性・整合性・保持／削除境界の破綻' },
  { id: 'RISK-LEGAL', key: 'legal', re: /法務|契約|規約|著作権|商標|個人情報保護|legal|license|contract/i, weight: 22, impact: '適用法域・権利・義務の誤認' },
  { id: 'RISK-MEDICAL', key: 'medical_safety', re: /医療|症状|患者|診断|治療|薬|medical|patient|diagnos|treatment/i, weight: 28, impact: '健康・安全への高影響判断' },
  { id: 'RISK-COST', key: 'cost', re: /課金|従量|コスト|料金|credit|budget|費用/i, weight: 12, impact: '予算超過・予期しない継続費用' },
  { id: 'RISK-SCOPE', key: 'scope', re: /全部|全て|完璧|一切|丸ごと|entire|everything|complete/i, weight: 10, impact: '変更範囲肥大化・検証漏れ' }
]);

const DOMAIN_QUESTIONS = Object.freeze({
  G08: ['適用法域と期限は？', '契約・通知・Evidenceは揃っている？'],
  G10: ['成功指標・Budget・期限は？', '顧客Dataと競合Evidenceはある？'],
  G11: ['適用する会計・税務基準と法域は？', '返金・失効・未使用残高の条件は？'],
  G23: ['緊急のRed Flagはある？', '症状の経過・既往・現在の薬は？'],
  G29: ['互換条件・依存関係・Rollbackは？', 'Testと合格条件は何？'],
  G30: ['評価Setと品質基準は？', 'Human Reviewと失敗時停止条件は？'],
  G31: ['Asset・Trust Boundary・影響Versionは？', '悪用痕跡・Patch・隔離・復旧経路は？'],
  G34: ['現場に継続中の危険はある？', 'Evidenceの保全と通報経路は？'],
  G38: ['地域・季節・Space・Budgetは？', '手間と安全条件はどこまで許容できる？']
});

function resultMap(results) {
  return new Map(results.map((result) => [result.claim_id, result]));
}

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function reasonsFor(result) {
  return Array.isArray(result?.reasons) ? result.reasons : [];
}

function bindingsFor(result) {
  return Array.isArray(result?.bindings) ? result.bindings : [];
}

function bindingRefs(results = []) {
  const refs = [];
  for (const result of results) {
    for (const binding of bindingsFor(result)) {
      refs.push({
        claim_id: result.claim_id,
        binding_id: binding.binding_id || null,
        candidate_id: binding.candidate_id || binding.evidence_id || null,
        source_role: binding.source_role || null,
        source_family_id: binding.source_family_id || null,
        authority_id: binding.authority_id || null,
        url: binding.url || binding.canonical_locator?.url || null
      });
    }
  }
  return [...new Map(refs.map((ref) => [JSON.stringify(ref), ref])).values()];
}

function taskSignalText(task = {}, claims = []) {
  return uniqueStrings([
    ...claims.map((claim) => claim.raw_text),
    task.source_span?.text,
    task.raw_text,
    task.target,
    task.objective,
    ...(task.constraints || []),
    ...(task.prohibitions || []),
    ...(task.preserve || []),
    ...(task.replace || []),
    ...(task.conditions || []),
    ...(task.exceptions || [])
  ]).join('\n');
}

function factLane(claims, results, domain = {}) {
  const byId = resultMap(results);
  const confirmedClaims = claims.filter((claim) => byId.get(claim.claim_id)?.status === ClaimStatus.CONFIRMED);
  const undeterminedClaims = claims.filter((claim) => byId.get(claim.claim_id)?.status === ClaimStatus.UNDETERMINED);
  const domainEvidence = lensPlanEntries(domain, 'evidence').map((entry) => ({
    item: entry.value,
    reason: 'LensPlanが判断前に収集対象として指定している。',
    source: 'LENS_PLAN',
    lens_sources: entry.sources
  }));
  const unresolvedEvidence = undeterminedClaims.map((claim) => ({
    item: claim.raw_text,
    reason: reasonsFor(byId.get(claim.claim_id)).join(' / '),
    source: 'CANONICAL_CLAIM'
  }));
  return deepFreeze({
    lane: 'fact',
    confirmed_claim_ids: confirmedClaims.map((claim) => claim.claim_id).sort(),
    undetermined_claim_ids: undeterminedClaims.map((claim) => claim.claim_id).sort(),
    confirmed: confirmedClaims.map((claim) => ({
      claim_id: claim.claim_id,
      text: claim.raw_text,
      status: ClaimStatus.CONFIRMED,
      supported_scope: byId.get(claim.claim_id).supported_scope,
      bindings: byId.get(claim.claim_id).support_binding_ids || []
    })),
    unconfirmed: undeterminedClaims.map((claim) => ({
      claim_id: claim.claim_id,
      text: claim.raw_text,
      status: ClaimStatus.UNDETERMINED,
      reasons: reasonsFor(byId.get(claim.claim_id))
    })),
    opinions: [],
    evidence_need: unresolvedEvidence,
    evidence_gaps: [...domainEvidence, ...unresolvedEvidence]
  });
}

function riskLane(claims, results, task, domain) {
  const byId = resultMap(results);
  const criticalIds = new Set((task.critical_target_ids || []).map(String));
  const targets = claims.filter((claim) => criticalIds.has(claim.claim_id));
  const signalText = taskSignalText(task, claims);
  const riskItems = [];

  for (const rule of RISK_RULES) {
    const match = signalText.match(rule.re);
    if (!match) continue;
    const affected = claims.filter((claim) => rule.re.test(String(claim.raw_text || '')));
    riskItems.push({
      rule_id: rule.id,
      key: rule.key,
      impact: rule.impact,
      failure_condition: `Signal「${match[0]}」に関する条件・境界・検証が未成立のまま進行する。`,
      weight: rule.weight,
      source: 'CANONICAL_CLAIM_OR_TASK_SIGNAL',
      trigger: match[0],
      claim_ids: affected.map((claim) => claim.claim_id).sort(),
      claim_statuses: affected.map((claim) => ({ claim_id: claim.claim_id, status: byId.get(claim.claim_id)?.status || ClaimStatus.UNDETERMINED }))
    });
  }

  for (const [index, entry] of lensPlanEntries(domain, 'risk').entries()) {
    riskItems.push({
      rule_id: `RISK-LENS-${index + 1}`,
      key: `lens-risk-${index + 1}`,
      impact: entry.value,
      failure_condition: 'LensPlanで要求されたRisk観点が未確認のまま進行する。',
      weight: 20,
      source: 'LENS_PLAN',
      lens_sources: entry.sources,
      claim_ids: []
    });
  }

  for (const claim of claims) {
    const result = byId.get(claim.claim_id);
    if (result?.status === ClaimStatus.CONFIRMED) continue;
    const reasons = reasonsFor(result);
    const missingScope = result?.gate_details?.missing_scope_fields || [];
    riskItems.push({
      rule_id: 'RISK-UNDETERMINED-CLAIM',
      key: `undetermined:${claim.claim_id}`,
      impact: '未確定Claimを確定事実として扱う危険',
      failure_condition: reasons.length ? reasons.join(' / ') : 'Claim confirmation is incomplete.',
      weight: reasons.some((reason) => /CONFLICT/.test(reason)) ? 28 : 22,
      source: 'CANONICAL_CLAIM_CONFIRMATION',
      claim_ids: [claim.claim_id],
      reasons,
      missing_scope_fields: missingScope
    });
  }

  for (const [index, item] of (task.prohibitions || []).entries()) {
    riskItems.push({
      rule_id: 'RISK-PROHIBITION-BREACH',
      key: `prohibition:${index + 1}`,
      impact: '明示禁止条件への違反',
      failure_condition: String(item),
      weight: 30,
      source: 'TASK_GRAPH',
      claim_ids: []
    });
  }
  for (const [index, item] of (task.hard_blockers || []).entries()) {
    riskItems.push({
      rule_id: 'RISK-HARD-BLOCKER',
      key: `hard-blocker:${index + 1}`,
      impact: 'Hard Blocker未解消のまま処理を確定する危険',
      failure_condition: String(item),
      weight: 100,
      source: 'TASK_GRAPH',
      claim_ids: []
    });
  }

  const deduped = [...new Map(riskItems.map((item) => [`${item.rule_id}:${item.key}:${item.trigger || item.failure_condition}`, item])).values()]
    .sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0) || String(a.key).localeCompare(String(b.key)));
  const safety = lensPlanEntries(domain, 'safety');
  const highest = deduped[0] || null;
  return deepFreeze({
    lane: 'risk',
    source: 'CANONICAL_RECORDS_PLUS_POLICY_TASK_AND_LENS_PLAN',
    rule_ids: uniqueStrings(deduped.map((item) => item.rule_id)),
    target_count: targets.length,
    confirmed_count: targets.filter((claim) => byId.get(claim.claim_id)?.status === ClaimStatus.CONFIRMED).length,
    undetermined_count: targets.filter((claim) => byId.get(claim.claim_id)?.status !== ClaimStatus.CONFIRMED).length,
    target_claim_ids: targets.map((claim) => claim.claim_id).sort(),
    risk_count: deduped.length,
    risks: deduped,
    highest,
    hard_constraints: uniqueStrings([...(task.constraints || []), ...(task.prohibitions || []), ...(task.preserve || [])]),
    safety_gates: uniqueStrings([...(task.prohibitions || []), ...safety.map((entry) => entry.value), ...(task.hard_blockers || [])]),
    failure_conditions: uniqueStrings(deduped.map((item) => item.failure_condition)),
    evidence_trace: bindingRefs(results),
    level: Number(highest?.weight || 0) >= 30 ? 'high' : highest ? 'medium' : 'low'
  });
}

function multiLane(claims, results, domain, task = {}, searchPlan = {}) {
  const byId = resultMap(results);
  const confirmed = claims.filter((claim) => byId.get(claim.claim_id)?.status === ClaimStatus.CONFIRMED);
  const undetermined = claims.filter((claim) => byId.get(claim.claim_id)?.status !== ClaimStatus.CONFIRMED);
  const constraints = uniqueStrings([...(task.constraints || []), ...(task.prohibitions || []), ...(task.preserve || [])]);
  const completion = uniqueStrings([...(task.completion_criteria || []), ...(task.success_criteria || [])]);
  const domainEntries = lensPlanEntries(domain, 'multi');
  const riskEntries = lensPlanValues(domain, 'risk');
  const counterQueries = (searchPlan.queries || []).filter((query) => query.role === 'COUNTER');
  const evidenceRefs = bindingRefs(results);
  const base = [
    {
      id: 'forward',
      class: 'MAINLINE',
      focus: task.objective || task.target || '',
      conditions: uniqueStrings([...completion, ...constraints]),
      weaknesses: undetermined.map((claim) => `${claim.claim_id}:${reasonsFor(byId.get(claim.claim_id)).join('/') || 'UNDETERMINED'}`),
      claim_ids: confirmed.map((claim) => claim.claim_id).sort(),
      evidence_refs: evidenceRefs,
      source: 'CANONICAL_CLAIMS'
    },
    {
      id: 'defensive',
      class: 'DEFENSIVE',
      focus: uniqueStrings([...riskEntries, ...(task.hard_blockers || []), ...(task.prohibitions || [])]),
      conditions: constraints,
      weaknesses: riskEntries.length ? [] : ['No LensPlan risk focus is defined.'],
      claim_ids: claims.map((claim) => claim.claim_id).sort(),
      evidence_refs: evidenceRefs,
      source: 'CANONICAL_CLAIMS_PLUS_LENS_PLAN'
    },
    {
      id: 'critical',
      class: 'CRITICAL',
      focus: undetermined.map((claim) => `${claim.claim_id}:${claim.raw_text}`),
      conditions: uniqueStrings(undetermined.flatMap((claim) => reasonsFor(byId.get(claim.claim_id)))),
      weaknesses: confirmed.length ? [] : ['No CONFIRMED Claim is available.'],
      claim_ids: undetermined.map((claim) => claim.claim_id).sort(),
      evidence_refs: evidenceRefs,
      source: 'CANONICAL_CLAIM_CONFIRMATION'
    },
    {
      id: 'counter',
      class: 'COUNTER',
      focus: 'Counter / Alternative evidence angle',
      conditions: uniqueStrings((searchPlan.queries || []).filter((query) => query.role === 'COUNTER').map((query) => query.text)),
      weaknesses: counterQueries.length ? [] : ['Counter query is not present in the provided domain plan.'],
      claim_ids: claims.map((claim) => claim.claim_id).sort(),
      evidence_refs: evidenceRefs,
      source: 'CANONICAL_POLICY_SEARCH_ROLE'
    }
  ];
  for (const [index, entry] of domainEntries.entries()) {
    base.push({
      id: `domain:${index + 1}`,
      class: 'DOMAIN',
      focus: entry.value,
      conditions: [entry.value],
      weaknesses: [],
      claim_ids: claims.map((claim) => claim.claim_id).sort(),
      evidence_refs: evidenceRefs,
      lens_sources: entry.sources || [],
      source: 'LENS_PLAN'
    });
  }
  const perspectives = [...new Map(base.map((item) => [item.id, item])).values()];
  return deepFreeze({
    lane: 'multi',
    material_only: true,
    supported_scopes: confirmed.map((claim) => ({ claim_id: claim.claim_id, ...byId.get(claim.claim_id).supported_scope })).sort((a, b) => a.claim_id.localeCompare(b.claim_id)),
    perspectives,
    trade_off_map: perspectives.map((item) => ({
      id: item.id,
      class: item.class,
      focus: item.focus,
      conditions: item.conditions,
      weaknesses: item.weaknesses,
      status: 'MATERIAL_ONLY',
      source: item.source
    })),
    evidence_trace: evidenceRefs
  });
}

function inquiryLane(claims, results, domain, task = {}) {
  const byId = resultMap(results);
  const open = claims.filter((claim) => byId.get(claim.claim_id)?.status === ClaimStatus.UNDETERMINED).map((claim) => ({
    claim_id: claim.claim_id,
    text: claim.raw_text,
    reasons: reasonsFor(byId.get(claim.claim_id)),
    missing_scope_fields: byId.get(claim.claim_id)?.gate_details?.missing_scope_fields || []
  })).sort((a, b) => a.claim_id.localeCompare(b.claim_id));
  const evidenceNeeds = lensPlanValues(domain, 'evidence');
  const inquiryPrompts = lensPlanValues(domain, 'inquiry');
  const primaryId = domain.primary?.id || null;
  const weakTarget = /^(?:どう|これ|それ|あれ|ここ|そこ|this|that|it|what|how)$/i.test(String(task.target || '').trim());
  const missingTarget = !String(task.target || '').trim() || weakTarget || (task.unresolved || []).some((item) => /:target$/.test(String(item)));
  const actionNeedsCompletion = ['implement', 'improve', 'migrate', 'integrate', 'remove', 'replace', 'change', 'update'].includes(String(task.action || '').toLowerCase());
  const completion = uniqueStrings([...(task.completion_criteria || []), ...(task.success_criteria || [])]);
  const missingCompletion = actionNeedsCompletion && completion.length === 0;
  const missingFields = uniqueStrings([
    ...open.flatMap((item) => item.missing_scope_fields.map((field) => `${item.claim_id}:${field}`)),
    ...(missingTarget ? ['target'] : []),
    ...(missingCompletion ? ['completion_criteria'] : []),
    ...(task.unresolved || []),
    ...(task.hard_blockers || []).map((item) => `hard_blocker:${item}`)
  ]).sort();
  const domainQuestions = uniqueStrings([...(DOMAIN_QUESTIONS[primaryId] || []), ...inquiryPrompts]);
  const missingQuestions = uniqueStrings([
    ...open.flatMap((item) => item.reasons),
    ...domainQuestions,
    ...evidenceNeeds,
    ...(missingTarget ? ['判断対象・変更対象を一意に確定する。'] : []),
    ...(missingCompletion ? [`Task ${task.id || '-'} の完了・合格条件を明示する。`] : []),
    ...(task.hard_blockers || []).map((item) => `Hard Blockerを解消する: ${item}`)
  ]);
  return deepFreeze({
    lane: 'inquiry',
    problem_health: {
      healthy: missingFields.length === 0 && open.length === 0,
      reason: missingFields.length || open.length ? 'Canonical Claim / Task Scopeに未解決項目が残る。' : 'Canonical Claims and Task Scope are traceable.'
    },
    open_items: open,
    missing_fields: missingFields,
    missing_questions: missingQuestions,
    inquiry_lens: inquiryPrompts,
    evidence_need: evidenceNeeds,
    assumptions: [
      '入力に明示されていない事実は確認済みに昇格しない。',
      'UNDETERMINED Claimは未確定のまま保持する。',
      '禁止・維持・依存・完了条件は推測で補完しない。'
    ],
    extracted_scope: {
      target: task.target || null,
      action: task.action || null,
      objective: task.objective || null,
      completion_criteria: completion,
      constraints: task.constraints || [],
      prohibitions: task.prohibitions || [],
      preserve: task.preserve || [],
      replace: task.replace || [],
      conditions: task.conditions || [],
      exceptions: task.exceptions || [],
      dependencies: task.depends_on || []
    },
    evidence_trace: bindingRefs(results)
  });
}

function compareLane(claims, results, policyByClaimId, domain, task = {}) {
  const byId = resultMap(results);
  let numerator = 0;
  let denominator = 0;
  const booleans = [];
  const supportedScope = [];
  const unsupportedScope = [];
  const contradictionMap = [];

  for (const claim of claims) {
    const policy = policyByClaimId[claim.claim_id] || policyByClaimId.get?.(claim.claim_id);
    const required = policy?.required_scope_fields || [];
    const result = byId.get(claim.claim_id);
    const confirmed = result?.status === ClaimStatus.CONFIRMED;
    const known = required.filter((field) => claim[field] !== 'UNKNOWN');
    denominator += required.length;
    if (confirmed) numerator += known.length;
    booleans.push({
      claim_id: claim.claim_id,
      required_scope_defined: required.length > 0,
      all_required_scope_confirmed: confirmed && known.length === required.length
    });
    if (confirmed) {
      supportedScope.push({ claim_id: claim.claim_id, scope: result.supported_scope || null });
    } else {
      unsupportedScope.push({
        claim_id: claim.claim_id,
        missing_scope_fields: result?.gate_details?.missing_scope_fields || [],
        reasons: reasonsFor(result)
      });
    }
    if (reasonsFor(result).some((reason) => reason === UndeterminedReason.CONFLICT || /CONFLICT/.test(reason))) {
      contradictionMap.push({ claim_id: claim.claim_id, type: 'EVIDENCE_CONFLICT', reasons: reasonsFor(result) });
    }
  }

  if ((task.hard_blockers || []).length) {
    contradictionMap.push({ claim_id: null, type: 'HARD_BLOCKER', reasons: task.hard_blockers || [] });
  }
  for (const prohibited of task.prohibitions || []) {
    for (const replacement of task.replace || []) {
      if (String(prohibited).includes(String(replacement)) || String(replacement).includes(String(prohibited))) {
        contradictionMap.push({ claim_id: null, type: 'PROHIBITION_REPLACE_OVERLAP', reasons: [String(prohibited), String(replacement)] });
      }
    }
  }

  const dimensions = lensPlanEntries(domain, 'compare');
  const counts = {
    claims: claims.length,
    confirmed: results.filter((result) => result.status === ClaimStatus.CONFIRMED).length,
    undetermined: results.filter((result) => result.status === ClaimStatus.UNDETERMINED).length,
    insufficient_evidence: results.filter((result) => reasonsFor(result).includes(UndeterminedReason.INSUFFICIENT_EVIDENCE)).length,
    conflicts: results.filter((result) => reasonsFor(result).includes(UndeterminedReason.CONFLICT) || reasonsFor(result).some((reason) => /CONFLICT/.test(reason))).length
  };
  return deepFreeze({
    lane: 'compare',
    material_only: true,
    counts,
    coverage: denominator > 0 ? { numerator, denominator, ratio: numerator / denominator } : null,
    scope_booleans: booleans,
    supported_scope: supportedScope,
    unsupported_scope: unsupportedScope,
    contradiction_map: contradictionMap,
    condition_differences: {
      constraints: uniqueStrings(task.constraints || []),
      prohibitions: uniqueStrings(task.prohibitions || []),
      preserve: uniqueStrings(task.preserve || []),
      replace: uniqueStrings(task.replace || []),
      conditions: uniqueStrings(task.conditions || []),
      exceptions: uniqueStrings(task.exceptions || []),
      dependencies: uniqueStrings(task.depends_on || [])
    },
    dimensions: dimensions.map((entry) => entry.value),
    dimension_sources: dimensions,
    trade_off_differences: dimensions.map((entry) => ({ dimension: entry.value, lens_sources: entry.sources, status: 'MATERIAL_ONLY' })),
    evidence_trace: bindingRefs(results),
    selected_candidate: null,
    candidate_ranking: [],
    rejected_candidates: [],
    verdict: {
      decision: 'MATERIAL_ONLY',
      reason: 'Astera does not select, rank, recommend, adopt, reject, or hold candidates.'
    }
  });
}

function buildFiveLanes({ claims, results, policyByClaimId, task = {}, domain = {}, searchPlan = {} }) {
  const lensPlan = domain.lens_plan || compileLensPlan(domain);
  const effectiveDomain = { ...domain, lens_plan: lensPlan };
  return deepFreeze({
    lens_plan: lensPlan,
    fact: factLane(claims, results, effectiveDomain),
    risk: riskLane(claims, results, task, effectiveDomain),
    multi: multiLane(claims, results, effectiveDomain, task, searchPlan),
    inquiry: inquiryLane(claims, results, effectiveDomain, task),
    compare: compareLane(claims, results, policyByClaimId, effectiveDomain, task)
  });
}

module.exports = { factLane, riskLane, multiLane, inquiryLane, compareLane, buildFiveLanes, RISK_RULES, DOMAIN_QUESTIONS };
