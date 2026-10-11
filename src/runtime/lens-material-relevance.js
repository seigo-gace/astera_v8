'use strict';

const GENERIC_PARTS = new Set([
  'risk','risks','failure','failures','condition','conditions','material','materials','fact','facts',
  'evidence','source','sources','check','checks','requirement','requirements','item','items',
  'リスク','危険','失敗','条件','材料','事実','根拠','確認','要件','要求','対象','項目','専門','判断'
]);

function clean(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function meaningfulParts(value) {
  const raw = clean(value)
    .split(/[\s/／・,，、:：;；()（）\[\]{}<>「」『』＝=+→←|｜]+/u)
    .map((part) => part.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean);
  return [...new Set(raw.filter((part) => {
    if (GENERIC_PARTS.has(part)) return false;
    if (/^[a-z0-9]+$/u.test(part)) return part.length >= 4;
    return part.length >= 2;
  }))];
}

function requestSourceText(request = {}, canonical = {}) {
  const values = [
    request.request_text,
    request.source_span?.text,
    request.raw_text,
    request.target,
    request.objective,
    request.purpose,
    ...(Array.isArray(request.objectives) ? request.objectives : []),
    ...(Array.isArray(request.material_requirements) ? request.material_requirements : []),
    ...(Array.isArray(request.local_context?.material_requirements) ? request.local_context.material_requirements : []),
    ...(Array.isArray(request.constraints) ? request.constraints : []),
    ...(Array.isArray(request.prohibitions) ? request.prohibitions : []),
    ...(Array.isArray(request.preserve) ? request.preserve : []),
    ...(Array.isArray(request.replace) ? request.replace : []),
    ...(Array.isArray(request.conditions) ? request.conditions : []),
    ...(Array.isArray(request.exceptions) ? request.exceptions : []),
    ...(Array.isArray(canonical.records)
      ? canonical.records.map((record) => record?.claim?.raw_text || record?.claim?.text)
      : [])
  ];
  return clean(values.filter(Boolean).join('\n'));
}

function lensMaterialRelevant(value, requestOrSource = '', matchedSignals = []) {
  const source = typeof requestOrSource === 'string'
    ? clean(requestOrSource)
    : requestSourceText(requestOrSource);
  const material = clean(value);
  if (!material || !source) return false;
  if (source.includes(material)) return true;

  const parts = meaningfulParts(material);
  if (parts.some((part) => source.includes(part))) return true;

  const signals = Array.isArray(matchedSignals) ? matchedSignals : [];
  const signalText = clean(signals.join(' '));
  return parts.some((part) => signalText.includes(part));
}

module.exports = {
  clean,
  meaningfulParts,
  requestSourceText,
  lensMaterialRelevant
};
