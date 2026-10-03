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

// Additive breadth only. The canonical G34 genre explicitly covers Public Safety,
// Forensics and Emergency. Its representative catalog profile is forensics-heavy,
// so these entries keep emergency-response judgment material inside the same G34
// authority without deleting or replacing the existing forensic lens.
const GENRE_BREADTH_AUGMENTATIONS = Object.freeze({
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
