'use strict';

const CanonicalAsteraEngine = require('./canonical-astera-engine');
const { resolveTaskEvidence } = require('./canonical-evidence-resolver');
const { createEvidenceSearchClient } = require('./evidence-search/api/runtime-client');
const { buildInitialJudgmentMaterial } = require('./runtime/initial-material-fast-path');
const {
  detectAnalysisIntent,
  observeDocumentMaterial,
  ensureStandaloneDecisionMaterialRequest
} = require('./runtime/standalone-material-normalizer');
const { recoverPartialParserMaterial } = require('./runtime/parser-partial-material-recovery');
const { renderUnifiedMain8 } = require('./runtime/unified-main8-material-renderer');
const { normalizeUnifiedMain8Material } = require('./runtime/main8-readability-normalizer');
const { attachEvidenceCitations } = require('./runtime/evidence-citation-material');
const {
  explicitPurposeIntent,
  applyExplicitPurposeControl
} = require('./runtime/purpose-control');

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function publicRecoveryUnresolvedItems(packet = {}, lang = 'ja') {
  const values = uniqueStrings([
    ...(packet.unresolved || []),
    ...(packet.tasks || []).flatMap((task) => task?.unresolved || [])
  ]);
  return values.filter((value) => {
    const text = String(value || '').trim();
    if (!text || text.length > 240) return false;
    if (/^(?:T\d+:|[A-Z0-9_.:-]{4,})$/u.test(text)) return false;
    if (/PARSER_|TASK_GRAPH|NO_EXECUTABLE_ACTION|SOURCE_ROLE|RECOVERED|FAIL_CLOSED|japanese_parser/i.test(text)) return false;
    return /(?:未確認|未完了|未成立|まだ|終わっていない|完了していない|確認していない|\bpending\b|\bincomplete\b|not\s+yet|\bunconfirmed\b)/iu.test(text);
  }).map((value) => `${lang === 'ja' ? '未確定条件' : 'Unresolved condition'}: ${value}`);
}

function throwIfRequestCancelled(signal) {
  if (!signal?.aborted) return;
  const error = new Error('Request cancelled');
  error.code = 'REQUEST_CANCELLED';
  error.status = 499;
  throw error;
}

class AsteraEngine extends CanonicalAsteraEngine {
  constructor(options = {}) {
    super(options);
    const explicitClient = Object.prototype.hasOwnProperty.call(options, 'evidenceSearchClient')
      ? options.evidenceSearchClient
      : undefined;
    this.evidenceSearchClient = explicitClient === undefined
      ? createEvidenceSearchClient({ logger: options.logger })
      : (explicitClient || null);
  }

  setEvidenceSearchClient(client) {
    this.evidenceSearchClient = client || null;
    return this;
  }

  async prepareRequest(input = {}) {
    const prepared = await super.prepareRequest(input);
    const normalized = ensureStandaloneDecisionMaterialRequest(prepared, input);
    const recovered = recoverPartialParserMaterial(normalized, input);
    return applyExplicitPurposeControl(recovered, input.purpose);
  }

  processInitial(input = {}, caller = { id: 'unknown' }) {
    const question = String(input.question || '');
    const observableMaterial = observeDocumentMaterial(question);
    const analysisIntent = explicitPurposeIntent(input.purpose)
      || detectAnalysisIntent(question, observableMaterial);
    const initial = buildInitialJudgmentMaterial(input, caller);
    if (!initial?.result || typeof initial.result !== 'object') return initial;
    const purposeOverrideUsed = analysisIntent.source === 'EXPLICIT_PURPOSE_OVERRIDE';
    return {
      ...initial,
      result: {
        ...initial.result,
        analysis_intent: analysisIntent,
        observable_material: observableMaterial
      },
      material: initial.material && typeof initial.material === 'object'
        ? { ...initial.material, analysis_intent: analysisIntent }
        : initial.material,
      runtime: initial.runtime && typeof initial.runtime === 'object'
        ? {
          ...initial.runtime,
          standalone_intent_auto_detected: !purposeOverrideUsed,
          purpose_override_used: purposeOverrideUsed
        }
        : initial.runtime
    };
  }

  frame(args = {}) {
    const judgment = super.frame(args);
    const request = args.request || {};
    const packet = request.analysis_task_packet || {};
    const observable = packet.observable_material || request.observable_material || null;
    const intent = packet.analysis_intent || request.standalone_api_intent || null;
    const next = { ...judgment };
    const outputLang = String(judgment.output_language || request.output_language || request.language || 'ja').split('-')[0] === 'ja' ? 'ja' : 'en';

    if (packet.parser_projection_recovery?.applied === true) {
      const premise = next['02_premise'];
      const unresolvedItems = publicRecoveryUnresolvedItems(packet, outputLang);
      if (premise && unresolvedItems.length) {
        const items = uniqueStrings([...(premise.items || []), ...unresolvedItems]);
        next['02_premise'] = { ...premise, items, summary: items.join(' / ') };
      }
      const facts = next['03_facts'];
      const observableFactItems = uniqueStrings(observable?.claim_texts || []).map((value) =>
        `${outputLang === 'ja' ? '入力記載（未検証）' : 'Input statement (unverified)'}: ${value}`
      );
      if (facts && observableFactItems.length) {
        const items = uniqueStrings([...(facts.items || []), ...observableFactItems]);
        next['03_facts'] = { ...facts, items, summary: items.join(' / ') };
      }
    }

    if (!observable || !intent) return next;
    const taskSpecificPurpose = uniqueStrings((packet.tasks || []).map((task) => task?.purpose || task?.objective))[0] || '';
    const specificPurpose = intent.source === 'EXPLICIT_PURPOSE_OVERRIDE'
      ? intent.purpose
      : (packet.user_goal || taskSpecificPurpose || next['01_purpose']?.user_goal || intent.purpose);
    const resolvedIntent = { ...intent, purpose: specificPurpose || intent.purpose };
    next.analysis_intent = resolvedIntent;
    next.observable_material = observable;

    const purpose = next['01_purpose'];
    if (purpose) {
      const priorItems = Array.isArray(purpose.items) ? purpose.items : [];
      next['01_purpose'] = {
        ...purpose,
        user_goal: resolvedIntent.purpose,
        summary: resolvedIntent.purpose,
        items: uniqueStrings([resolvedIntent.purpose, ...priorItems.filter((item) => String(item) !== resolvedIntent.purpose)]),
        analysis_intent: resolvedIntent
      };
    }

    const comparison = next['06_comparison'];
    if (comparison && observable.candidates?.length >= 2) {
      const existingCandidates = Array.isArray(comparison.comparison_candidates)
        ? comparison.comparison_candidates
        : [];
      const candidates = uniqueStrings([...observable.candidates, ...existingCandidates]).filter((label) => {
        const composite = /^(.+案)と(.+案)$/u.exec(label);
        return !composite || !(observable.candidates.includes(composite[1]) && observable.candidates.includes(composite[2]));
      });
      const existingMaterials = new Map(
        (Array.isArray(comparison.candidate_materials) ? comparison.candidate_materials : [])
          .map((item) => [String(item?.label || ''), item])
      );
      const candidateMaterials = candidates.map((label, index) => {
        if (existingMaterials.has(label)) return existingMaterials.get(label);
        return {
          candidate_id: `observable:${index + 1}`,
          label,
          material_state: 'OBSERVABLE_UNVERIFIED_MATERIAL',
          observations: (observable.claim_texts || []).filter((claim) => String(claim).includes(label)),
          confirmed_claim_ids: [],
          undetermined_claim_ids: [],
          supported_scopes: [],
          evidence_refs: []
        };
      });
      const dimensions = uniqueStrings([...(observable.dimensions || []), ...(comparison.dimensions || [])]);
      next['06_comparison'] = {
        ...comparison,
        summary: `observable_candidates=${candidates.length}; dimensions=${dimensions.join(' / ') || '-'}`,
        items: candidates.map((label) => `candidate=${label}`),
        comparison_candidates: candidates,
        dimensions,
        candidate_materials: candidateMaterials,
        selected_candidate: null,
        candidate_ranking: [],
        rejected_candidates: []
      };
    }

    const crisis = next['04_crisis'];
    if (crisis && observable.risks?.length) {
      const specificRisks = observable.risks.map((risk, index) => ({
        rule_id: `OBSERVABLE-${risk.code}`,
        key: risk.code,
        impact: risk.impact,
        failure_condition: `${risk.code} を解消するEvidence・成立条件が未確認のまま判断材料を使用する。`,
        weight: Math.max(35, 60 - index),
        source: 'OBSERVABLE_MATERIAL',
        claim_ids: []
      }));
      const existing = Array.isArray(crisis.risks) ? crisis.risks : [];
      const genericDominance = new Set([
        'Data Loss', 'Downtime', '互換性破壊', 'Security Regression', 'Rollback不能',
        '幻覚・誤判定', 'Bias', 'Privacy Leak', 'Prompt Injection', '過信・監査Gap',
        '製品安全', '誤表示', 'Recall', '保証不履行', '互換性問題',
        '根拠なしの主張', '弱いSource', '矛盾', 'Source Laundering'
      ]);
      const retained = existing.filter((risk) => {
        if (String(risk.rule_id || '').startsWith('OBSERVABLE-')) return true;
        return !genericDominance.has(String(risk.impact || ''));
      });
      const risks = [...specificRisks, ...retained];
      next['04_crisis'] = {
        ...crisis,
        summary: `case_specific_risks=${specificRisks.length}; total_risks=${risks.length}`,
        risks,
        items: risks.map((risk) => `${risk.key}[${risk.weight}] ${risk.impact}`)
      };
    }

    return next;
  }

  material(judgment) {
    return normalizeUnifiedMain8Material(renderUnifiedMain8(judgment));
  }

  externalBrief(judgment) {
    return this.material(judgment).text;
  }

  async process(input = {}, caller = { id: 'unknown' }, executionContext = {}) {
    const out = await super.process(input, caller, executionContext);
    return attachEvidenceCitations(out);
  }

  async processProgressive(input = {}, caller = { id: 'unknown' }, executionContext = {}) {
    const signal = executionContext?.signal || null;
    throwIfRequestCancelled(signal);

    const initial = this.processInitial(input, caller);
    if (typeof executionContext.onRevision === 'function') {
      await executionContext.onRevision(initial);
    }
    throwIfRequestCancelled(signal);

    const final = await this.process(input, caller, executionContext);
    throwIfRequestCancelled(signal);

    const revision = {
      ...final,
      result: final?.result && typeof final.result === 'object'
        ? { ...final.result, phase: 'FINAL_ENRICHED', revision: 2, material_id: initial.result.material_id }
        : final?.result,
      material: final?.material && typeof final.material === 'object'
        ? { ...final.material, phase: 'FINAL_ENRICHED', revision: 2, material_id: initial.result.material_id }
        : final?.material,
      runtime: final?.runtime && typeof final.runtime === 'object'
        ? { ...final.runtime, progressive: true, initial_duration_ms: initial.runtime.duration_ms }
        : final?.runtime
    };
    if (typeof executionContext.onRevision === 'function') {
      await executionContext.onRevision(revision);
    }
    throwIfRequestCancelled(signal);

    return Object.freeze({ initial, final: revision });
  }

  async resolveEvidenceForTask({ task, input, caller, signal = null }) {
    return resolveTaskEvidence({
      client: this.evidenceSearchClient,
      task,
      input,
      caller,
      signal
    });
  }
}

module.exports = AsteraEngine;