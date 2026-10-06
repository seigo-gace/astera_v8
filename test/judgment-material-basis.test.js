'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ORIGINAL_CLASSIFICATION_SOURCE,
  ORIGINAL_CLASSIFICATION_RESOLUTION,
  composeJudgmentMaterialBasis,
  resolveClassification
} = require('../src/runtime/judgment-material-basis');

const REPRESENTATIVE_G25 = {
  primary: {
    id: 'G25',
    path_key: 'G25/G25-L04/G25-L04-M02/G25-L04-M02-S05',
    path_resolution: 'GENRE_LENS_ANCHOR'
  }
};

test('Genre Lens representative anchor is not accepted as the original four-level classification', () => {
  const classification = resolveClassification(REPRESENTATIVE_G25);
  assert.equal(classification.genre_root, 'G25');
  assert.equal(classification.representative_lens_anchor, true);
  assert.equal(classification.original_classification_resolved, false);
  assert.equal(classification.state, 'CLASSIFICATION_UNRESOLVED');
});

test('same top-level genre and operation still produce different material bases for different judged artifacts', () => {
  const common = {
    domain: REPRESENTATIVE_G25,
    request: { action: 'verify', objective: 'Review whether the supplied material is sufficient for a decision.' }
  };

  const machineDesign = composeJudgmentMaterialBasis({
    ...common,
    subject: { kind: 'machine_design_specification', name: 'gearbox design specification' },
    context: { lifecycle: 'design_review' }
  });

  const assemblyInstructions = composeJudgmentMaterialBasis({
    ...common,
    subject: { kind: 'assembly_instructions', name: 'scale model assembly instructions' },
    context: { lifecycle: 'assembly' }
  });

  assert.equal(machineDesign.domain_classification.genre_root, 'G25');
  assert.equal(assemblyInstructions.domain_classification.genre_root, 'G25');
  assert.equal(machineDesign.judgment_operation, assemblyInstructions.judgment_operation);
  assert.notDeepEqual(machineDesign.subject_or_artifact, assemblyInstructions.subject_or_artifact);
  assert.notEqual(machineDesign.basis_signature, assemblyInstructions.basis_signature);
  assert.equal(machineDesign.status, 'CLASSIFICATION_UNRESOLVED');
  assert.equal(assemblyInstructions.status, 'CLASSIFICATION_UNRESOLVED');
});

test('subject or artifact semantics are open descriptors rather than a supported-document whitelist', () => {
  const customArtifact = composeJudgmentMaterialBasis({
    request: { action: 'analyze' },
    subject: { kind: 'future_unknown_artifact_type', name: 'unseen artifact' }
  });

  assert.deepEqual(customArtifact.subject_or_artifact.descriptors, ['future_unknown_artifact_type']);
  assert.equal(customArtifact.subject_or_artifact.target, 'unseen artifact');
  assert.equal(customArtifact.missing_axes.includes('subject_or_artifact_semantics'), false);
});

test('Evidence Search units remain an independent axis from domain classification', () => {
  const input = {
    domain: REPRESENTATIVE_G25,
    request: { action: 'verify' },
    subject: { kind: 'machine_design_specification', name: 'pump design' }
  };

  const standards = composeJudgmentMaterialBasis({ ...input, evidence_units: ['G25-S01'] });
  const manufacturing = composeJudgmentMaterialBasis({ ...input, evidence_units: ['G25-S02'] });

  assert.equal(standards.domain_classification.genre_root, manufacturing.domain_classification.genre_root);
  assert.deepEqual(standards.evidence_search_units, ['G25-S01']);
  assert.deepEqual(manufacturing.evidence_search_units, ['G25-S02']);
  assert.notEqual(standards.basis_signature, manufacturing.basis_signature);
});

test('only an explicitly authoritative original classification can close the classification axis', () => {
  const domain = {
    primary: {
      id: 'G25',
      path_key: 'G25/L2/L3/L4',
      path_resolution: ORIGINAL_CLASSIFICATION_RESOLUTION,
      classification_source: ORIGINAL_CLASSIFICATION_SOURCE
    }
  };

  const basis = composeJudgmentMaterialBasis({
    domain,
    request: { action: 'verify' },
    subject: { kind: 'test_artifact', name: 'synthetic contract fixture' }
  });

  assert.equal(basis.domain_classification.original_classification_resolved, true);
  assert.equal(basis.domain_classification.state, 'RESOLVED');
  assert.equal(basis.status, 'COMPLETE');
});

test('a path-shaped value without original-classification authority remains unresolved', () => {
  const basis = composeJudgmentMaterialBasis({
    domain: {
      primary: {
        id: 'G11',
        path_key: 'G11/L2/L3/L4',
        path_resolution: ORIGINAL_CLASSIFICATION_RESOLUTION
      }
    },
    request: { action: 'analyze' },
    subject: { kind: 'financial_statement', name: 'annual financial statements' }
  });

  assert.equal(basis.domain_classification.original_classification_resolved, false);
  assert.equal(basis.status, 'CLASSIFICATION_UNRESOLVED');
  assert.ok(basis.missing_axes.includes('original_domain_classification'));
});
