'use strict';

const assert = require('node:assert/strict');
const { buildInitialJudgmentMaterial } = require('../src/runtime/initial-material-fast-path');

const WARMUP = 50;
const SAMPLES = 500;
const ENGINEERING_P95_MS = 100;
const BASIC_P99_MS = 1000;

const CASES = Object.freeze([
  {
    question: 'A案とB案の比較材料を出せ。最終判断はするな。',
    context: '本番は変更せず、未確認事項を断定しない。',
    language: 'ja',
    output_language: 'ja'
  },
  {
    question: 'Node.jsの現行仕様を公式根拠で検証し、Riskと反対視点を判断材料として整理しろ。',
    context: '根拠がない事項は未確定のまま保持する。',
    language: 'ja',
    output_language: 'ja'
  },
  {
    question: 'Compare option A versus option B and preserve all explicit constraints without making the final decision.',
    context: 'Use official and current evidence later; do not invent missing facts.',
    language: 'en',
    output_language: 'en'
  },
  {
    question: '低スペックPCで大規模AIを動かす候補。Colibri 744B 25GB RAM、FreeToken 35B 8GB GPU、PowerInfer 13.20 tokens/s。',
    context: '初期判断材料だけを即時生成し、外部未確認事項を確定しない。',
    language: 'ja',
    output_language: 'ja'
  }
]);

function percentile(sorted, ratio) {
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
}

function runOne(index) {
  const base = CASES[index % CASES.length];
  const started = process.hrtime.bigint();
  const out = buildInitialJudgmentMaterial({
    ...base,
    question: `${base.question} case=${index}`
  }, { id: 'performance-hard-gate' });
  const wallMs = Number(process.hrtime.bigint() - started) / 1e6;
  assert.equal(out.result.phase, 'INITIAL_FAST_PATH');
  assert.equal(out.runtime.external_network_wait, false);
  assert.equal(out.runtime.japanese_parser_used, false);
  assert.equal(out.runtime.evidence_search_used, false);
  return wallMs;
}

for (let i = 0; i < WARMUP; i += 1) runOne(i);

const samples = [];
for (let i = 0; i < SAMPLES; i += 1) samples.push(runOne(i));
samples.sort((a, b) => a - b);

const p50 = percentile(samples, 0.50);
const p95 = percentile(samples, 0.95);
const p99 = percentile(samples, 0.99);
const max = samples[samples.length - 1];

console.log(`FAST_PATH_PERFORMANCE_SAMPLES=${SAMPLES}`);
console.log(`FAST_PATH_P50_MS=${p50.toFixed(3)}`);
console.log(`FAST_PATH_P95_MS=${p95.toFixed(3)}`);
console.log(`FAST_PATH_P99_MS=${p99.toFixed(3)}`);
console.log(`FAST_PATH_MAX_MS=${max.toFixed(3)}`);
console.log(`FAST_PATH_ENGINEERING_P95_LIMIT_MS=${ENGINEERING_P95_MS}`);
console.log(`FAST_PATH_BASIC_P99_LIMIT_MS=${BASIC_P99_MS}`);

assert.ok(p95 < ENGINEERING_P95_MS, `FAST_PATH_PERFORMANCE_GATE_FAILED: p95=${p95.toFixed(3)}ms >= ${ENGINEERING_P95_MS}ms`);
assert.ok(p99 < BASIC_P99_MS, `FAST_PATH_BASIC_GATE_FAILED: p99=${p99.toFixed(3)}ms >= ${BASIC_P99_MS}ms`);

console.log('FAST_PATH_PERFORMANCE_HARD_GATE=PASS');
