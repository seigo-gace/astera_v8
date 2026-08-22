'use strict';

const { unique } = require('../canonical-v4-core');

async function run({ task = null, domain = {}, canonical_claim_records = [], evidence_packet = null } = {}) {
  const t = task || { id: null, target: '対象', objective: '判断材料を構造化する', constraints: [], prohibitions: [], preserve: [], success_criteria: [] };
  const own = canonical_claim_records.filter((record) => record.task_id === t.id);
  const confirmed = own.filter((record) => record.status === 'CONFIRMED').length;
  const undetermined = own.filter((record) => record.status === 'UNDETERMINED').length;
  const hard = unique([...(t.constraints || []), ...(t.prohibitions || []), ...(t.preserve || [])]);
  const ja = /[ぁ-んァ-ヶ一-龠々]/.test(t.source_span?.text || '');
  const domainViews = Array.isArray(domain.primary?.multi_lens) ? domain.primary.multi_lens : [];
  const perspectives = [
    {
      id: 'objective',
      label: ja ? '目的視点' : 'Objective view',
      focus: t.objective || t.target,
      observations: unique([...(t.success_criteria || []), `CONFIRMED=${confirmed}`, `UNDETERMINED=${undetermined}`]),
      source: 'task_contract_and_canonical_claim_records'
    },
    {
      id: 'constraint',
      label: ja ? '制約視点' : 'Constraint view',
      focus: t.target || 'target',
      observations: hard.length ? hard : [ja ? '明示Hard Constraintなし' : 'No explicit hard constraint'],
      source: 'task_contract'
    },
    {
      id: 'evidence',
      label: ja ? '根拠視点' : 'Evidence view',
      focus: t.target || 'target',
      observations: own.map((record) => `${record.status}:${record.statement}`).slice(0, 12),
      source: 'canonical_claim_records'
    }
  ];
  if (domainViews.length) perspectives.push({ id: 'domain', label: domain.primary?.name || 'Domain', focus: domainViews.join(' / '), observations: domainViews.slice(0, 12), source: 'domain_lens' });
  return {
    pillar: 'multi',
    task_id: t.id || null,
    perspectives,
    angles: Object.fromEntries(perspectives.map((item) => [item.id, `${item.focus}｜${item.observations.join(' / ')}`])),
    trade_off_map: perspectives.map((item) => ({ id: item.id, observations: item.observations, source: item.source })),
    domain_template: domain.primary ? { id: domain.primary.id, name: domain.primary.name } : null,
    evidence_state: evidence_packet?.state || null,
    authority: {
      stage: 'multi',
      owns: ['independent_perspective_projection'],
      does_not_own: ['candidate_ranking', 'selected_candidate', 'decision', 'recommendation']
    }
  };
}

module.exports = { run };
