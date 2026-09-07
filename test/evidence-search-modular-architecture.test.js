'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  LEVEL_ORDER,
  loadAndValidate,
  validateArchitecture
} = require('../scripts/validate-evidence-modular-architecture');

const ARCHITECTURE_PATH = path.join(
  __dirname,
  '..',
  'src',
  'evidence-search',
  'architecture.v1.json'
);

test('five-level modular architecture skill validates the evidence-search module', () => {
  const result = loadAndValidate(ARCHITECTURE_PATH);
  assert.equal(result.valid, true);
  assert.deepEqual(Object.keys(result.level_counts), LEVEL_ORDER);
  assert.equal(result.external_connection_count, 1);
  assert.equal(
    result.application_system_id,
    'application-system.astera-evidence-search'
  );
  assert.ok(result.element_count >= 15);
  assert.equal(result.element_count, result.capability_count);
});

test('module exposes only one physical connection method', () => {
  const createEvidenceSearchModule = require('../src/evidence-search');
  const module = createEvidenceSearchModule();
  assert.deepEqual(Object.keys(module), ['execute']);
});

test('five logical levels are not represented as physical layer directories', () => {
  const root = path.join(__dirname, '..', 'src', 'evidence-search');
  const forbidden = new Set([
    'part',
    'parts',
    'feature',
    'features',
    'component',
    'components',
    'system',
    'systems',
    'application',
    'applications',
    'application-system',
    'application-systems'
  ]);
  const directories = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name.toLowerCase());
  assert.deepEqual(directories.filter((name) => forbidden.has(name)), []);
});

test('skill rejects duplicate capability ownership', () => {
  const architecture = JSON.parse(fs.readFileSync(ARCHITECTURE_PATH, 'utf8'));
  architecture.elements[1].capabilities = [
    architecture.elements[0].capabilities[0]
  ];
  assert.throws(
    () => validateArchitecture(architecture),
    (error) => error.code === 'ARCHITECTURE_CAPABILITY_DUPLICATE_OWNER'
  );
});

test('skill rejects upward dependency and dependency cycles', () => {
  const upward = JSON.parse(fs.readFileSync(ARCHITECTURE_PATH, 'utf8'));
  upward.elements.find((element) => element.level === 'PART').depends_on = [
    'application-system.astera-evidence-search'
  ];
  assert.throws(
    () => validateArchitecture(upward),
    (error) => [
      'ARCHITECTURE_PART_DEPENDENCY_FORBIDDEN',
      'ARCHITECTURE_DEPENDENCY_DIRECTION_INVALID'
    ].includes(error.code)
  );

  const cycle = JSON.parse(fs.readFileSync(ARCHITECTURE_PATH, 'utf8'));
  const queryPlan = cycle.elements.find((element) => element.id === 'feature.query-plan');
  const freeSelection = cycle.elements.find(
    (element) => element.id === 'feature.free-provider-selection'
  );
  queryPlan.depends_on.push(freeSelection.id);
  freeSelection.depends_on.push(queryPlan.id);
  assert.throws(
    () => validateArchitecture(cycle),
    (error) => error.code === 'ARCHITECTURE_CYCLE'
  );
});
