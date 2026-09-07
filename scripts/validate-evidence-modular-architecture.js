'use strict';

const fs = require('node:fs');
const path = require('node:path');

const LEVEL_ORDER = Object.freeze([
  'PART',
  'FEATURE',
  'COMPONENT',
  'SYSTEM',
  'APPLICATION_SYSTEM'
]);

function fail(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  throw error;
}

function nonEmptyString(value, field, elementId) {
  if (typeof value !== 'string' || !value.trim()) {
    fail('ARCHITECTURE_FIELD_REQUIRED', `${elementId}.${field} must be a non-empty string`);
  }
}

function nonEmptyStringArray(value, field, elementId, allowEmpty = false) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    fail('ARCHITECTURE_FIELD_REQUIRED', `${elementId}.${field} must be ${allowEmpty ? 'an' : 'a non-empty'} array`);
  }
  const seen = new Set();
  for (const item of value) {
    nonEmptyString(item, field, elementId);
    if (seen.has(item)) {
      fail('ARCHITECTURE_DUPLICATE_VALUE', `${elementId}.${field} contains duplicate value: ${item}`);
    }
    seen.add(item);
  }
}

function validateCycles(elementsById) {
  const state = new Map();
  const stack = [];

  function visit(id) {
    const current = state.get(id) || 0;
    if (current === 2) return;
    if (current === 1) {
      const cycleStart = stack.indexOf(id);
      fail(
        'ARCHITECTURE_CYCLE',
        `dependency cycle detected: ${[...stack.slice(cycleStart), id].join(' -> ')}`
      );
    }

    state.set(id, 1);
    stack.push(id);
    for (const dependencyId of elementsById.get(id).depends_on) visit(dependencyId);
    stack.pop();
    state.set(id, 2);
  }

  for (const id of elementsById.keys()) visit(id);
}

function collectReachable(applicationId, elementsById) {
  const reachable = new Set();
  const pending = [applicationId];
  while (pending.length) {
    const id = pending.pop();
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const dependencyId of elementsById.get(id).depends_on) pending.push(dependencyId);
  }
  return reachable;
}

function validateArchitecture(architecture) {
  if (!architecture || typeof architecture !== 'object' || Array.isArray(architecture)) {
    fail('ARCHITECTURE_INVALID', 'architecture must be an object');
  }
  if (architecture.schema_version !== 'astera.modular-architecture.v1') {
    fail('ARCHITECTURE_SCHEMA_UNSUPPORTED', 'unsupported architecture schema_version');
  }
  if (JSON.stringify(architecture.level_order) !== JSON.stringify(LEVEL_ORDER)) {
    fail(
      'ARCHITECTURE_LEVEL_ORDER_INVALID',
      `level_order must be ${LEVEL_ORDER.join(' -> ')}`
    );
  }
  if (architecture.physical_directory_mapping_forbidden !== true) {
    fail(
      'ARCHITECTURE_PHYSICAL_LAYER_MAPPING_FORBIDDEN',
      'five logical levels must not be mapped to physical directory levels'
    );
  }
  if (
    architecture.external_connection?.count !== 1
    || architecture.external_connection?.entrypoint !== 'src/evidence-search/index.js'
    || architecture.external_connection?.method !== 'execute'
  ) {
    fail(
      'ARCHITECTURE_CONNECTION_INVALID',
      'evidence-search must expose exactly src/evidence-search/index.js#execute'
    );
  }

  const elements = architecture.elements;
  if (!Array.isArray(elements) || elements.length === 0) {
    fail('ARCHITECTURE_ELEMENTS_REQUIRED', 'architecture.elements must not be empty');
  }

  const elementsById = new Map();
  const capabilityOwners = new Map();
  const levelCounts = new Map(LEVEL_ORDER.map((level) => [level, 0]));

  for (const element of elements) {
    if (!element || typeof element !== 'object' || Array.isArray(element)) {
      fail('ARCHITECTURE_ELEMENT_INVALID', 'each architecture element must be an object');
    }

    nonEmptyString(element.id, 'id', 'element');
    if (elementsById.has(element.id)) {
      fail('ARCHITECTURE_DUPLICATE_ELEMENT', `duplicate element id: ${element.id}`);
    }
    if (!LEVEL_ORDER.includes(element.level)) {
      fail('ARCHITECTURE_LEVEL_INVALID', `${element.id}.level is invalid: ${element.level}`);
    }
    nonEmptyString(element.responsibility, 'responsibility', element.id);
    nonEmptyStringArray(element.inputs, 'inputs', element.id);
    nonEmptyStringArray(element.outputs, 'outputs', element.id);
    nonEmptyStringArray(element.capabilities, 'capabilities', element.id);
    nonEmptyStringArray(element.depends_on, 'depends_on', element.id, true);

    if (element.level === 'PART' && element.depends_on.length !== 0) {
      fail('ARCHITECTURE_PART_DEPENDENCY_FORBIDDEN', `${element.id} PART must not depend on another element`);
    }
    if (element.level !== 'PART' && element.depends_on.length === 0) {
      fail('ARCHITECTURE_ORPHAN_ELEMENT', `${element.id} must declare at least one dependency`);
    }

    elementsById.set(element.id, element);
    levelCounts.set(element.level, levelCounts.get(element.level) + 1);

    for (const capability of element.capabilities) {
      const owner = capabilityOwners.get(capability);
      if (owner) {
        fail(
          'ARCHITECTURE_CAPABILITY_DUPLICATE_OWNER',
          `capability ${capability} is owned by both ${owner} and ${element.id}`
        );
      }
      capabilityOwners.set(capability, element.id);
    }
  }

  for (const level of LEVEL_ORDER) {
    if (levelCounts.get(level) === 0) {
      fail('ARCHITECTURE_LEVEL_EMPTY', `architecture level ${level} has no elements`);
    }
  }

  for (const element of elements) {
    const elementLevel = LEVEL_ORDER.indexOf(element.level);
    for (const dependencyId of element.depends_on) {
      const dependency = elementsById.get(dependencyId);
      if (!dependency) {
        fail(
          'ARCHITECTURE_DEPENDENCY_MISSING',
          `${element.id} depends on missing element ${dependencyId}`
        );
      }
      const dependencyLevel = LEVEL_ORDER.indexOf(dependency.level);
      if (dependencyLevel > elementLevel) {
        fail(
          'ARCHITECTURE_DEPENDENCY_DIRECTION_INVALID',
          `${element.id} (${element.level}) must not depend on higher level ${dependencyId} (${dependency.level})`
        );
      }
    }
  }

  validateCycles(elementsById);

  const applications = elements.filter((element) => element.level === 'APPLICATION_SYSTEM');
  if (applications.length !== 1) {
    fail(
      'ARCHITECTURE_APPLICATION_COUNT_INVALID',
      `exactly one APPLICATION_SYSTEM is required, found ${applications.length}`
    );
  }

  const reachable = collectReachable(applications[0].id, elementsById);
  const unreachable = elements.map((element) => element.id).filter((id) => !reachable.has(id));
  if (unreachable.length) {
    fail(
      'ARCHITECTURE_UNREACHABLE_ELEMENT',
      `elements are not connected to the application system: ${unreachable.join(', ')}`
    );
  }

  return Object.freeze({
    valid: true,
    architecture_id: architecture.architecture_id,
    architecture_version: architecture.architecture_version,
    external_connection_count: architecture.external_connection.count,
    element_count: elements.length,
    capability_count: capabilityOwners.size,
    level_counts: Object.freeze(Object.fromEntries(levelCounts)),
    application_system_id: applications[0].id
  });
}

function loadAndValidate(filePath = path.join(
  process.cwd(),
  'src',
  'evidence-search',
  'architecture.v1.json'
)) {
  const architecture = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return validateArchitecture(architecture);
}

if (require.main === module) {
  try {
    const result = loadAndValidate(process.argv[2]);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      valid: false,
      code: error.code || 'ARCHITECTURE_VALIDATION_FAILED',
      message: error.message,
      details: error.details || {}
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  LEVEL_ORDER,
  validateArchitecture,
  loadAndValidate
};
