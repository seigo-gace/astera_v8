'use strict';

const CONTRACT_VERSION = 'astera.judgment-material-basis.v1';
const ORIGINAL_CLASSIFICATION_SOURCE = 'ASTERA_V4_DOMAIN_CLASSIFICATION';
const ORIGINAL_CLASSIFICATION_RESOLUTION = 'ORIGINAL_DOMAIN_CLASSIFICATION';
const GENRE_LENS_ANCHOR_RESOLUTION = 'GENRE_LENS_ANCHOR';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function list(values) {
  const source = Array.isArray(values) ? values : values == null ? [] : [values];
  return [...new Set(source.map(text).filter(Boolean))];
}

function pick(...values) {
  for (const value of values) {
    const normalized = text(value);
    if (normalized) return normalized;
  }
  return null;
}

function domainPrimary(domain) {
  if (!domain || typeof domain !== 'object') return {};
  if (domain.primary && typeof domain.primary === 'object') return domain.primary;
  return domain;
}

function validGenreRoot(value) {
  const normalized = text(value);
  return /^G(?:0[1-9]|[12][0-9]|3[0-8])$/u.test(normalized) ? normalized : null;
}

function pathDepth(pathKey) {
  return text(pathKey).split('/').map((part) => part.trim()).filter(Boolean).length;
}

function resolveClassification(domain = {}) {
  const primary = domainPrimary(domain);
  const genreRoot = validGenreRoot(primary.id || domain.id);
  const pathKey = pick(primary.path_key, domain.path_key);
  const pathResolution = pick(primary.path_resolution, domain.path_resolution);
  const classificationSource = pick(primary.classification_source, domain.classification_source);
  const representativeLensAnchor = pathResolution === GENRE_LENS_ANCHOR_RESOLUTION;
  const pathMatchesRoot = Boolean(genreRoot && pathKey && (pathKey === genreRoot || pathKey.startsWith(`${genreRoot}/`)));
  const originalClassificationResolved = Boolean(
    genreRoot &&
    pathKey &&
    pathDepth(pathKey) >= 4 &&
    pathMatchesRoot &&
    pathResolution === ORIGINAL_CLASSIFICATION_RESOLUTION &&
    classificationSource === ORIGINAL_CLASSIFICATION_SOURCE
  );

  let state = 'NOT_PROVIDED';
  if (originalClassificationResolved) state = 'RESOLVED';
  else if (genreRoot || pathKey || pathResolution || classificationSource) state = 'CLASSIFICATION_UNRESOLVED';

  return {
    genre_root: genreRoot,
    path_key: pathKey,
    path_resolution: pathResolution,
    classification_source: classificationSource,
    representative_lens_anchor: representativeLensAnchor,
    original_classification_resolved: originalClassificationResolved,
    state
  };
}

function resolveSubjectAxis({ request = {}, task = {}, subject = {} } = {}) {
  const descriptors = list([
    subject.kind,
    subject.type,
    subject.artifact_kind,
    subject.object_kind,
    request.subject_kind,
    request.artifact_kind,
    request.object_kind,
    task.subject_kind,
    task.artifact_kind,
    task.object_kind
  ]);

  return {
    target: pick(subject.name, subject.target, request.target, task.target, request.objective, task.objective),
    descriptors
  };
}

function resolveOperation({ request = {}, task = {} } = {}) {
  return pick(request.operation, request.action, task.operation, task.action);
}

function resolveContext({ request = {}, task = {}, context = {} } = {}) {
  return {
    jurisdiction: pick(context.jurisdiction, request.jurisdiction, task.jurisdiction),
    lifecycle: pick(context.lifecycle, request.lifecycle, task.lifecycle),
    stakeholder: pick(context.stakeholder, request.stakeholder, task.stakeholder),
    version: pick(context.version, request.version, task.version),
    time_scope: pick(context.time_scope, request.time_scope, task.time_scope),
    constraints: list([
      ...(Array.isArray(context.constraints) ? context.constraints : []),
      ...(Array.isArray(request.constraints) ? request.constraints : []),
      ...(Array.isArray(task.constraints) ? task.constraints : [])
    ])
  };
}

function resolveUniversalSemantics(request = {}) {
  return {
    objective: pick(request.objective),
    conditions: list(request.conditions),
    prohibitions: list(request.prohibitions),
    observations: list(request.observations),
    unresolved_items: list(request.unresolved_items),
    acceptance_criteria: list(request.acceptance_criteria),
    evidence_requirement: pick(request.evidence_requirement)
  };
}

function normalizeEvidenceUnits(values) {
  return list((Array.isArray(values) ? values : []).map((value) => {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return '';
    return value.unit_id || value.id || '';
  }));
}

function stableSignature({ classification, subjectAxis, operation, contextAxis, evidenceUnits }) {
  return [
    classification.genre_root || '-',
    classification.state,
    classification.path_key || '-',
    subjectAxis.target || '-',
    subjectAxis.descriptors.join(','),
    operation || '-',
    contextAxis.jurisdiction || '-',
    contextAxis.lifecycle || '-',
    contextAxis.stakeholder || '-',
    contextAxis.version || '-',
    contextAxis.time_scope || '-',
    evidenceUnits.join(',')
  ].join('|');
}

/**
 * Compose the independent axes needed before judgment-material sufficiency can be evaluated.
 *
 * This function intentionally does not infer the original v4 four-level taxonomy from a
 * Genre Lens representative anchor. The original classification dataset/resolver must be
 * the authority that supplies ORIGINAL_DOMAIN_CLASSIFICATION + ASTERA_V4_DOMAIN_CLASSIFICATION.
 * Likewise, artifact/object descriptors are carried as open semantics, not a supported-document whitelist.
 */
function composeJudgmentMaterialBasis({
  request = {},
  task = {},
  domain = {},
  subject = {},
  context = {},
  evidence_units = []
} = {}) {
  const classification = resolveClassification(domain);
  const subjectAxis = resolveSubjectAxis({ request, task, subject });
  const operation = resolveOperation({ request, task });
  const contextAxis = resolveContext({ request, task, context });
  const universal = resolveUniversalSemantics(request);
  const evidenceUnits = normalizeEvidenceUnits(evidence_units);

  const missingAxes = [];
  if (!classification.original_classification_resolved) missingAxes.push('original_domain_classification');
  if (!subjectAxis.target && subjectAxis.descriptors.length === 0) missingAxes.push('subject_or_artifact_semantics');
  if (!operation) missingAxes.push('judgment_operation');

  const status = classification.state === 'CLASSIFICATION_UNRESOLVED'
    ? 'CLASSIFICATION_UNRESOLVED'
    : missingAxes.length
      ? 'MATERIAL_BASIS_PARTIAL'
      : 'COMPLETE';

  const result = {
    contract: CONTRACT_VERSION,
    status,
    universal_semantics: universal,
    judgment_operation: operation,
    domain_classification: classification,
    subject_or_artifact: subjectAxis,
    decision_context: contextAxis,
    evidence_search_units: evidenceUnits,
    missing_axes: missingAxes
  };

  return {
    ...result,
    basis_signature: stableSignature({
      classification,
      subjectAxis,
      operation,
      contextAxis,
      evidenceUnits
    })
  };
}

module.exports = {
  CONTRACT_VERSION,
  ORIGINAL_CLASSIFICATION_SOURCE,
  ORIGINAL_CLASSIFICATION_RESOLUTION,
  GENRE_LENS_ANCHOR_RESOLUTION,
  composeJudgmentMaterialBasis,
  resolveClassification
};
