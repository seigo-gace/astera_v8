'use strict';

const { deepFreeze } = require('./v4-canonical/core');

const CHANNEL_FIELDS = Object.freeze({
  fact: 'fact_lens',
  risk: 'risk_lens',
  multi: 'multi_lens',
  inquiry: 'inquiry_lens',
  compare: 'compare_lens',
  evidence: 'evidence_to_collect',
  safety: 'safety_gate'
});

// Additive breadth only. These entries do not replace the canonical G01-G38
// catalog. They supplement representative catalog profiles where a specialist
// domain needs additional pre-decision material (facts, failure conditions,
// comparison dimensions, evidence characteristics) to cover the wider genre.
// As with the existing G34 emergency breadth, they never select, rank or
// recommend a candidate.
const GENRE_BREADTH_AUGMENTATIONS = Object.freeze({
  G01: Object.freeze({
    id: 'G01-BREADTH-INFORMATION-QUALITY', name: 'G01 Information Quality Breadth',
    fact_lens: Object.freeze(['Source Authority・情報源Authority', 'Freshness・鮮度']),
    risk_lens: Object.freeze(['Conflict・矛盾']),
    compare_lens: Object.freeze(['Source Authority・情報源Authority', 'Freshness・鮮度', 'Conflict・矛盾']),
    evidence_to_collect: Object.freeze(['Source Provenance・情報源Provenance', 'Last Updated・最終更新', 'Corroborating / Conflicting Sources・一致・矛盾Source'])
  }),
  G02: Object.freeze({
    id: 'G02-BREADTH-ETHICAL-TRADEOFF', name: 'G02 Ethical Trade-off Breadth',
    fact_lens: Object.freeze(['Stakeholder・利害関係者', 'Values・価値']),
    multi_lens: Object.freeze(['Stakeholder・利害関係者']),
    compare_lens: Object.freeze(['Values・価値', 'Trade-off・トレードオフ'])
  }),
  G07: Object.freeze({
    id: 'G07-BREADTH-POLICY-EXECUTION', name: 'G07 Policy Execution Breadth',
    fact_lens: Object.freeze(['Jurisdiction・管轄', 'Implementation・実施']),
    risk_lens: Object.freeze(['Public Impact・公共影響']),
    compare_lens: Object.freeze(['Implementation・実施', 'Public Impact・公共影響'])
  }),
  G08: Object.freeze({
    id: 'G08-BREADTH-LEGAL-APPLICABILITY', name: 'G08 Legal Applicability Breadth',
    fact_lens: Object.freeze(['Jurisdiction・管轄', 'Effective Date・施行日']),
    risk_lens: Object.freeze(['Exception・例外']),
    inquiry_lens: Object.freeze(['適用Jurisdiction・管轄、Effective Date・施行日、Exception・例外は何か'])
  }),
  G10: Object.freeze({
    id: 'G10-BREADTH-BUSINESS-ECONOMICS', name: 'G10 Business Economics Breadth',
    fact_lens: Object.freeze(['Market・市場', 'Unit Economics・収益構造']),
    risk_lens: Object.freeze(['Execution Risk・実行リスク']),
    compare_lens: Object.freeze(['Market・市場', 'Unit Economics・収益構造', 'Execution Risk・実行リスク'])
  }),
  G12: Object.freeze({
    id: 'G12-BREADTH-WORKFORCE-DYNAMICS', name: 'G12 Workforce Dynamics Breadth',
    fact_lens: Object.freeze(['Skills・技能', 'Labor Market・労働市場']),
    risk_lens: Object.freeze(['Retention・定着']),
    compare_lens: Object.freeze(['Skills・技能', 'Labor Market・労働市場', 'Retention・定着'])
  }),
  G18: Object.freeze({
    id: 'G18-BREADTH-MATHEMATICAL-UNCERTAINTY', name: 'G18 Mathematical Uncertainty Breadth',
    fact_lens: Object.freeze(['Assumption・仮定', 'Method・手法']),
    risk_lens: Object.freeze(['Uncertainty・不確実性']),
    compare_lens: Object.freeze(['Assumption・仮定', 'Method・手法', 'Uncertainty・不確実性'])
  }),
  G20: Object.freeze({
    id: 'G20-BREADTH-MATERIAL-CHARACTERIZATION', name: 'G20 Material Characterization Breadth',
    fact_lens: Object.freeze(['Composition・組成', 'Property・特性', 'Test Condition・試験条件']),
    compare_lens: Object.freeze(['Property・特性', 'Test Condition・試験条件'])
  }),
  G22: Object.freeze({
    id: 'G22-BREADTH-ECOLOGICAL-EVIDENCE', name: 'G22 Ecological Evidence Breadth',
    fact_lens: Object.freeze(['Species・種', 'Ecosystem・生態系']),
    evidence_to_collect: Object.freeze(['Evidence Quality・根拠品質'])
  }),
  G25: Object.freeze({
    id: 'G25-BREADTH-ENGINEERING-ASSURANCE', name: 'G25 Engineering Assurance Breadth',
    fact_lens: Object.freeze(['Requirement・要求', 'Verification・検証']),
    risk_lens: Object.freeze(['Failure Mode・故障モード']),
    compare_lens: Object.freeze(['Requirement・要求', 'Failure Mode・故障モード', 'Verification・検証'])
  }),
  G26: Object.freeze({
    id: 'G26-BREADTH-BUILT-ENVIRONMENT', name: 'G26 Built Environment Breadth',
    fact_lens: Object.freeze(['Code・基準', 'Site Condition・現場条件']),
    compare_lens: Object.freeze(['Lifecycle・ライフサイクル'])
  }),
  G27: Object.freeze({
    id: 'G27-BREADTH-ENERGY-SYSTEM', name: 'G27 Energy System Breadth',
    fact_lens: Object.freeze(['Demand・需要', 'Cost Assumption・費用前提']),
    risk_lens: Object.freeze(['Reliability・信頼性']),
    compare_lens: Object.freeze(['Demand・需要', 'Reliability・信頼性', 'Cost Assumption・費用前提'])
  }),
  G30: Object.freeze({
    id: 'G30-BREADTH-AI-EVALUATION', name: 'G30 AI Evaluation Breadth',
    fact_lens: Object.freeze(['Dataset・データセット', 'Metric・指標']),
    risk_lens: Object.freeze(['Failure Mode・失敗モード']),
    compare_lens: Object.freeze(['Dataset・データセット', 'Metric・指標', 'Failure Mode・失敗モード'])
  }),
  G31: Object.freeze({
    id: 'G31-BREADTH-SECURITY-CONTROL', name: 'G31 Security Control Breadth',
    fact_lens: Object.freeze(['Threat・脅威', 'Asset・資産']),
    compare_lens: Object.freeze(['Control Effectiveness・対策効果'])
  }),
  G33: Object.freeze({
    id: 'G33-BREADTH-CONSUMER-SAFETY', name: 'G33 Consumer Safety Breadth',
    fact_lens: Object.freeze(['User Exposure・利用者曝露']),
    risk_lens: Object.freeze(['Failure・故障']),
    compare_lens: Object.freeze(['Recall / Mitigation・是正'])
  }),
  G34: Object.freeze({
    id: 'G34-BREADTH-EMERGENCY',
    name: 'G34 Public Safety / Emergency Breadth',
    fact_lens: Object.freeze(['Hazard・危険', 'Response Capacity・対応能力']),
    risk_lens: Object.freeze(['Escalation・エスカレーション']),
    multi_lens: Object.freeze(['Emergency Responder・緊急対応者']),
    inquiry_lens: Object.freeze([
      '現在のHazard・危険範囲は何か',
      'Response Capacity・対応能力は十分か',
      'Escalation・エスカレーション条件は何か'
    ]),
    compare_lens: Object.freeze([
      'Human Safety・人命安全',
      'Response Capacity・対応能力',
      'Escalation Control・エスカレーション制御',
      'Response Time・対応時間',
      'Recovery・復旧性'
    ]),
    evidence_to_collect: Object.freeze([
      'Emergency Response Plan・緊急対応計画',
      'Incident Log・対応記録',
      '訓練記録'
    ]),
    safety_gate: Object.freeze(['Escalationと二次被害を確認する'])
  }),
  G35: Object.freeze({
    id: 'G35-BREADTH-DEFENSE-GOVERNANCE', name: 'G35 Defense Governance Breadth',
    fact_lens: Object.freeze(['Mission Need・任務要求']),
    compare_lens: Object.freeze(['Lifecycle・ライフサイクル', 'Governance・統治'])
  }),
  G36: Object.freeze({
    id: 'G36-BREADTH-TELECOM-ARCHITECTURE', name: 'G36 Telecom Architecture Breadth',
    fact_lens: Object.freeze(['Capacity・容量', 'Latency・遅延', 'Interoperability・相互運用']),
    compare_lens: Object.freeze(['Capacity・容量', 'Latency・遅延', 'Interoperability・相互運用'])
  }),
  G38: Object.freeze({
    id: 'G38-BREADTH-PERSONAL-DECISION', name: 'G38 Personal Decision Breadth',
    fact_lens: Object.freeze(['Need・必要性', 'Total Cost・総費用', 'Constraint・制約']),
    compare_lens: Object.freeze(['Need・必要性', 'Total Cost・総費用', 'Constraint・制約'])
  })
});

function clean(value) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function sourceDescriptor(lens, tier) {
  return Object.freeze({
    tier,
    lens_id: String(lens?.id || ''),
    lens_name: String(lens?.name || '')
  });
}

function sourceLenses(domain = {}) {
  const primaryId = String(domain.primary?.id || '');
  const breadth = GENRE_BREADTH_AUGMENTATIONS[primaryId] || null;
  return [
    ...(domain.primary ? [{ lens: domain.primary, tier: 'PRIMARY' }] : []),
    ...(breadth ? [{ lens: breadth, tier: 'PRIMARY_BREADTH' }] : []),
    ...(Array.isArray(domain.secondary) ? domain.secondary.map((lens) => ({ lens, tier: 'SECONDARY' })) : []),
    ...(Array.isArray(domain.overlays) ? domain.overlays.map((lens) => ({ lens, tier: 'OVERLAY' })) : [])
  ];
}

function compileChannel(domain, field) {
  const map = new Map();
  for (const { lens, tier } of sourceLenses(domain)) {
    const values = Array.isArray(lens?.[field]) ? lens[field] : [];
    for (const raw of values) {
      const value = clean(raw);
      if (!value) continue;
      const key = value.toLocaleLowerCase();
      const existing = map.get(key) || { value, sources: [] };
      const source = sourceDescriptor(lens, tier);
      if (!existing.sources.some((item) => item.tier === source.tier && item.lens_id === source.lens_id)) {
        existing.sources.push(source);
      }
      map.set(key, existing);
    }
  }
  return [...map.values()].map((entry) => Object.freeze({
    value: entry.value,
    sources: Object.freeze(entry.sources)
  }));
}

function compileLensPlan(domain = {}) {
  const channels = Object.fromEntries(
    Object.entries(CHANNEL_FIELDS).map(([channel, field]) => [channel, Object.freeze(compileChannel(domain, field))])
  );
  return deepFreeze({
    schema_version: 'astera.lens-plan.v1',
    taxonomy_version: domain.taxonomy_version || domain.primary?.taxonomy_version || null,
    primary_id: domain.primary?.id || null,
    secondary_ids: (domain.secondary || []).map((lens) => lens.id).filter(Boolean),
    overlay_ids: (domain.overlays || []).map((lens) => lens.id).filter(Boolean),
    channels
  });
}

function lensPlanEntries(domain = {}, channel) {
  const entries = domain.lens_plan?.channels?.[channel];
  if (Array.isArray(entries)) return entries;
  const field = CHANNEL_FIELDS[channel];
  if (!field) return [];
  return compileChannel(domain, field);
}

function lensPlanValues(domain = {}, channel) {
  return lensPlanEntries(domain, channel).map((entry) => entry.value);
}

module.exports = {
  CHANNEL_FIELDS,
  GENRE_BREADTH_AUGMENTATIONS,
  compileLensPlan,
  lensPlanEntries,
  lensPlanValues
};
