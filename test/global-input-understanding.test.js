'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeRequest, detectLanguageMetadata } = require('../src/input-understanding');

const samples = [
  { text: 'تحقق من حالة النظام الحالية ثم اشرح المخاطر.', language: 'ar', script: 'Arab' },
  { text: 'Проверь текущее состояние системы и сохрани ограничения.', language: 'ru', script: 'Cyrl' },
  { text: 'वर्तमान सिस्टम की स्थिति जाँचें और सीमाएँ बनाए रखें।', language: 'hi', script: 'Deva' },
  { text: '현재 시스템 상태를 확인하고 제약 조건을 유지하세요.', language: 'ko', script: 'Hang' },
  { text: 'Ελέγξτε την τρέχουσα κατάσταση του συστήματος.', language: 'el', script: 'Grek' },
  { text: 'Verifica el estado actual del sistema y conserva las restricciones.', language: 'es', script: 'Latn' }
];

for (const sample of samples) {
  test(`global adapter preserves ${sample.language}/${sample.script}`, () => {
    const result = analyzeRequest({ question: sample.text, language: sample.language, output_language: sample.language });
    assert.equal(result.language, sample.language);
    assert.equal(result.script, sample.script);
    assert.equal(result.output_language, sample.language);
    assert.equal(result.instruction_understanding.adapter, 'generic-unicode-fallback');
    assert.equal(result.instruction_understanding.semantic_resolution, 'limited');
    assert.ok(result.analysis_task_packet.tasks.length >= 1);
    assert.equal(result.analysis_task_packet.source_spans[0].text, sample.text);
    assert.ok(result.analysis_task_packet.unresolved.some((item) => item.includes('language_semantics')));
  });
}

test('Japanese uses builtin adapter instead of global fallback', () => {
  const result = analyzeRequest({ question: 'APIの現状を検証して。', language: 'ja' });
  assert.equal(result.instruction_understanding.adapter, 'builtin-ja');
  assert.ok(['Hira', 'Kana', 'Hani'].includes(result.script));
  assert.ok(result.scripts.includes('Hira'));
  assert.ok(result.scripts.includes('Hani'));
});

test('high-confidence English can be inferred without forcing all Latin text to English', () => {
  assert.equal(detectLanguageMetadata('Please verify the current API and compare the evidence.').language, 'en');
  assert.equal(detectLanguageMetadata('Verifica el estado actual del sistema.').language, 'und');
});

test('Han-only text is not guessed as Japanese or Chinese without explicit language', () => {
  const meta = detectLanguageMetadata('確認現状');
  assert.equal(meta.language, 'und');
  assert.ok(meta.scripts.includes('Hani'));
});

test('generic adapter preserves source order conservatively', () => {
  const result = analyzeRequest({ question: 'Primero revisa esto. Después revisa aquello.', language: 'es' });
  assert.equal(result.analysis_task_packet.tasks.length, 2);
  assert.deepEqual(result.analysis_task_packet.execution_waves, [['T01'], ['T02']]);
  assert.deepEqual(result.analysis_task_packet.tasks[1].depends_on, ['T01']);
});
