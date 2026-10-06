'use strict';

const {
  RuntimeTrace,
  activeTrace,
  runWithTrace,
  installRuntimeTraceInstrumentation
} = require('./runtime/runtime-trace');
installRuntimeTraceInstrumentation();

const CanonicalAsteraEngine = require('./canonical-astera-engine');
const { resolveTaskEvidence } = require('./canonical-evidence-resolver');
const { createEvidenceSearchClient } = require('./evidence-search/api/runtime-client');
const { buildInitialJudgmentMaterial } = require('./runtime/initial-material-fast-path');
const {
  detectAnalysisIntent,
  observeDocumentMaterial,
  ensureStandaloneDecisionMaterialRequest
} = require('./runtime/standalone-material-normalizer');
const { buildUniversalSourceUnderstanding } = require('./runtime/universal-source-graph');
const { applyUniversalCaseGraph } = require('./runtime/universal-case-graph');
const { recoverPartialParserMaterial } = require('./runtime/parser-partial-material-recovery');
const { normalizeMultiJudgmentCase } = require('./runtime/multi-judgment-case-normalizer');
const { renderFiveLaneMain8 } = require('./runtime/five-lane-main8-material-renderer');
const { projectFiveLaneMaterialToMain8 } = require('./runtime/five-lane-main8-projection');
const { buildPublicFiveStageAggregate, publicTaskResults } = require('./runtime/five-stage-public-aggregate');
const { normalizeUnifiedMain8Material } = require('./runtime/main8-readability-normalizer');
const { attachEvidenceCitations } = require('./runtime/evidence-citation-material');
const {
  explicitPurposeIntent,
  applyExplicitPurposeControl
} = require('./runtime/purpose-control');

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
    const preparedPromise = super.prepareRequest(input);
    const source = String(input.question ?? input.original_question ?? input.normalized_question ?? '');
    const precomputedUnderstanding = source
      ? buildUniversalSourceUnderstanding(source, input.language || '')
      : null;
    const prepared = await preparedPromise;
    const normalized = ensureStandaloneDecisionMaterialRequest(prepared, input);
    const universal = applyUniversalCaseGraph(normalized, input, precomputedUnderstanding);
    const recovered = universal?.analysis_task_packet?.universal_case_graph?.applied === true
      ? universal
      : recoverPartialParserMaterial(universal, input);
    const caseNormalized = normalizeMultiJudgmentCase(recovered, input);
    return applyExplicitPurposeControl(caseNormalized, input.purpose);
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
    const trace = activeTrace();
    const project = () => {
      const taskResults = args.taskResults || [];
      const projectedTaskResults = publicTaskResults(taskResults);
      const projectedAggregate = buildPublicFiveStageAggregate(args.aggregate || {}, taskResults);
      const judgment = super.frame({ ...args, taskResults: projectedTaskResults, aggregate: projectedAggregate });
      const packet = args.request?.analysis_task_packet || {};
      const next = projectFiveLaneMaterialToMain8({ ...judgment }, projectedTaskResults);
      const analysisIntent = packet.analysis_intent || args.request?.standalone_api_intent || null;
      const observableMaterial = packet.observable_material || args.request?.observable_material || null;
      if (analysisIntent) next.analysis_intent = analysisIntent;
      if (observableMaterial) next.observable_material = observableMaterial;
      return next;
    };
    return trace ? trace.measureSync('main8_render', project, { cache_unknown: 0 }) : project();
  }

  material(judgment) {
    const trace = activeTrace();
    const normalize = () => {
      const fiveLaneRendered = renderFiveLaneMain8(judgment, super.material(judgment));
      return normalizeUnifiedMain8Material(fiveLaneRendered);
    };
    return trace ? trace.measureSync('public_normalize', normalize, { cache_unknown: 0 }) : normalize();
  }

  externalBrief(judgment) {
    return this.material(judgment).text;
  }

  async process(input = {}, caller = { id: 'unknown' }, executionContext = {}) {
    const trace = new RuntimeTrace({
      caller_id: caller?.id || 'unknown',
      input_chars: String(input?.question || '').length,
      context_chars: String(input?.context || '').length
    });
    return runWithTrace(trace, async () => {
      trace.measureSync('ingest', () => ({
        question_chars: String(input?.question || '').length,
        context_chars: String(input?.context || '').length
      }), {
        counts: {
          question_chars: String(input?.question || '').length,
          context_chars: String(input?.context || '').length
        },
        cache_unknown: 0
      });

      const out = await super.process(input, caller, executionContext);
      const cited = trace.measureSync('public_normalize', () => attachEvidenceCitations(out), {
        cache_unknown: 0,
        measurement_state: 'PUBLIC_EVIDENCE_CITATION_NORMALIZE'
      });

      if (!trace.has('parser_wait')) trace.markNotApplicable('parser_wait', 'NO_JAPANESE_PARSER_WAIT');
      if (!trace.has('evidence_wait')) trace.markNotApplicable('evidence_wait', 'NO_EXTERNAL_EVIDENCE_WAIT');

      const taskCount = Number(cited?.runtime?.task_count || cited?.result?.analysis_task_packet?.tasks?.length || 0);
      const claimCount = Number(cited?.result?.canonical_claims?.claim_count || 0);
      const runtimeTrace = trace.finalize({
        counts: { task_count: taskCount, claim_count: claimCount },
        request: {
          language: cited?.runtime?.input_language || cited?.result?.request_model?.language || null,
          output_language: cited?.runtime?.requested_output_language || null
        }
      });

      const runtime = cited?.runtime && typeof cited.runtime === 'object'
        ? {
          ...cited.runtime,
          runtime_trace_status: runtimeTrace.status,
          runtime_trace_schema: runtimeTrace.schema_version,
          runtime_trace_missing_spans: runtimeTrace.missing_spans
        }
        : cited?.runtime;
      const result = cited?.result && typeof cited.result === 'object'
        ? {
          ...cited.result,
          ...(runtimeTrace.status === 'COMPLETE' ? { runtime_trace: runtimeTrace } : {}),
          runtime_trace_status: runtimeTrace.status,
          runtime_trace_missing_spans: runtimeTrace.missing_spans
        }
        : cited?.result;
      return { ...cited, result, runtime };
    });
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
    const trace = activeTrace();
    const resolve = () => resolveTaskEvidence({
      client: this.evidenceSearchClient,
      task,
      input,
      caller,
      signal
    });
    return trace
      ? trace.measureAsync('evidence_wait', resolve, {
        external_wait: true,
        cache_unknown: 1,
        counts: { task_calls: 1 },
        measurement_state: 'EXTERNAL_WAIT'
      })
      : resolve();
  }
}

module.exports = AsteraEngine;