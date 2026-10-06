'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderFiveLaneMain8 } = require('../src/runtime/five-lane-main8-material-renderer');

const ROOT = path.join(__dirname, '..');

function source(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

test('public final path keeps five-stage authority before Main8', () => {
  const engine = source('src/astera-engine.js');
  const renderer = source('src/runtime/five-lane-main8-material-renderer.js');

  assert.doesNotMatch(engine, /normalizeMultiJudgmentPublicMaterial/);
  assert.doesNotMatch(engine, /observable\.candidates|observable\.risks|observableFactItems/);
  assert.match(engine, /projectFiveLaneMaterialToMain8/);
  assert.match(engine, /renderFiveLaneMain8\(judgment, super\.material\(judgment\)\)/);
  assert.doesNotMatch(renderer, /renderUnifiedMain8|case_model|observable_material/);
});

test('five-lane Main8 renderer cannot synthesize a section without canonical five-stage base material', () => {
  assert.throws(
    () => renderFiveLaneMain8({ output_language: 'ja' }),
    /FIVE_LANE_MAIN8_BASE_REQUIRED/
  );
});

test('renderer only appends five-stage projected fields to already-built Main8', () => {
  const labels = [
    ['01_purpose', '01 本当の目的'],
    ['02_premise', '02 前提不足'],
    ['03_facts', '03 事実確認'],
    ['04_crisis', '04 危機察知'],
    ['05_opposition', '05 反対視点'],
    ['06_comparison', '06 比較案'],
    ['07_evidence_status', '07 根拠成立状態'],
    ['08_reinstruction', '08 主役AI／利用者への再指示']
  ];
  const base = {
    text: '',
    compact_text: '',
    sections: labels.map(([key, label]) => ({ key, label, text: `${key}:FIVE_STAGE_BASE` }))
  };
  const judgment = {
    output_language: 'ja',
    '03_facts': { fact_requirements: ['FACT_LANE_SENTINEL'] },
    '04_crisis': { risk_requirements: ['RISK_LANE_SENTINEL'] },
    '05_opposition': { domain_perspectives: ['MULTI_LANE_SENTINEL'] },
    '06_comparison': { five_lane_dimensions: ['COMPARE_LANE_SENTINEL'] },
    '07_evidence_status': { evidence_requirements: ['EVIDENCE_LANE_SENTINEL'] },
    '08_reinstruction': { inquiry_requirements: ['INQUIRY_LANE_SENTINEL'] },
    case_model: { request_text: 'CASE_MODEL_BYPASS_SENTINEL' },
    observable_material: { claim_texts: ['OBSERVABLE_BYPASS_SENTINEL'] }
  };
  const rendered = renderFiveLaneMain8(judgment, base);

  assert.match(rendered.text, /FACT_LANE_SENTINEL/);
  assert.match(rendered.text, /RISK_LANE_SENTINEL/);
  assert.match(rendered.text, /MULTI_LANE_SENTINEL/);
  assert.match(rendered.text, /COMPARE_LANE_SENTINEL/);
  assert.match(rendered.text, /EVIDENCE_LANE_SENTINEL/);
  assert.match(rendered.text, /INQUIRY_LANE_SENTINEL/);
  assert.doesNotMatch(rendered.text, /CASE_MODEL_BYPASS_SENTINEL|OBSERVABLE_BYPASS_SENTINEL/);
});