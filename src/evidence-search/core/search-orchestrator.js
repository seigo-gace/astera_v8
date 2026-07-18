'use strict';

const crypto = require('node:crypto');
const { compileQueryPlan } = require('./query-plan-compiler');
const { BoundedScheduler } = require('./bounded-scheduler');
const { ProviderRegistry } = require('../providers/provider-registry');
const { normalizeProviderResult } = require('../evidence/normalizer');
const { deduplicateCandidates } = require('../evidence/deduplicator');
const { measureConditions } = require('../evidence/condition-matcher');
const { analyzeLineage } = require('../evidence/lineage-matcher');
const { detectConflicts } = require('../evidence/conflict-detector');
const { measureFreshness } = require('../evidence/freshness-measurer');
const {
  evaluateInformationQuality,
  loadInformationQualityProfiles
} = require('../../quality-completion-evaluator');
const {
  stableStringify
} = require('../../quality-completion-evaluator/utils/stable-json');

function sha256(value) {
  return crypto.createHash('sha256')
    .update(typeof value === 'string' ? value : stableStringify(value))
    .digest('hex');
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function buildCoverage(selectedProviders, executions) {
  if (!selectedProviders.length) {
    return Object.freeze({
      registry_coverage_state: 'UNKNOWN',
      discovery_scope_state: 'UNKNOWN',
      selected_provider_count: 0,
      completed_provider_count: 0
    });
  }

  const completed = executions.filter((item) => item.status === 'FULFILLED');
  const allCompleted = completed.length === selectedProviders.length;
  const completeDiscovery = allCompleted && completed.every(
    (item) => item.normalized.coverage_state === 'COMPLETE_FOR_QUERY_SCOPE'
  );

  return Object.freeze({
    registry_coverage_state: allCompleted
      ? 'COMPLETE_FOR_ACTIVE_REGISTRY'
      : completed.length
        ? 'PARTIAL_ACTIVE_REGISTRY'
        : 'UNKNOWN',
    discovery_scope_state: completeDiscovery
      ? 'COMPLETE_FOR_QUERY_SCOPE'
      : completed.length
        ? 'PARTIAL_FOR_QUERY_SCOPE'
        : 'UNKNOWN',
    selected_provider_count: selectedProviders.length,
    completed_provider_count: completed.length
  });
}

function resolveInformationProfile(plan, overlays) {
  const profiles = loadInformationQualityProfiles();
  let groupId = profiles.domain_profile_map[plan.domain_lens.id];
  let profile = { ...(profiles.profile_groups[groupId] || {}) };

  for (const overlayId of overlays || []) {
    const overlay = profiles.overlay_profiles?.[overlayId];
    if (!overlay) continue;
    if (overlay.profile_group && profiles.profile_groups[overlay.profile_group]) {
      groupId = overlay.profile_group;
      profile = { ...profile, ...profiles.profile_groups[groupId] };
    }
    profile = {
      ...profile,
      ...overlay,
      freshness_policy: {
        ...(profile.freshness_policy || {}),
        ...(overlay.freshness_policy || {})
      },
      required_source_roles: [
        ...new Set([
          ...(profile.required_source_roles || []),
          ...(overlay.required_source_roles || [])
        ])
      ]
    };
  }

  return Object.freeze({ group_id: groupId, ...profile });
}

function buildMeasurements({
  candidates,
  plan,
  executions,
  selectedProviders,
  informationProfile
}) {
  const lineageBase = analyzeLineage(candidates);
  const officialRecords = new Set(
    candidates
      .filter((candidate) => ['OFFICIAL', 'PRIMARY'].includes(candidate.source_role))
      .map((candidate) => candidate.canonical_record_id)
      .filter(Boolean)
  );

  return Object.freeze({
    conditions: Object.freeze(measureConditions(candidates, plan.conditions)),
    lineage: Object.freeze({
      ...lineageBase,
      distinct_official_record_count: officialRecords.size
    }),
    conflict: detectConflicts(candidates, plan.conditions),
    freshness: measureFreshness(
      candidates,
      plan,
      informationProfile.freshness_policy || {}
    ),
    coverage: buildCoverage(selectedProviders, executions)
  });
}

function buildProviderTasks(providers, phase, plan, context, querySet) {
  return providers.map((provider) => ({
    provider,
    timeout_ms: Math.max(
      100,
      Math.min(2500, provider.latency_p95_ms * 2, context.remaining_ms())
    ),
    run: () => provider.search(
      Object.freeze({
        schema_version: 'astera.evidence-search.provider-plan.v1',
        phase,
        request_id: context.request_id,
        query_plan_hash: plan.plan_hash,
        effective_as_of: plan.effective_as_of,
        domain_lens: plan.domain_lens,
        conditions: plan.conditions,
        query_set: querySet,
        maximum_results: plan.maximum_results
      }),
      Object.freeze({
        signal: context.signal,
        deadline_at: context.deadline_at,
        tenant_id: context.tenant_id,
        request_id: context.request_id
      })
    )
  }));
}

async function executePhase({
  providers,
  phase,
  plan,
  context,
  scheduler,
  querySet
}) {
  if (!providers.length) return [];

  const rawExecutions = await scheduler.run(
    buildProviderTasks(providers, phase, plan, context, querySet),
    context
  );

  return rawExecutions.map((execution) => {
    if (execution.status !== 'FULFILLED') {
      return Object.freeze({
        status: 'REJECTED',
        provider: execution.provider,
        duration_ms: execution.duration_ms,
        error: {
          code: execution.error?.code || 'PROVIDER_FAILED',
          message: execution.error?.message || 'provider failed'
        }
      });
    }

    try {
      return Object.freeze({
        ...execution,
        normalized: normalizeProviderResult(execution.value, execution.provider)
      });
    } catch (error) {
      return Object.freeze({
        status: 'REJECTED',
        provider: execution.provider,
        duration_ms: execution.duration_ms,
        error: {
          code: error.code || 'PROVIDER_RESPONSE_INVALID',
          message: error.message
        }
      });
    }
  });
}

function collectCandidates(executions) {
  return executions
    .filter((execution) => execution.status === 'FULFILLED')
    .flatMap((execution) => execution.normalized.candidates);
}

function noveltyKey(candidate) {
  return [
    candidate.canonical_record_id || '',
    candidate.content_hash || '',
    candidate.source_family_id || '',
    candidate.capability_id || ''
  ].join('|');
}

function selectNewCorroboration(initialCandidates, reinforcementCandidates) {
  const initialKeys = new Set(initialCandidates.map(noveltyKey));
  const initialFamilies = new Set(
    initialCandidates.map((item) => item.source_family_id)
  );
  const initialCapabilities = new Set(
    initialCandidates.map((item) => item.capability_id)
  );

  return reinforcementCandidates.filter((candidate) => {
    if (initialKeys.has(noveltyKey(candidate))) return false;
    return !initialFamilies.has(candidate.source_family_id)
      || !initialCapabilities.has(candidate.capability_id);
  });
}

function buildEvaluationRequest({
  phase,
  plan,
  payload,
  candidates,
  measurements,
  reinforcementAttemptCount,
  newCorroborationCount
}) {
  return Object.freeze({
    schema_version: 'astera.information-quality-request.v1',
    phase,
    domain_lens: plan.domain_lens,
    overlays: Object.freeze([...(payload.overlays || [])]),
    jurisdictions: Object.freeze([...(payload.jurisdictions || [])]),
    conditions: plan.conditions,
    candidates: Object.freeze(candidates),
    measurements,
    reinforcement_attempt_count: reinforcementAttemptCount,
    new_corroboration_count: newCorroborationCount
  });
}

function executionReports(executions) {
  return Object.freeze(executions.map((execution) => Object.freeze({
    provider_id: execution.provider.provider_id,
    source_class: execution.provider.source_class,
    status: execution.status,
    duration_ms: execution.duration_ms,
    candidate_count: execution.status === 'FULFILLED'
      ? execution.normalized.candidates.length
      : 0,
    error_code: execution.error?.code || null
  })));
}

function normalizeEvaluator(evaluator) {
  if (typeof evaluator === 'function') return evaluator;
  if (evaluator && typeof evaluator.evaluate === 'function') {
    return evaluator.evaluate.bind(evaluator);
  }
  throw new TypeError('informationQualityEvaluator must be a function or expose evaluate()');
}

async function invokeEvaluator(evaluator, request, context) {
  const result = await evaluator(request, context);
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    const error = new Error('information quality evaluator returned an invalid result');
    error.code = 'INFORMATION_QUALITY_RESPONSE_INVALID';
    throw error;
  }
  if (!result.status || !Number.isInteger(result.score_bp)) {
    const error = new Error('information quality evaluator result is incomplete');
    error.code = 'INFORMATION_QUALITY_RESPONSE_INVALID';
    throw error;
  }
  return result;
}

class SearchOrchestrator {
  constructor(options = {}) {
    this.registry = options.providerRegistry instanceof ProviderRegistry
      ? options.providerRegistry
      : new ProviderRegistry(options.providers || []);

    this.scheduler = options.scheduler || new BoundedScheduler({
      globalConcurrency:
        options.globalConcurrency
        || process.env.ASTERA_SEARCH_GLOBAL_CONCURRENCY
        || 8,
      perProviderConcurrency:
        options.perProviderConcurrency
        || process.env.ASTERA_SEARCH_PER_ADAPTER_CONCURRENCY
        || 2
    });

    this.evaluator = normalizeEvaluator(
      options.informationQualityEvaluator || evaluateInformationQuality
    );
    this.evaluatorMode = String(
      options.informationQualityEvaluatorMode
      || (options.informationQualityEvaluator ? 'INJECTED' : 'IN_PROCESS')
    );
  }

  health() {
    return Object.freeze({
      status: 'OK',
      module: 'astera-evidence-search',
      provider_count: this.registry.providers.length,
      providers: this.registry.health(),
      evaluator_mode: this.evaluatorMode,
      ai_used: false,
      payment_execution: false
    });
  }

  async execute(payload, outerContext = {}) {
    const startedAt = Date.now();
    const requestId = String(
      payload?.request_id
      || outerContext.request_id
      || `evs_${crypto.randomUUID()}`
    );
    const tenantId = String(
      outerContext.tenant_id || payload?.tenant_id || 'anonymous'
    );
    const executionTime = String(
      outerContext.execution_time || new Date().toISOString()
    );

    const plan = compileQueryPlan(payload, {
      execution_time: executionTime,
      effective_as_of: outerContext.effective_as_of
    });

    const deadlineAt = startedAt + plan.deadline_ms;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), plan.deadline_ms);

    const context = Object.freeze({
      request_id: requestId,
      tenant_id: tenantId,
      execution_time: executionTime,
      deadline_at: deadlineAt,
      signal: controller.signal,
      remaining_ms: () => Math.max(1, deadlineAt - Date.now())
    });

    try {
      const informationProfile = resolveInformationProfile(
        plan,
        payload.overlays || []
      );

      const initialProviders = this.registry.select(plan, 'INITIAL');
      const initialExecutions = await executePhase({
        providers: initialProviders,
        phase: 'INITIAL',
        plan,
        context,
        scheduler: this.scheduler,
        querySet: plan.primary_query_set
      });

      const initialCandidates = deduplicateCandidates(
        collectCandidates(initialExecutions)
      ).slice(0, plan.maximum_results);

      const initialMeasurements = buildMeasurements({
        candidates: initialCandidates,
        plan,
        executions: initialExecutions,
        selectedProviders: initialProviders,
        informationProfile
      });

      const initialQuality = await invokeEvaluator(
        this.evaluator,
        buildEvaluationRequest({
          phase: 'INITIAL',
          plan,
          payload,
          candidates: initialCandidates,
          measurements: initialMeasurements,
          reinforcementAttemptCount: 0,
          newCorroborationCount: 0
        }),
        context
      );

      const allExecutions = [...initialExecutions];
      let finalCandidates = initialCandidates;
      let finalMeasurements = initialMeasurements;
      let finalQuality = initialQuality;
      let newCorroboration = [];
      let reinforcementExecutions = [];

      if (initialQuality.status === 'REINFORCEMENT_REQUIRED') {
        const reinforcementProviders = this.registry.select(
          plan,
          'REINFORCEMENT'
        );

        reinforcementExecutions = await executePhase({
          providers: reinforcementProviders,
          phase: 'REINFORCEMENT',
          plan,
          context,
          scheduler: this.scheduler,
          querySet: plan.reinforcement_query_set
        });

        allExecutions.push(...reinforcementExecutions);

        const reinforcementCandidates = deduplicateCandidates(
          collectCandidates(reinforcementExecutions)
        );

        newCorroboration = selectNewCorroboration(
          initialCandidates,
          reinforcementCandidates
        );

        finalCandidates = deduplicateCandidates([
          ...initialCandidates,
          ...newCorroboration
        ]).slice(0, plan.maximum_results);

        finalMeasurements = buildMeasurements({
          candidates: finalCandidates,
          plan,
          executions: allExecutions,
          selectedProviders: [
            ...initialProviders,
            ...reinforcementProviders
          ],
          informationProfile
        });

        finalQuality = await invokeEvaluator(
          this.evaluator,
          buildEvaluationRequest({
            phase: 'FINAL',
            plan,
            payload,
            candidates: finalCandidates,
            measurements: finalMeasurements,
            reinforcementAttemptCount: 1,
            newCorroborationCount: newCorroboration.length
          }),
          context
        );
      }

      const result = {
        schema_version: 'astera.evidence-search.result.v1',
        request_id: requestId,
        tenant_id: tenantId,
        status: finalQuality.status,
        execution_time: executionTime,
        effective_as_of: plan.effective_as_of,
        query_plan_hash: plan.plan_hash,
        duration_ms: Date.now() - startedAt,
        evidence: Object.freeze(finalCandidates),
        coverage: finalMeasurements.coverage,
        quality: Object.freeze({
          initial: initialQuality,
          final: finalQuality,
          reinforcement_attempt_count:
            initialQuality.status === 'REINFORCEMENT_REQUIRED' ? 1 : 0,
          new_corroboration_count: newCorroboration.length
        }),
        provider_execution: Object.freeze({
          initial: executionReports(initialExecutions),
          reinforcement: executionReports(reinforcementExecutions)
        }),
        paid_usage_reports: Object.freeze([]),
        ai_used: false,
        payment_executed: false
      };

      return deepFreeze({
        ...result,
        result_hash: sha256(result)
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = { SearchOrchestrator };
