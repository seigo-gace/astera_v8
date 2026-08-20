'use strict';

const { detectMood } = require('../mood-detector');
const { readHumanState } = require('../hyperion-human-reader');
const { unique } = require('../canonical-v4-core');

async function run({ mode = 'analysis', question = '', human_text = '', moodAnswers = {}, domain = {}, task = null, canonical_claim_records = [] } = {}) {
  const t = task || { id: null, target: null, action: 'analyze', objective: question, completion_criteria: [], constraints: [], prohibitions: [], preserve: [], replace: [], conditions: [], exceptions: [], depends_on: [], unresolved: [], hard_blockers: [] };
  const humanInput = human_text || question;
  const mood = detectMood(humanInput, moodAnswers);
  const human = readHumanState(humanInput, mood, moodAnswers);
  const own = canonical_claim_records.filter((record) => record.task_id === t.id);
  const missing = unique([
    ...(!t.target || /UNRESOLVED|input target|入力対象/i.test(String(t.target)) ? ['target'] : []),
    ...((t.unresolved || []).map((item) => `unresolved:${item}`)),
    ...((t.hard_blockers || []).map((item) => `hard_blocker:${item}`)),
    ...own.filter((record) => record.status === 'UNDETERMINED').map((record) => `claim:${record.claim_id}:${(record.undetermined_reasons || []).join(',')}`)
  ]);
  const questions = unique([
    ...missing.map((item) => `未解決=${item}`),
    ...(domain.primary?.inquiry_lens || [])
  ]);
  if (mode === 'preflight') {
    return {
      pillar: 'inquiry', stage: 'preflight', task_id: t.id || null,
      clarification_needed: false,
      questions: [],
      unresolved: missing,
      hard_blockers: unique(t.hard_blockers || []),
      mood, human_reading: human,
      rule: '不足・曖昧・Hard Blockerを無言で埋めず、UNDETERMINED/未解決として保持する。'
    };
  }
  return {
    pillar: 'inquiry', task_id: t.id || null,
    problem_health: { healthy: missing.length === 0, reason: missing.length ? `未解決=${missing.join(' / ')}` : '明示されたTask契約とClaim状態を追跡可能' },
    missing_fields: missing,
    missing_questions: questions,
    hard_blockers: unique(t.hard_blockers || []),
    assumptions: [],
    extracted: { target: t.target, action: t.action, objective: t.objective, success_criteria: t.completion_criteria || t.success_criteria || [], constraints: t.constraints || [], prohibitions: t.prohibitions || [], preserve: t.preserve || [], replace: t.replace || [], conditions: t.conditions || [], exceptions: t.exceptions || [], dependencies: t.depends_on || [] },
    inquiry_lens: domain.primary?.inquiry_lens || [], mood, human_reading: human,
    authority: { owns: ['unresolved_projection'], does_not_own: ['guess_fill', 'recommendation', 'selection', 'decision'] }
  };
}

module.exports = { run };
