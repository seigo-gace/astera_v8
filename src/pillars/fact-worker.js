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
    canonical_record_id: match.item.canonical_record_id,
    claim: match.item.claim,
    source_role: match.item.source_role,
    source_family_id: match.item.source_family_id,
    source_id: match.item.source_id,
    provider_id: match.item.provider_id,
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

function independentCorroboration(matches = []) {
  const seen = new Set();
  const selected = [];
  for (const match of matches) {
    const identity = match.item.source_family_id || match.item.authority_id || match.item.source_id || match.item.id;
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    selected.push(match);
  }
  return selected;
}

function confidenceFromEvidence(evidence, matches, authoritative) {
  const score = Number(evidence.quality_score_bp || 0) / 100;
  const overlap = Number(matches[0]?.overlap || 0) * 100;
  const base = authoritative ? 76 : 70;
  return Math.min(0.99, Math.max(0.5, (base + score * 0.15 + overlap * 0.09) / 100));
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
  const corroboratingEvidence = [];

  for (const sentence of sentences) {
    if (isOpinion(sentence)) {
      opinions.push({ text: sentence, confidence: 0.5, status: 'OPINION' });
      continue;
    }

    const matches = matchingEvidence(sentence, evidence);
    const usable = evidence.state === 'VALID'
      ? matches.filter((entry) => entry.item.replayable || entry.item.source_id)
      : [];
    const authoritative = usable.filter((entry) => ['PRIMARY', 'OFFICIAL'].includes(entry.item.source_role));
    const secondary = independentCorroboration(usable.filter((entry) => !['PRIMARY', 'OFFICIAL'].includes(entry.item.source_role)));

    if (authoritative.length) {
      confirmed.push({
        text: sentence,
        confidence: confidenceFromEvidence(evidence, authoritative, true),
        status: 'AUTHORITATIVE_EVIDENCE_SUPPORTED',
        evidence: authoritative.slice(0, 3).map(evidenceRef),
        corroboration: secondary.slice(0, 3).map(evidenceRef)
      });
      corroboratingEvidence.push(...secondary.slice(0, 3).map((entry) => ({ claim: sentence, ...evidenceRef(entry) })));
      continue;
    }

    if (secondary.length >= 2) {
      confirmed.push({
        text: sentence,
        confidence: confidenceFromEvidence(evidence, secondary, false),
        status: 'INDEPENDENT_CORROBORATION_SUPPORTED',
        evidence: secondary.slice(0, 4).map(evidenceRef),
        corroboration: secondary.slice(0, 4).map(evidenceRef)
      });
      corroboratingEvidence.push(...secondary.slice(0, 4).map((entry) => ({ claim: sentence, ...evidenceRef(entry) })));
    } else if (usable.length) {
      unconfirmed.push({
        text: sentence,
        status: 'INSUFFICIENT_SOURCE_AUTHORITY',
        reason: 'Evidence Packet自体はVALIDだが、この命題を支えるAuthorityまたは独立Corroborationが不足している。',
        evidence: usable.slice(0, 3).map(evidenceRef)
      });
    } else if (matches.length && evidence.state === 'REJECTED') {
      unconfirmed.push({ text: sentence, status: 'EVIDENCE_REJECTED', reason: `対応する根拠候補はあるがEvidence Search品質Gateを通過していない。${(evidence.eligibility_reasons || []).join(' / ')}`, evidence: matches.slice(0, 3).map(evidenceRef) });
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
  if (evidence.state === 'REJECTED') warnings.push(`Evidence quality rejected: ${evidence.source_status} / ${(evidence.eligibility_reasons || []).join(',')}`);

  const domainEvidence = Array.isArray(domain.primary?.evidence_to_collect) ? domain.primary.evidence_to_collect : [];
  const unresolvedClaims = unconfirmed.map((item) => item.text).slice(0, 8);
  const evidenceGaps = unique([...(task?.evidence_need?.required ? domainEvidence : []), ...unresolvedClaims])
    .map((item) => ({ item, reason: '判断前に根拠または明示前提が必要。' }));

  return {
    pillar: 'fact',
    task_id: task?.id || null,
    rule_ids: ['FACT-001-NO-INFERENCE-AS-FACT', 'FACT-002-EVIDENCE-GATE', 'FACT-003-SOURCE-CONFLICT-HOLD', 'FACT-004-AUTHORITY-OR-INDEPENDENT-CORROBORATION'],
    confirmed,
    unconfirmed,
    opinions,
    not_applicable: notApplicable,
    corroborating_evidence: corroboratingEvidence,
    evidence_need: evidenceGaps,
    evidence_gaps: evidenceGaps,
    evidence_state: {
      state: evidence.state,
      source_status: evidence.source_status,
      eligibility_reasons: evidence.eligibility_reasons || [],
      quality_score_bp: evidence.quality_score_bp,
      quality_gate_bp: evidence.quality_gate_bp,
      coverage_state: evidence.coverage_state,
      conflict_detected: evidence.conflict_detected,
      role_counts: evidence.role_counts || {},
      distinct_authority_count: evidence.distinct_authority_count || 0,
      distinct_source_family_count: evidence.distinct_source_family_count || 0,
      reinforcement_attempt_count: evidence.reinforcement_attempt_count || 0,
      new_corroboration_count: evidence.new_corroboration_count || 0
    },
    warnings,
    confidence: confirmed.length ? Math.min(0.99, Math.max(...confirmed.map((item) => item.confidence || 0.5))) : (unconfirmed.length ? 0.35 : 0.5),
    domain_template: domain.primary ? { id: domain.primary.id, name: domain.primary.name, evidence_to_collect: domainEvidence } : null,
    request_model: { target: request.target, action: request.action, objective: request.objective },
    summary: `根拠支持${confirmed.length} / 未確認${unconfirmed.length} / 意見${opinions.length} / Corroboration=${corroboratingEvidence.length} / Evidence=${evidence.state}`
  };
}

module.exports = { run };
