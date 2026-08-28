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
  return [
    ...(domain.primary ? [{ lens: domain.primary, tier: 'PRIMARY' }] : []),
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
  compileLensPlan,
  lensPlanEntries,
  lensPlanValues
};
