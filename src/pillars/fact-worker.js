'use strict';

const {
  splitSentences,
  matchingEvidence,
  normalizeEvidencePacket,
  analyzeRequest,
  unique
} = require('../judgment-materials-analyzer');

function isOpinion(sentence) {
  return /思う|感じ|たぶん|多分|予測|推測|かも|見込み|期待|should|maybe|probably|I think|we think/i.test(sentence);
}

function evidenceRef(match) {
  return {
    id: match.item.id,
    claim: match.item.claim,
    source_role: match.item.source_role,
    source_id: match.item.source_id,
    authority_id: match.item.authority_id,
    url: match.item.url,
    updated_at: match.item.updated_at,
    version: match.item.version,
    overlap: Number(match.overlap.toFixed(3))
  };
}

function factInputs(task, question) {
  const premises = Array.isArray(task?.premises) ? task.premises : [];
  if (premises.length) return unique(premises.flatMap((item) => splitSentences(item)));
  if (!task || !['instruction', 'verification', 'decision', 'prohibition', 'preserve', 'correction'].includes(task.clause_type)) {
    return splitSentences(question);
  }
  return [];
}

async function run({ question = '', domain = {}, task = null, evidence_packet = null }) {
  const request = task || analyzeRequest({ question, domain });
  const evidence = normalizeEvidencePacket(evidence_packet);
  const sentences = factInputs(task, question);
  const confirmed = [];
  const unconfirmed = [];
  const opinions = [];
  const notApplicable = [];
  const warnings = [];

  for (const sentence of sentences) {
    if (isOpinion(sentence)) {
      opinions.push({ text: sentence, confidence: 0.5, status: 'OPINION' });
      continue;
    }
    const matches = matchingEvidence(sentence, evidence);
    const verifiedMatches = matches.filter((entry) =>
      evidence.state === 'VALID'
      && ['PRIMARY', 'OFFICIAL'].includes(entry.item.source_role)
      && (entry.item.replayable || entry.item.source_id)
    );
    if (verifiedMatches.length) {
      confirmed.push({
        text: sentence,
        confidence: Math.min(0.99, 0.75 + verifiedMatches[0].overlap * 0.2),
        status: 'EVIDENCE_SUPPORTED',
        evidence: verifiedMatches.slice(0, 3).map(evidenceRef)
      });
    } else if (matches.length && evidence.state === 'REJECTED') {
      unconfirmed.push({ text: sentence, status: 'EVIDENCE_REJECTED', reason: '対応する根拠候補はあるがEvidence Search品質Gateを通過していない。', evidence: matches.slice(0, 3).map(evidenceRef) });
    } else if (matches.length && evidence.conflict_detected) {
      unconfirmed.push({ text: sentence, status: 'SOURCE_CONFLICT', reason: '対応するSource間のConflictが未解消のため事実へ昇格しない。', evidence: matches.slice(0, 3).map(evidenceRef) });
    } else {
      unconfirmed.push({
        text: sentence,
        status: evidence.state === 'NOT_PROVIDED' || evidence.state === 'NOT_REQUIRED' ? 'INPUT_CLAIM' : 'UNRESOLVED',
        reason: evidence.state === 'NOT_PROVIDED' || evidence.state === 'NOT_REQUIRED'
          ? '入力由来の主張。外部根拠で確認されていないため事実へ昇格しない。'
          : '対応する有効な根拠が不足しているため未確認として保持する。'
      });
    }
  }

  if (!sentences.length) notApplicable.push({ text: task?.source_span?.text || question, reason: 'このAnalysis Task自体は命令・操作条件であり、独立した事実命題として扱わない。' });
  if (evidence.provider_failures.length) warnings.push(`Evidence provider failure=${evidence.provider_failures.length}`);
  if (evidence.conflict_detected) warnings.push('Evidence source conflict detected');
  if (evidence.state === 'REJECTED') warnings.push(`Evidence quality rejected: ${evidence.source_status}`);

  const domainEvidence = Array.isArray(domain.primary?.evidence_to_collect) ? domain.primary.evidence_to_collect : [];
  const unresolvedClaims = unconfirmed.map((item) => item.text).slice(0, 8);
  const evidenceGaps = unique([...(task?.evidence_need?.required ? domainEvidence : []), ...unresolvedClaims])
    .map((item) => ({ item, reason: '判断前に根拠または明示前提が必要。' }));

  return {
    pillar: 'fact',
    task_id: task?.id || null,
    rule_ids: ['FACT-001-NO-INFERENCE-AS-FACT', 'FACT-002-EVIDENCE-GATE', 'FACT-003-SOURCE-CONFLICT-HOLD'],
    confirmed,
    unconfirmed,
    opinions,
    not_applicable: notApplicable,
    evidence_need: evidenceGaps,
    evidence_gaps: evidenceGaps,
    evidence_state: {
      state: evidence.state,
      source_status: evidence.source_status,
      quality_score_bp: evidence.quality_score_bp,
      coverage_state: evidence.coverage_state,
      conflict_detected: evidence.conflict_detected
    },
    warnings,
    confidence: confirmed.length ? Math.min(0.98, 0.55 + confirmed.length * 0.08) : (unconfirmed.length ? 0.35 : 0.5),
    domain_template: domain.primary ? { id: domain.primary.id, name: domain.primary.name, evidence_to_collect: domainEvidence } : null,
    request_model: { target: request.target, action: request.action, objective: request.objective },
    summary: `根拠支持${confirmed.length} / 未確認${unconfirmed.length} / 意見${opinions.length} / Evidence=${evidence.state}`
  };
}

module.exports = { run };
