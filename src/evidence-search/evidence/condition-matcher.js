'use strict';

function scalar(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
  return value;
}

function getField(candidate, field) {
  if (field === 'text') return `${candidate.title} ${candidate.excerpt}`;
  const parts = field.split('.');
  let current = candidate;
  for (const part of parts) current = current?.[part];
  if (current === undefined) current = candidate.fields?.[field];
  return current;
}

function compare(actual, condition) {
  const expected = condition.normalized_value;
  const normalizedActual = Array.isArray(actual) ? actual.map(scalar) : scalar(actual);
  switch (condition.operator) {
    case 'EXISTS': return actual !== undefined && actual !== null && actual !== '';
    case 'EQ': return normalizedActual === scalar(expected);
    case 'CONTAINS': {
      if (Array.isArray(normalizedActual)) return normalizedActual.includes(scalar(expected));
      return String(normalizedActual || '').includes(String(scalar(expected) || ''));
    }
    case 'IN': {
      const list = Array.isArray(expected) ? expected.map(scalar) : [scalar(expected)];
      return list.includes(normalizedActual);
    }
    case 'GTE': return Number(actual) >= Number(expected);
    case 'LTE': return Number(actual) <= Number(expected);
    case 'BETWEEN': return Array.isArray(expected) && expected.length === 2 && Number(actual) >= Number(expected[0]) && Number(actual) <= Number(expected[1]);
    default: return false;
  }
}

function measureConditions(candidates, conditions) {
  return conditions.map((condition) => {
    const supporting = [];
    const contradicting = [];
    for (const candidate of candidates) {
      const actual = getField(candidate, condition.field);
      if (compare(actual, condition)) supporting.push(candidate.candidate_id);
      else if (actual !== undefined && actual !== null && condition.operator === 'EQ') contradicting.push(candidate.candidate_id);
    }
    const status = supporting.length ? 'CONFIRMED' : contradicting.length ? 'CONTRADICTED' : 'UNKNOWN';
    return Object.freeze({ condition_id: condition.condition_id, class: condition.class, required: condition.required, status, supporting_candidate_ids: Object.freeze(supporting.sort()), contradicting_candidate_ids: Object.freeze(contradicting.sort()) });
  });
}

module.exports = { measureConditions };
