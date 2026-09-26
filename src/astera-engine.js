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

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

// Public decision-material runtime.
// It does not implement a second canonical processing pipeline. The Canonical base owns
// Task/Lens/Claim/Binding/G1-G7/Lane/Main8 execution. This class supplies the isolated
// Evidence Search resolver plus the no-network initial Fast Path used before progressive
// Parser/Evidence enrichment.
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
    return ensureStandaloneDecisionMaterialRequest(prepared, input);
  }

  processInitial(input = {}, caller = { id: 'unknown' }) {
    const question = String(input.question || '');
    const observableMaterial = observeDocumentMaterial(question);
    const analysisIntent = detectAnalysisIntent(question, observableMaterial);
    const initial = buildInitialJudgmentMaterial(input, caller);
    if (!initial?.result || typeof initial.result !== 'object') return initial;
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
        ? { ...initial.runtime, standalone_intent_auto_detected: true }
        : initial.runtime
    };
  }

  frame(args = {}) {
    const judgment = super.frame(args);
    const request = args.request || {};
    const packet = request.analysis_task_packet || {};
    const observable = packet.observable_material || request.observable_material || null;
    const intent = packet.analysis_intent || request.standalone_api_intent || null;
    if (!observable || !intent) return judgment;

    const next = { ...judgment, analysis_intent: intent, observable_material: observable };
    const purpose = next['01_purpose'];
    if (purpose) {
      const priorItems = Array.isArray(purpose.items) ? purpose.items : [];
      next['01_purpose'] = {
        ...purpose,
        user_goal: intent.purpose,
        summary: intent.purpose,
        items: uniqueStrings([intent.purpose, ...priorItems.filter((item) => String(item) !== intent.purpose)]),
        analysis_intent: intent
      };
    }

    const comparison = next['06_comparison'];
    if (comparison && observable.candidates?.length >= 2) {
      const existingCandidates = Array.isArray(comparison.comparison_candidates)
        ? comparison.comparison_candidates
        : [];
      const candidates = uniqueStrings([...observable.candidates, ...existingCandidates]);
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
        '根拠なしの主張', '弱いSource', '矛盾', 'Source Laundering'
      ]);
      const retained = existing.filter((risk) => !(String(risk.rule_id || '').startsWith('RISK-LENS-') && genericDominance.has(String(risk.impact || ''))));
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

  async processProgressive(input = {}, caller = { id: 'unknown' }, executionContext = {}) {
    const initial = this.processInitial(input, caller);
    if (typeof executionContext.onRevision === 'function') {
      await executionContext.onRevision(initial);
    }

    const final = await this.process(input, caller, executionContext);
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
