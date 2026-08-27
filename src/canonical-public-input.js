'use strict';

const ALLOWED_PUBLIC_FIELDS = Object.freeze([
  'question',
  'context',
  'language',
  'locale',
  'output_language',
  'moodAnswers'
]);

const INTERNAL_TRUST_FIELDS = Object.freeze([
  'preparedRequest',
  'prepared_request',
  'evidencePacket',
  'evidence_packet',
  'taskEvidencePackets',
  'task_evidence_packets',
  'canonicalClaimRecordsByTask',
  'canonical_claim_records_by_task'
]);

const allowedSet = new Set(ALLOWED_PUBLIC_FIELDS);
const internalSet = new Set(INTERNAL_TRUST_FIELDS);

function inputError(code, message, fields = []) {
  const error = new Error(message);
  error.code = code;
  error.status = 400;
  error.fields = [...fields];
  return error;
}

function sanitizePublicDecisionInput(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw inputError('INVALID_DECISION_INPUT', 'decision-materials input must be a JSON object');
  }

  const keys = Object.keys(input);
  const internal = keys.filter((key) => internalSet.has(key));
  if (internal.length) {
    throw inputError(
      'UNTRUSTED_CANONICAL_INPUT_FIELD',
      `caller-controlled canonical/evidence fields are forbidden: ${internal.sort().join(', ')}`,
      internal
    );
  }

  const unsupported = keys.filter((key) => !allowedSet.has(key));
  if (unsupported.length) {
    throw inputError(
      'UNSUPPORTED_DECISION_INPUT_FIELD',
      `unsupported decision-materials input fields: ${unsupported.sort().join(', ')}`,
      unsupported
    );
  }

  if (input.moodAnswers !== undefined && (!input.moodAnswers || typeof input.moodAnswers !== 'object' || Array.isArray(input.moodAnswers))) {
    throw inputError('INVALID_MOOD_ANSWERS', 'moodAnswers must be a JSON object when provided', ['moodAnswers']);
  }

  const sanitized = {};
  for (const field of ALLOWED_PUBLIC_FIELDS) {
    if (input[field] !== undefined) sanitized[field] = input[field];
  }
  return sanitized;
}

module.exports = {
  ALLOWED_PUBLIC_FIELDS,
  INTERNAL_TRUST_FIELDS,
  sanitizePublicDecisionInput
};
