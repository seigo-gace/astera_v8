'use strict';

function canonicalValue(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
  return JSON.stringify(value);
}

function getField(candidate, field) {
  if (field === 'text') return `${candidate.title} ${candidate.excerpt}`;
  const parts = String(field || '').split('.');
  let current = candidate;
  for (const part of parts) current = current?.[part];
  if (current === undefined) current = candidate.fields?.[field];
  return current;
}

function detectConflicts(candidates, conditions) {
  const conflicts = [];
  for (const condition of conditions) {
    if (condition.operator !== 'EQ') continue;
    const groups = new Map();
    for (const candidate of candidates) {
      const actual = getField(candidate, condition.field);
      const value = canonicalValue(actual);
      if (value == null || value === '') continue;
      if (!groups.has(value)) groups.set(value, []);
      groups.get(value).push(candidate.candidate_id);
    }
    if (groups.size <= 1) continue;
    const values = [...groups.entries()].map(([value, candidateIds]) => ({ value, candidate_ids: candidateIds.sort() }));
    const officialGroups = values.filter((entry) => entry.candidate_ids.some((id) => {
      const candidate = candidates.find((item) => item.candidate_id === id);
      return candidate?.source_role === 'PRIMARY' || candidate?.source_role === 'OFFICIAL';
    }));
    const severity = officialGroups.length >= 2 ? 'CRITICAL' : condition.class === 'CORE' ? 'MAJOR' : 'MINOR';
    conflicts.push(Object.freeze({ condition_id: condition.condition_id, field: condition.field, severity, values: Object.freeze(values) }));
  }
  const highest = conflicts.some((item) => item.severity === 'CRITICAL') ? 'CRITICAL'
    : conflicts.some((item) => item.severity === 'MAJOR') ? 'MAJOR'
      : conflicts.some((item) => item.severity === 'MINOR') ? 'MINOR' : 'NONE';
  return Object.freeze({ highest_severity: highest, conflicts: Object.freeze(conflicts) });
}

module.exports = { detectConflicts };
