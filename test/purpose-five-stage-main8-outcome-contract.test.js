'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const AsteraEngine = require('../src/astera-engine');
const { defaultMockJapaneseParserClient } = require('./helpers/default-mock-japanese-parser');

const silentLogger = { write() {}, async flush() {} };

function textOf(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function includesAny(value, needles) {
  const text = textOf(value);
  return needles.some((needle) => text.includes(needle));
}

test('purpose -> five parallel stages -> Main8 returns usable judgment material, not structure-only output', async () => {
  const engine = new AsteraEngine({
    japaneseParserClient: defaultMockJapaneseParserClient(),
    evidenceSearchClient: null,
    logger: silentLogger,
    poolSize: 5
  });

  const question = [
    '来週金曜までにFAQへ新しい問い合わせ例を追加するための判断材料を整理して。',
    '公開済みの返金ポリシー文言は変えない。法務確認はまだ終わっていない。',
    'A案は問い合わせ例を3件追加、B案は10件追加。',
    'A案とB案を作業時間と法務リスクと利用者理解で比較して。',
    '最終判断や推奨はしないで。'
  ].join('');

  try {
    const out = await engine.process({ question, language: 'ja' }, { id: 'purpose-five-stage-main8-contract' });
    const failures = [];
    const result = out?.result || {};
    const judgment = result.judgment || {};
    const packet = result.analysis_task_packet || {};
    const five = result.five_stage || {};
    const aggregate = {
      facts: result.facts,
      risks: result.risks,
      multi: result.multi,
      inquiry: result.inquiry,
      comparison: result.comparison
    };

    if (result.type !== 'cognitive_map') failures.push(`result.type=${result.type || '-'}`);

    const purposeText = textOf(judgment['01_purpose']);
    if (!includesAny(purposeText, ['FAQ', '問い合わせ例'])) failures.push('01_purpose lost the user goal');
    if (!includesAny(purposeText, ['追加', '判断材料'])) failures.push('01_purpose does not preserve the intended outcome');

    const premiseText = textOf(judgment['02_premise']);
    if (!includesAny(premiseText, ['返金ポリシー', '変えない', '維持'])) failures.push('02_premise lost the preserve constraint');
    if (!includesAny(premiseText, ['来週金曜', '期限'])) failures.push('02_premise lost the deadline');
    if (!includesAny(premiseText, ['法務確認', '未'])) failures.push('02_premise lost the unresolved legal condition');

    assert.deepEqual(five.order, ['fact', 'risk', 'multi', 'inquiry', 'compare']);

    for (const lane of ['facts', 'risks', 'multi', 'inquiry', 'comparison']) {
      if (!aggregate[lane] || !textOf(aggregate[lane]).replace(/[{}\[\]",:]/g, '').trim()) failures.push(`${lane} aggregate lane is empty`);
    }
    if (!includesAny(aggregate.risks, ['法務', '返金', '禁止', '未確認', '変更'])) failures.push('risk lane has no case-specific risk material');
    if ((aggregate.multi?.perspectives || []).length < 2) failures.push('multi lane has insufficient perspectives');
    if (!((aggregate.inquiry?.open_items || []).length || (aggregate.inquiry?.missing_questions || []).length || (aggregate.inquiry?.missing_fields || []).length)) {
      failures.push('inquiry lane does not expose unresolved/missing material');
    }
    if (!includesAny(aggregate.comparison, ['A案']) || !includesAny(aggregate.comparison, ['B案'])) failures.push('compare lane lost comparison candidates');
    if (!includesAny(aggregate.comparison, ['作業時間']) || !includesAny(aggregate.comparison, ['法務リスク']) || !includesAny(aggregate.comparison, ['利用者理解'])) {
      failures.push('compare lane lost explicit comparison dimensions');
    }

    if (!Array.isArray(judgment.order) || judgment.order.length !== 8) failures.push(`Main8 section count=${judgment.order?.length || 0}`);
    if ((String(out?.material?.text || '').match(/^---$/gm) || []).length !== 7) failures.push('Main8 rendering does not contain seven separators');

    const factsText = textOf(judgment['03_facts']);
    if (!includesAny(factsText, ['A案', 'B案', 'FAQ', '返金ポリシー'])) failures.push('03_facts has no request-specific factual material');
    const crisisText = textOf(judgment['04_crisis']);
    if (!includesAny(crisisText, ['法務', '返金', '禁止', '未確認', '変更'])) failures.push('04_crisis is generic instead of case-specific');
    const oppositionText = textOf(judgment['05_opposition']);
    if (!oppositionText || oppositionText.length < 40) failures.push('05_opposition lacks usable opposing-view material');
    const comparisonText = textOf(judgment['06_comparison']);
    if (!includesAny(comparisonText, ['A案']) || !includesAny(comparisonText, ['B案'])) failures.push('06_comparison lost candidate material');
    if (!includesAny(comparisonText, ['作業時間']) || !includesAny(comparisonText, ['法務リスク']) || !includesAny(comparisonText, ['利用者理解'])) failures.push('06_comparison lost comparison axes');
    const evidenceText = textOf(judgment['07_evidence_status']);
    if (!includesAny(evidenceText, ['UNDETERMINED', 'NOT_EXECUTED', 'REJECTED', 'CONFIRMED'])) failures.push('07_evidence_status does not expose evidence/claim state');
    const reinstructionText = textOf(judgment['08_reinstruction']);
    if (!includesAny(reinstructionText, ['返金ポリシー', '変えない', '維持'])) failures.push('08_reinstruction lost the preserve constraint');
    if (!includesAny(reinstructionText, ['最終', 'Recommendation', '推奨', '採用'])) failures.push('08_reinstruction lost the no-final-decision boundary');

    const taskIds = new Set((packet.tasks || []).map((item) => item.id));
    for (const key of judgment.order || []) {
      const ids = judgment[key]?.decision_basis?.task_ids || [];
      if (!ids.length || !ids.every((id) => taskIds.has(id))) failures.push(`${key} lacks valid purpose/task trace`);
    }

    const resultTrace = textOf({
      five_stage: five,
      task_results: result.task_results,
      comparison: result.comparison,
      judgment
    });
    if (result.no_normative_decision_generated !== true) failures.push('normative decision boundary is not enforced');
    if (!resultTrace.includes('A案') || !resultTrace.includes('B案')) failures.push('purpose-to-result material is not traceable to the user input');
    if (!resultTrace.includes('返金ポリシー')) failures.push('purpose-to-result material lost the preserve constraint');

    assert.deepEqual(failures, [], failures.join('\n'));
  } finally {
    await engine.destroy();
  }
});
