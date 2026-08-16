'use strict';

const { detectMood } = require('../mood-detector');
const { readHumanState } = require('../hyperion-human-reader');
const { analyzeRequest, normalizeEvidencePacket, unique } = require('../judgment-materials-analyzer');

const DOMAIN_QUESTIONS = Object.freeze({
  G08: ['適用法域と期限は？', '契約・通知・Evidenceは揃っている？'],
  G10: ['成功指標・Budget・期限は？', '顧客Dataと競合Evidenceはある？'],
  G11: ['適用する会計・税務基準と法域は？', '返金・失効・未使用残高の条件は？'],
  G23: ['緊急のRed Flagはある？', '症状の経過・既往・現在の薬は？'],
  G29: ['互換条件・依存関係・Rollbackは？', 'Testと合格条件は何？'],
  G30: ['評価Setと品質基準は？', 'Human Reviewと失敗時停止条件は？'],
  G31: ['Asset・Trust Boundary・影響Versionは？', '悪用痕跡・Patch・隔離・復旧経路は？'],
  G34: ['現場に継続中の危険はある？', 'Evidenceの保全と通報経路は？'],
  G38: ['地域・季節・Space・Budgetは？', '手間と安全条件はどこまで許容できる？']
});

function domainQuestions(domain = {}) {
  const primary = domain.primary || {};
  return unique([...(DOMAIN_QUESTIONS[primary.id] || []), ...(primary.inquiry_lens || [])]).slice(0, 8);
}

async function run({ mode = 'analysis', question = '', human_text = '', moodAnswers = {}, domain = {}, task = null, evidence_packet = null }) {
  const humanInput = human_text || question;
  const mood = detectMood(humanInput, moodAnswers);
  const human = readHumanState(humanInput, mood, moodAnswers);
  const request = task || analyzeRequest({ question, domain });
  const evidence = normalizeEvidencePacket(evidence_packet);
  const text = String(task?.source_span?.text || question || '').trim();
  const tooShort = text.length < 3;
  const missingTarget = !request.target || request.unresolved?.includes?.('target') || request.target_confidence === 'low';
  const completion = task?.completion_criteria || request.success_criteria || [];
  const missingSuccess = completion.length === 0 && ['implement', 'improve', 'migrate', 'integrate', 'remove'].includes(request.action);
  const evidenceRequired = Boolean(task?.evidence_need?.required);
  const missingEvidence = evidenceRequired && evidence.state !== 'VALID';
  const unresolved = unique([...(task?.unresolved || []), ...(task?.conditions || []).length && !completion.length ? ['condition_without_completion'] : []]);
  const questions = [];
  if (tooShort) questions.push('何を対象に、何を達成したいか具体化が必要。');
  if (missingTarget) questions.push('判断対象・変更対象が一意に確定していない。');
  if (missingSuccess) questions.push(`Task ${task?.id || '-'} の完了・合格条件が未指定。`);
  if (missingEvidence) questions.push(`Task ${task?.id || '-'} はEvidenceが必要だがVALIDではない。`);
  if (unresolved.length) questions.push(`未解決=${unresolved.join(' / ')}`);
  questions.push(...domainQuestions(domain));
  const uniqueQuestions = unique(questions);

  if (mode === 'preflight') {
    const blocked = tooShort || (missingTarget && text.length < 12);
    return { pillar: 'inquiry', stage: 'preflight', task_id: task?.id || null, clarification_needed: blocked, questions: blocked ? uniqueQuestions.slice(0, 6) : [], rule: '明確なTaskは停止しない。不足・曖昧・Conflictは明示して後段Hard Gateへ渡し、推測で補完しない。', mood, human_reading: human, request_model: request, domain_template: domain.primary ? { id: domain.primary.id, name: domain.primary.name } : null };
  }

  const missing = [];
  if (missingTarget) missing.push('target');
  if (missingSuccess) missing.push('completion_criteria');
  if (missingEvidence) missing.push('evidence');
  missing.push(...unresolved);
  return {
    pillar: 'inquiry', task_id: task?.id || null, rule_ids: ['INQ-001-EXPLICIT-PREMISE', 'INQ-002-NO-GUESS-FILL', 'INQ-003-HARD-CONSTRAINT-FIRST'],
    problem_health: { healthy: missing.length === 0, reason: missing.length ? `不足=${unique(missing).join(',')}` : '対象・条件・Evidence要否を機械的に追跡可能' },
    missing_fields: unique(missing), missing_questions: uniqueQuestions,
    assumptions: ['入力に明示されていない事実は未確認として扱う。', '必要Evidenceが未実行・Rejected・Partialなら根拠不足を保持する。', '禁止・維持・依存・完了条件は推奨候補より優先する。'],
    extracted: {
      target: request.target, action: request.action, objective: request.objective,
      success_criteria: completion, constraints: task?.constraints || request.constraints || [], prohibitions: task?.prohibitions || [], preserve: task?.preserve || [], replace: task?.replace || [], conditions: task?.conditions || [], exceptions: task?.exceptions || [], dependencies: task?.depends_on || []
    },
    inquiry_lens: domain.primary?.inquiry_lens || [], mood, human_reading: human, evidence_state: evidence.state,
    domain_template: domain.primary ? { id: domain.primary.id, name: domain.primary.name, inquiry_lens: domain.primary.inquiry_lens || [] } : null
  };
}

module.exports = { run };
