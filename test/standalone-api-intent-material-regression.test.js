'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  detectAnalysisIntent,
  observeDocumentMaterial,
  ensureStandaloneDecisionMaterialRequest
} = require('../src/runtime/standalone-material-normalizer');

const POST = `低スペックPCで大規模AIを動かす候補をまとめた投稿です。

- Colibrì: GLM-5.2 744Bを25GB RAMの普通のPCで動かし、専門家層をディスクからストリーミングする純C製エンジン。
- FreeToken: MoEモデルに特化し、8GBのノートPC GPUで35Bモデル、ワークステーションでは753BのGLM-5.2を単一GPUで動作させる。
- bitnet.cpp: Microsoftが公開した1-bit LLM推論フレームワークで、x86 CPUで最大6.17倍の高速化を実現する。
- Exo: Mac、PC、Raspberry Piなど複数デバイスをクラスター化してLLaMAやMistralを分散実行する。
- Tiiny AI Pocket Lab: 120Bをオフライン実行し、12-core ARM、80GB RAM、190 TOPS NPUを搭載する。
- BMASS: 4GB RAMの古いノートPCを8GB USBから起動し、Alpine + Qwen3 0.6Bを利用する。
- Kimari Local AI: GTX 1060 6GBでローカルLLMを動かし、Open WebUIと統合する。
- PowerInfer: consumer GPU向け推論で、RTX 4090上で平均13.20 tokens/sを示す。
`;

function weakPrepared(question) {
  return {
    original_question: question,
    normalized_question: question,
    target: '',
    action: 'analyze',
    objective: 'かける',
    instruction_understanding: {
      mode: 'DEEP_PATH',
      parser: 'Deterministic-Japanese-Parser-MCP',
      overall_status: 'PARTIAL',
      blocked_reasons: ['NO_EXECUTABLE_ACTION']
    },
    analysis_task_packet: {
      tasks: [],
      dependencies: [],
      execution_waves: [],
      constraints: [],
      prohibitions: [],
      preserve: [],
      replace: [],
      verification: [],
      completion_criteria: [],
      unresolved: ['parser_overall_status:PARTIAL'],
      conflicts: [{ type: 'PARSER_MATERIAL_ONLY_TENSION', note: 'NO_EXECUTABLE_ACTION' }],
      hard_blockers: ['NO_EXECUTABLE_ACTION'],
      source_spans: []
    }
  };
}

test('standalone API auto-detects review from explicit instruction without App purpose', () => {
  const observable = observeDocumentMaterial(`この投稿をレビューしろ\n${POST}`);
  const intent = detectAnalysisIntent(`この投稿をレビューしろ\n${POST}`, observable);
  assert.equal(intent.mode, 'review');
  assert.equal(intent.source, 'EXPLICIT_INPUT');
  assert.match(intent.purpose, /レビュー/);
});

test('standalone API infers review-material purpose from multi-candidate verifiable post', () => {
  const observable = observeDocumentMaterial(POST);
  const intent = detectAnalysisIntent(POST, observable);
  assert.equal(intent.mode, 'review');
  assert.equal(intent.source, 'OBSERVABLE_MATERIAL');
  assert.ok(observable.candidate_count >= 8, `candidate_count=${observable.candidate_count}`);
  assert.ok(observable.claim_count > 0, `claim_count=${observable.claim_count}`);
  for (const expected of ['Colibrì', 'FreeToken', 'bitnet.cpp', 'Exo', 'Tiiny AI Pocket Lab', 'BMASS', 'Kimari Local AI', 'PowerInfer']) {
    assert.ok(observable.candidates.includes(expected), `missing candidate ${expected}`);
  }
  const claims = observable.claim_texts.join('\n');
  for (const expected of ['744B', '25GB RAM', '8GB', '6.17倍', '120B', '4GB RAM', '13.20 tokens/s']) {
    assert.match(claims, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'), `missing claim signal ${expected}`);
  }
});

test('NO_EXECUTABLE_ACTION does not erase observable document material', () => {
  const prepared = ensureStandaloneDecisionMaterialRequest(weakPrepared(POST), { question: POST });
  assert.equal(prepared.analysis_task_packet.analysis_intent.mode, 'review');
  assert.equal(prepared.analysis_task_packet.observable_material.candidate_count, 8);
  assert.ok(prepared.analysis_task_packet.observable_material.claim_count > 0);
  assert.ok(prepared.analysis_task_packet.hard_blockers.includes('NO_EXECUTABLE_ACTION'));
  assert.equal(prepared.analysis_task_packet.tasks.length, 1);
  const task = prepared.analysis_task_packet.tasks[0];
  assert.equal(task.material_only, true);
  assert.equal(task.action, 'analyze');
  assert.equal(task.source_span.text, POST);
  assert.equal(task.observable_material.candidate_count, 8);
  assert.match(task.purpose, /レビュー/);
  assert.notEqual(task.purpose, 'かける');
  assert.deepEqual(prepared.analysis_task_packet.execution_waves, [[task.id]]);
});

test('observable risks are case-specific and comparison material is structural', () => {
  const observable = observeDocumentMaterial(POST);
  const riskCodes = observable.risks.map((risk) => risk.code);
  assert.ok(riskCodes.includes('PROJECT_EXISTENCE_UNVERIFIED'));
  assert.ok(riskCodes.includes('MODEL_SIZE_CLAIM_UNVERIFIED'));
  assert.ok(riskCodes.includes('RUNNABLE_VS_PRACTICAL_CONFUSION'));
  assert.ok(riskCodes.includes('BENCHMARK_CONTEXT_MISSING'));
  assert.ok(observable.dimensions.includes('メモリ要件'));
  assert.ok(observable.dimensions.includes('モデル規模'));
  assert.ok(observable.dimensions.includes('性能・Benchmark条件'));
});
