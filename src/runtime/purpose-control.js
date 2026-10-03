'use strict';

const { PURPOSE } = require('./standalone-material-normalizer');
const { attachMaterialRequirementGraph } = require('./material-requirement-graph');
const { refinePreparedMaterialRequirements } = require('./specialist-requirement-refiner');
const { bridgeMaterialRequirementsIntoFiveLanes } = require('./material-requirement-five-lane-bridge');

const PURPOSE_MODES = Object.freeze([
  'review',
  'compare',
  'verify',
  'improve',
  'research',
  'plan',
  'consider'
]);
const PURPOSE_MODE_SET = new Set(PURPOSE_MODES);

function invalidPurposeError() {
  const error = new Error(`purpose must be one of: ${PURPOSE_MODES.join(', ')}`);
  error.code = 'INVALID_PURPOSE';
  error.status = 400;
  return error;
}

function normalizePurposeMode(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw invalidPurposeError();
  const mode = value.trim().toLowerCase();
  if (!PURPOSE_MODE_SET.has(mode)) throw invalidPurposeError();
  return mode;
}

function explicitPurposeIntent(value) {
  const mode = normalizePurposeMode(value);
  if (!mode) return null;
  return Object.freeze({
    mode,
    source: 'EXPLICIT_PURPOSE_OVERRIDE',
    cue: mode,
    confidence: 'high',
    purpose: PURPOSE[mode]
  });
}

function overrideMaterialTask(task, intent) {
  if (!task || task.material_only !== true || task.observable_material?.source !== 'ORIGINAL_QUESTION') return task;
  return {
    ...task,
    objective: intent.purpose,
    purpose: intent.purpose,
    user_goal: intent.purpose,
    analysis_intent: intent,
    field_provenance: {
      ...(task.field_provenance || {}),
      purpose: [{ source: intent.source, cue: intent.cue }]
    }
  };
}

function detectedIntent(prepared, packet) {
  return prepared?.standalone_api_intent
    || prepared?.instruction_understanding?.analysis_intent
    || packet?.analysis_intent
    || null;
}

function preserveDetectedSingleCasePurpose(prepared) {
  if (!prepared || typeof prepared !== 'object') return prepared;
  const packet = prepared.analysis_task_packet && typeof prepared.analysis_task_packet === 'object'
    ? prepared.analysis_task_packet
    : null;
  if (!packet || packet.case_model?.multi_judgment === true || Number(packet.case_model?.request_count || 0) > 1) return prepared;
  const intent = detectedIntent(prepared, packet);
  const purpose = String(intent?.purpose || '').trim();
  if (!purpose) return prepared;
  const nextPacket = { ...packet, user_goal: purpose, analysis_intent: intent };
  return {
    ...prepared,
    objective: purpose,
    user_goal: purpose,
    analysis_task_packet: nextPacket,
    instruction_understanding: {
      ...(prepared.instruction_understanding || {}),
      analysis_intent: intent
    },
    standalone_api_intent: prepared.standalone_api_intent || intent
  };
}

function attachAndRefine(prepared) {
  const refined = refinePreparedMaterialRequirements(attachMaterialRequirementGraph(prepared));
  return bridgeMaterialRequirementsIntoFiveLanes(refined);
}

function applyExplicitPurposeControl(prepared, value) {
  const intent = explicitPurposeIntent(value);
  if (!intent) return attachAndRefine(preserveDetectedSingleCasePurpose(prepared));
  if (!prepared || typeof prepared !== 'object') return prepared;

  const packet = prepared.analysis_task_packet && typeof prepared.analysis_task_packet === 'object'
    ? prepared.analysis_task_packet
    : null;
  const nextPacket = packet
    ? {
      ...packet,
      tasks: Array.isArray(packet.tasks) ? packet.tasks.map((task) => overrideMaterialTask(task, intent)) : packet.tasks,
      user_goal: intent.purpose,
      analysis_intent: intent
    }
    : null;

  const controlled = {
    ...prepared,
    objective: intent.purpose,
    user_goal: intent.purpose,
    ...(nextPacket ? { analysis_task_packet: nextPacket } : {}),
    instruction_understanding: {
      ...(prepared.instruction_understanding || {}),
      analysis_intent: intent
    },
    standalone_api_intent: intent
  };
  return attachAndRefine(controlled);
}

module.exports = {
  PURPOSE_MODES,
  normalizePurposeMode,
  explicitPurposeIntent,
  applyExplicitPurposeControl
};
