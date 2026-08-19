'use strict';

const KaguraEngine = require('./kagura-engine');
const { routeDomainTemplates } = require('./domain-template-router');
const { analyzeRequest } = require('./input-understanding');
const { normalizeEvidencePacket, deriveEvidenceNeed, unique } = require('./judgment-materials-analyzer');

const FIVE_STAGE = Object.freeze(['fact', 'risk', 'multi', 'inquiry', 'compare']);

function notRequiredEvidence(taskId) {
  return { schema_version: 'astera.evidence-search.result.v1', status: 'NOT_REQUIRED', task_id: taskId, evidence: [], coverage: { discovery_scope_state: 'NOT_REQUIRED' }, quality: { final: { status: 'NOT_REQUIRED', score_bp: null } }, provider_execution: { initial: [], reinforcement: [] }, ai_used: false, payment_executed: false };
}

function taskRouteText(task) {
  return unique([task.target || '', ...(task.premises || []), task.source_span?.text || '']).join('\n');
}

function aggregateTaskResults(taskResults) {
  const facts = {
    pillar: 'fact',
    confirmed: taskResults.flatMap((r) => (r.facts.confirmed || []).map((item) => ({ task_id: r.task.id, ...item }))),
    unconfirmed: taskResults.flatMap((r) => (r.facts.unconfirmed || []).map((item) => ({ task_id: r.task.id, ...item }))),
    opinions: taskResults.flatMap((r) => (r.facts.opinions || []).map((item) => ({ task_id: r.task.id, ...item }))),
    not_applicable: taskResults.flatMap((r) => (r.facts.not_applicable || []).map((item) => ({ task_id: r.task.id, ...item }))),
    evidence_need: taskResults.flatMap((r) => (r.facts.evidence_need || []).map((item) => ({ task_id: r.task.id, ...item }))),
    evidence_state: taskResults.length === 1 ? taskResults[0].facts.evidence_state : { state: 'PER_TASK', per_task: Object.fromEntries(taskResults.map((r) => [r.task.id, r.facts.evidence_state])) },
    per_task: Object.fromEntries(taskResults.map((r) => [r.task.id, r.facts]))
  };
  const allRisks = taskResults.flatMap((r) => (r.risks.risks || []).map((item) => ({ task_id: r.task.id, ...item }))).sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key));
  const riskWeight = allRisks.reduce((sum, item) => sum + Number(item.weight || 0), 0);
  const risks = {
    pillar: 'risk', risk_count: allRisks.length, risks: allRisks, highest: allRisks[0] || null,
    level: riskWeight >= 55 ? 'high' : riskWeight >= 20 ? 'medium' : 'low',
    safety_gates: unique(taskResults.flatMap((r) => r.risks.safety_gates || [])),
    domain_checks: taskResults.flatMap((r) => r.risks.domain_checks || []),
    per_task: Object.fromEntries(taskResults.map((r) => [r.task.id, r.risks]))
  };
  const inquiry = {
    pillar: 'inquiry',
    problem_health: { healthy: taskResults.every((r) => r.inquiry.problem_health?.healthy), reason: taskResults.filter((r) => !r.inquiry.problem_health?.healthy).map((r) => `${r.task.id}:${r.inquiry.problem_health?.reason}`).join(' / ') || 'All task premises remain traceable.' },
    missing_fields: unique(taskResults.flatMap((r) => (r.inquiry.missing_fields || []).map((item) => `${r.task.id}:${item}`))),
    missing_questions: unique(taskResults.flatMap((r) => r.inquiry.missing_questions || [])),
    per_task: Object.fromEntries(taskResults.map((r) => [r.task.id, r.inquiry]))
  };
  const multi = {
    pillar: 'multi',
    per_task: Object.fromEntries(taskResults.map((r) => [r.task.id, r.multi])),
    perspectives: taskResults.flatMap((r) => (r.multi.perspectives || []).map((item) => ({ task_id: r.task.id, ...item }))),
    trade_off_map: taskResults.flatMap((r) => (r.multi.trade_off_map || []).map((item) => ({ task_id: r.task.id, ...item })))
  };
  const dialectic = {
    pillar: 'dialectic', engine: 'Astera Deterministic Dialectic', mode: 'decision_materials',
    per_task: Object.fromEntries(taskResults.map((r) => [r.task.id, r.dialectic])),
    candidates: taskResults.flatMap((r) => (r.dialectic.candidates || []).map((item) => ({ task_id: r.task.id, ...item }))),
    bad_hand_lessons: unique(taskResults.flatMap((r) => r.dialectic.bad_hand_lessons || []))
  };
  const taskComparisons = taskResults.map((r) => ({ task_id: r.task.id, ...r.comparison }));
  const bottleneck = [...taskComparisons].sort((a, b) => a.score - b.score || a.task_id.localeCompare(b.task_id))[0] || null;
  const decisions = taskComparisons.map((c) => c.verdict?.decision).filter(Boolean);
  let globalDecision = 'recommend';
  if (decisions.includes('hold_and_clarify')) globalDecision = 'hold_and_clarify';
  else if (decisions.includes('recommend_with_caution')) globalDecision = 'recommend_with_caution';
  const comparison = {
    pillar: 'compare', score: bottleneck?.score || 0, answer_line_distance: 100 - (bottleneck?.score || 0),
    score_model: { aggregation: 'MIN_TASK_SCORE_BOTTLENECK', reason: 'A weak task cannot be averaged away.' },
    score_breakdown: taskComparisons.map((c) => ({ task_id: c.task_id, score: c.score, decision: c.verdict?.decision, breakdown: c.score_breakdown })),
    contradictions: taskComparisons.flatMap((c) => (c.contradictions || []).map((item) => ({ task_id: c.task_id, ...item }))),
    selected_candidate: bottleneck?.selected_candidate ? { task_id: bottleneck.task_id, ...bottleneck.selected_candidate } : null,
    candidate_ranking: taskComparisons.flatMap((c) => (c.candidate_ranking || []).map((item) => ({ task_id: c.task_id, ...item }))),
    rejected_candidates: taskComparisons.flatMap((c) => (c.rejected_candidates || []).map((item) => ({ task_id: c.task_id, ...item }))),
    uncertainty: { per_task: Object.fromEntries(taskComparisons.map((c) => [c.task_id, c.uncertainty || {}])), bottleneck_task_id: bottleneck?.task_id || null },
    per_task: Object.fromEntries(taskResults.map((r) => [r.task.id, r.comparison])),
    verdict: { decision: globalDecision, angle: bottleneck?.verdict?.angle || 'task_graph', reason: `MIN_TASK_SCORE_BOTTLENECK=${bottleneck?.task_id || '-'}:${bottleneck?.score || 0}`, objective: 'Satisfy the full Analysis Task Graph under evidence, dependency, and hard-constraint gates.' }
  };
  return { facts, risks, inquiry, multi, dialectic, comparison };
}

class CanonicalAsteraEngine extends KaguraEngine {
  prepareRequest(input = {}) {
    return analyzeRequest(input);
  }

  async process(input = {}, tenant = { id: 'unknown' }) {
    const question = String(input.question || '').trim();
    const context = String(input.context || '').trim();
    const request = input.preparedRequest?.analysis_task_packet ? input.preparedRequest : this.prepareRequest({ question, context, language: input.language, locale: input.locale, output_language: input.output_language });
    const requestedOutput = String(request.output_language || request.language || input.output_language || input.language || 'und');
    const renderLang = requestedOutput.split('-')[0] === 'ja' ? 'ja' : 'en';
    if (!question) return super.process(input, tenant);
    const packet = request.analysis_task_packet;
    if (!packet?.tasks?.length) return super.process(input, tenant);

    const tasks = packet.tasks.map((baseTask) => {
      const domain = routeDomainTemplates({ question: taskRouteText(baseTask), context });
      const evidenceNeed = deriveEvidenceNeed(baseTask, domain);
      return { ...baseTask, evidence_need: evidenceNeed, domain };
    });
    request.analysis_task_packet = { ...packet, tasks, execution_waves: packet.execution_waves };

    const taskEvidence = input.taskEvidencePackets || input.task_evidence_packets || {};
    const globalEvidence = input.evidencePacket || input.evidence_packet || null;
    const completed = new Map();
    const taskById = new Map(tasks.map((task) => [task.id, task]));

    for (const wave of packet.execution_waves) {
      const runnable = wave.map((id) => taskById.get(id)).filter(Boolean);
      const waveResults = await Promise.all(runnable.map(async (task) => {
        let evidenceRaw = task.evidence_need.required ? (taskEvidence[task.id] || (tasks.length === 1 ? globalEvidence : null)) : notRequiredEvidence(task.id);
        if (!evidenceRaw && globalEvidence && tasks.length > 1 && input.allow_shared_legacy_evidence === true) evidenceRaw = globalEvidence;
        const evidence = normalizeEvidencePacket(evidenceRaw);
        const dependencyState = Object.fromEntries((task.depends_on || []).map((id) => [id, completed.get(id)?.comparison?.verdict || { decision: 'missing' }]));
        const pre = await this.pool.exec('inquiry', { mode: 'preflight', question: task.source_span.text, human_text: question, moodAnswers: input.moodAnswers || {}, domain: task.domain, task, evidence_packet: evidenceRaw });
        const [facts, risks, inquiry] = await Promise.all([
          this.pool.exec('fact', { question: task.source_span.text, domain: task.domain, task, evidence_packet: evidenceRaw }),
          this.pool.exec('risk', { question: task.source_span.text, domain: task.domain, task, evidence_packet: evidenceRaw }),
          this.pool.exec('inquiry', { mode: 'analysis', question: task.source_span.text, human_text: question, moodAnswers: input.moodAnswers || {}, domain: task.domain, task, evidence_packet: evidenceRaw })
        ]);
        const multi = await this.pool.exec('multi', { question: task.source_span.text, facts, risks, inquiry, domain: task.domain, task, evidence_packet: evidenceRaw });
        const dialectic = await this.pool.exec('dialectic', { question: task.source_span.text, facts, risks, inquiry, multi, domain: task.domain, task, evidence_packet: evidenceRaw, mood: pre.mood, human: inquiry.human_reading || pre.human_reading || {} });
        const comparison = await this.pool.exec('compare', { question: task.source_span.text, facts, risks, multi, inquiry, dialectic, domain: task.domain, task, evidence_packet: evidenceRaw, mood: pre.mood, dependency_state: dependencyState });
        return { task, evidence, preflight: pre, facts, risks, inquiry, multi, dialectic, comparison };
      }));
      for (const result of waveResults) completed.set(result.task.id, result);
    }

    const taskResults = tasks.map((task) => completed.get(task.id)).filter(Boolean);
    const aggregate = aggregateTaskResults(taskResults);
    const judgment = this.frame({ request, context, taskResults, aggregate, lang: renderLang });
    judgment.requested_output_language = requestedOutput;
    judgment.localization = {
      requested_language: requestedOutput,
      rendered_language: renderLang,
      status: ['ja', 'en'].includes(requestedOutput.split('-')[0]) ? 'NATIVE_CANONICAL_RENDER' : 'EXTERNAL_LOCALIZATION_REQUIRED'
    };
    const material = this.material(judgment);
    const fiveStage = {
      schema_version: 'astera.five-stage.v1', order: [...FIVE_STAGE], execution_waves: packet.execution_waves,
      tasks: taskResults.map((r) => ({ task_id: r.task.id, lens_id: r.task.domain.primary?.id || null, evidence_state: r.evidence.state, fact: r.facts, risk: r.risks, multi: r.multi, inquiry: r.inquiry, compare: r.comparison, dialectic: r.dialectic }))
    };
    const result = {
      type: 'cognitive_map', mode: 'deterministic_multi_parallel_decision_materials', non_ai: true,
      request_model: request, instruction_understanding: request.instruction_understanding || null, analysis_task_packet: request.analysis_task_packet, five_stage: fiveStage,
      task_results: taskResults.map((r) => ({ task: r.task, evidence: r.evidence, preflight: r.preflight, facts: r.facts, risks: r.risks, inquiry: r.inquiry, multi: r.multi, dialectic: r.dialectic, comparison: r.comparison })),
      facts: aggregate.facts, risks: aggregate.risks, multi: aggregate.multi, inquiry: aggregate.inquiry,
      hyperion: { engine: 'Astera Deterministic Dialectic', mode: 'decision_materials', dialectic: aggregate.dialectic }, comparison: aggregate.comparison, judgment
    };
    this.logger.write({ tenantId: tenant.id, type: 'process_completed', text: `Decision graph completed: ${aggregate.comparison.verdict.decision}`, payload: { task_count: tasks.length, wave_count: packet.execution_waves.length, bottleneck_score: aggregate.comparison.score, decision: aggregate.comparison.verdict.decision, non_ai: true, input_language: request.language, input_script: request.script } });
    return { result, material, prompt: this.externalBrief(judgment), runtime: { ai_used: false, llm_called: false, engine: 'v8_canonical_global_rules', task_count: tasks.length, wave_count: packet.execution_waves.length, input_language: request.language, input_script: request.script, requested_output_language: requestedOutput, localization: judgment.localization } };
  }
}

module.exports = CanonicalAsteraEngine;
