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
  G30: ['評価Setと品質基準は？', 'Human Reviewと失敗時の停止条件は？'],
  G31: ['Asset・Trust Boundary・影響Versionは？', '悪用痕跡・Patch・隔離・復旧経路は？'],
  G34: ['現場に継続中の危険はある？', 'Evidenceの保全と通報経路は？'],
  G38: ['地域・季節・Space・Budgetは？', '手間と安全条件はどこまで許容できる？']
});

function domainQuestions(domain = {}) {
  const primary = domain.primary || {};
  return unique([
    ...(DOMAIN_QUESTIONS[primary.id] || []),
    ...(primary.inquiry_lens || [])
  ]).slice(0, 8);
}

async function run({ mode = 'analysis', question = '', moodAnswers = {}, domain = {}, task = null, evidence_packet = null }) {
  const mood = detectMood(question, moodAnswers);
  const human = readHumanState(question, mood, moodAnswers);
  const request = task || analyzeRequest({ question, domain });
  const evidence = normalizeEvidencePacket(evidence_packet);
  const text = String(question || '').trim();
  const tooShort = text.length < 4;
  const missingTarget = !request.target || request.target_confidence === 'low';
  const missingSuccess = request.success_criteria.length === 0;
  const missingEvidence = evidence.state !== 'VALID';
  const questions = [];

  if (tooShort) questions.push('何を対象に、何を達成したいか具体化してください。');
  if (missingTarget) questions.push('判断対象を具体化すると、どの対象・範囲になりますか？');
  if (missingSuccess) questions.push(`「${request.objective}」を完了と判定する具体的な合格条件は何ですか？`);
  if (missingEvidence && Array.isArray(domain.primary?.evidence_to_collect) && domain.primary.evidence_to_collect.length) {
    questions.push(`不足Evidence：${domain.primary.evidence_to_collect.slice(0, 3).join(' / ')}`);
  }
  questions.push(...domainQuestions(domain));
  const uniqueQuestions = unique(questions);

  if (mode === 'preflight') {
    const blocked = tooShort || (!request.target && request.action === 'analyze' && text.length < 12);
    return {
      pillar: 'inquiry',
      stage: 'preflight',
      clarification_needed: blocked,
      questions: blocked ? uniqueQuestions.slice(0, 5) : [],
      rule: '明確な依頼は止めない。不足は分析結果へ残し、推測で補完しない。',
      mood,
      human_reading: human,
      request_model: request,
      domain_template: domain.primary ? { id: domain.primary.id, name: domain.primary.name } : null
    };
  }

  const missing = [];
  if (missingTarget) missing.push('target');
  if (missingSuccess) missing.push('success_criteria');
  if (missingEvidence) missing.push('evidence');

  return {
    pillar: 'inquiry',
    problem_health: {
      healthy: !missingTarget && !missingSuccess,
      reason: missing.length ? `不足=${missing.join(',')}` : '対象と完了条件を判断材料として抽出できる'
    },
    missing_fields: missing,
    missing_questions: uniqueQuestions,
    assumptions: [
      '入力に明示されていない事実は未確認として扱う。',
      'Evidence Searchが未実行・Rejected・Partialの場合は根拠不足を保持する。',
      '変更禁止・維持条件・責務分離は推奨案より優先する。'
    ],
    extracted: {
      target: request.target,
      action: request.action,
      objective: request.objective,
      success_criteria: request.success_criteria,
      constraints: request.constraints
    },
    inquiry_lens: domain.primary?.inquiry_lens || [],
    mood,
    human_reading: human,
    evidence_state: evidence.state,
    domain_template: domain.primary ? {
      id: domain.primary.id,
      name: domain.primary.name,
      inquiry_lens: domain.primary.inquiry_lens || []
    } : null
  };
}

module.exports = { run };
