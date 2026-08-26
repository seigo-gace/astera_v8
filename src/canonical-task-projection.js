'use strict';

const {
  UNDETERMINED,
  evaluateCanonicalTaskPlan,
  projectFiveLanes,
  deterministicPerspectiveExpansion
} = require('./canonical-claim-runtime');

function taskErrorCode(error) {
  return String(error?.code || 'TASK_EXECUTION_FAILURE').replace(/[^A-Z0-9_.:-]/gi, '_').toUpperCase();
}

function assertProjectionInput(task) {
  if (!task || typeof task !== 'object' || Array.isArray(task)) {
    const error = new TypeError('canonical task projection requires task object');
    error.code = 'INVALID_CANONICAL_TASK';
    throw error;
  }
  if (!task.canonical_plan || typeof task.canonical_plan !== 'object') {
    const error = new Error(`Task ${task.id || '-'} is missing canonical_plan`);
    error.code = 'CANONICAL_PLAN_MISSING';
    throw error;
  }
}

function projectCanonicalTask({ task, evidenceRaw, providedCanonical = null }) {
  assertProjectionInput(task);
  if (providedCanonical?.task_id && String(providedCanonical.task_id) !== String(task.id)) {
    const error = new Error(`Provided canonical task_id ${providedCanonical.task_id} does not match ${task.id}`);
    error.code = 'CANONICAL_TASK_ID_MISMATCH';
    throw error;
  }
  const canonical = providedCanonical || evaluateCanonicalTaskPlan(task.canonical_plan, evidenceRaw);
  const lanes = projectFiveLanes({ task, canonical, domain: task.domain || {} });
  const perspectiveExpansion = deterministicPerspectiveExpansion({ task, canonical, domain: task.domain || {} });
  return {
    canonical,
    lanes,
    perspective_expansion: perspectiveExpansion
  };
}

function failureConfirmation(claim, policy, error) {
  const code = taskErrorCode(error);
  return {
    schema_version: 'astera.claim-confirmation.failure.v1',
    claim_id: claim.claim_id,
    status: UNDETERMINED,
    reasons: [`TASK_EXECUTION_FAILURE:${code}`],
    bindings: [],
    support_binding_ids: [],
    counter_binding_ids: [],
    supported_scope: null,
    gate_details: {
      execution_failure: true,
      error_code: code,
      missing_scope_fields: [],
      policy_required_scope_fields: policy?.required_scope_fields || []
    }
  };
}

function buildFailureCanonical(task, error) {
  const plan = task?.canonical_plan || {};
  const claims = Array.isArray(plan.claims) ? plan.claims : [];
  const policies = plan.policy_by_claim_id || {};
  const records = claims.map((claim) => {
    const policy = policies[claim.claim_id] || null;
    return {
      claim,
      policy,
      bindings: [],
      confirmation: failureConfirmation(claim, policy, error)
    };
  });
  return {
    schema_version: 'astera.canonical-claim-records.v2',
    task_id: task?.id || plan.task_id || null,
    search_plan: plan.search_plan || { task_id: task?.id || null, queries: [], planned_query_roles: [] },
    records,
    confirmed_count: 0,
    undetermined_count: records.length,
    execution_failure: {
      code: taskErrorCode(error),
      message: String(error?.message || 'Canonical task execution failed')
    }
  };
}

function fallbackFailureLanes(task, canonical, error) {
  const claimIds = (canonical.records || []).map((record) => record.claim?.claim_id).filter(Boolean);
  const reason = `TASK_EXECUTION_FAILURE:${taskErrorCode(error)}`;
  const emptyTrace = [];
  return {
    lens_plan: task?.domain?.lens_plan || null,
    fact: {
      lane: 'fact',
      confirmed_claim_ids: [],
      undetermined_claim_ids: claimIds,
      confirmed: [],
      unconfirmed: (canonical.records || []).map((record) => ({
        claim_id: record.claim?.claim_id || null,
        text: record.claim?.raw_text || '',
        status: UNDETERMINED,
        reasons: [reason]
      })),
      opinions: [],
      evidence_need: [],
      evidence_gaps: claimIds.map((claimId) => ({ item: claimId, reason, source: 'TASK_EXECUTION' }))
    },
    risk: {
      lane: 'risk',
      source: 'TASK_EXECUTION_FAILURE',
      rule_ids: ['RISK-TASK-EXECUTION-FAILURE'],
      target_count: claimIds.length,
      confirmed_count: 0,
      undetermined_count: claimIds.length,
      target_claim_ids: claimIds,
      risk_count: 1,
      risks: [{ rule_id: 'RISK-TASK-EXECUTION-FAILURE', key: 'task-execution', impact: 'Task execution failed before deterministic projection completed.', failure_condition: reason, weight: 100, source: 'TASK_EXECUTION', claim_ids: claimIds }],
      highest: { rule_id: 'RISK-TASK-EXECUTION-FAILURE', key: 'task-execution', impact: 'Task execution failed before deterministic projection completed.', failure_condition: reason, weight: 100, source: 'TASK_EXECUTION', claim_ids: claimIds },
      hard_constraints: [...(task?.constraints || []), ...(task?.prohibitions || []), ...(task?.preserve || [])],
      safety_gates: [reason],
      failure_conditions: [reason],
      evidence_trace: emptyTrace,
      level: 'high'
    },
    multi: {
      lane: 'multi',
      material_only: true,
      supported_scopes: [],
      perspectives: [],
      trade_off_map: [],
      evidence_trace: emptyTrace
    },
    inquiry: {
      lane: 'inquiry',
      problem_health: { healthy: false, reason },
      open_items: (canonical.records || []).map((record) => ({ claim_id: record.claim?.claim_id || null, text: record.claim?.raw_text || '', reasons: [reason], missing_scope_fields: [] })),
      missing_fields: [],
      missing_questions: [reason],
      inquiry_lens: [],
      evidence_need: [],
      assumptions: ['UNDETERMINED Claimは未確定のまま保持する。'],
      extracted_scope: {
        target: task?.target || null,
        action: task?.action || null,
        objective: task?.objective || null,
        completion_criteria: [...(task?.completion_criteria || []), ...(task?.success_criteria || [])],
        constraints: task?.constraints || [],
        prohibitions: task?.prohibitions || [],
        preserve: task?.preserve || [],
        replace: task?.replace || [],
        conditions: task?.conditions || [],
        exceptions: task?.exceptions || [],
        dependencies: task?.depends_on || []
      },
      evidence_trace: emptyTrace
    },
    compare: {
      lane: 'compare',
      material_only: true,
      counts: { claims: claimIds.length, confirmed: 0, undetermined: claimIds.length, insufficient_evidence: 0, conflicts: 0 },
      coverage: null,
      scope_booleans: [],
      supported_scope: [],
      unsupported_scope: claimIds.map((claimId) => ({ claim_id: claimId, missing_scope_fields: [], reasons: [reason] })),
      contradiction_map: [],
      condition_differences: {
        constraints: task?.constraints || [], prohibitions: task?.prohibitions || [], preserve: task?.preserve || [], replace: task?.replace || [], conditions: task?.conditions || [], exceptions: task?.exceptions || [], dependencies: task?.depends_on || []
      },
      dimensions: [],
      dimension_sources: [],
      trade_off_differences: [],
      evidence_trace: emptyTrace,
      selected_candidate: null,
      candidate_ranking: [],
      rejected_candidates: [],
      verdict: { decision: 'MATERIAL_ONLY', reason: 'Astera does not select, rank, recommend, adopt, reject, or hold candidates.' }
    }
  };
}

function failurePerspective(task, canonical, error) {
  const code = taskErrorCode(error);
  const reason = `TASK_EXECUTION_FAILURE:${code}`;
  const classes = ['mainline', 'opposition', 'failure_reference', 'third_way', 'human_fit'];
  return {
    engine: 'Astera Deterministic Perspective Expansion',
    mode: 'MATERIAL_ONLY',
    policy: {
      fixed_classes: classes,
      ranking_allowed: false,
      selection_allowed: false,
      recommendation_allowed: false,
      final_decision_allowed: false
    },
    claim_state: { confirmed: 0, undetermined: canonical.undetermined_count || 0 },
    lens_ids: [task?.domain?.primary?.id, ...((task?.domain?.secondary || []).map((lens) => lens.id))].filter(Boolean),
    perspectives: classes.map((id) => ({
      id,
      class: id.toUpperCase(),
      focus: id === 'failure_reference' ? [reason] : task?.objective || task?.target || '',
      conditions: [],
      failure_conditions: [reason],
      support_evidence_refs: [],
      counter_evidence_refs: [],
      missing_evidence_refs: [],
      trade_offs: [],
      query_roles: canonical.search_plan?.planned_query_roles || [],
      basis: { rule_ids: ['PERSPECTIVE-TASK-EXECUTION-FAILURE'], error_code: code }
    })),
    candidates: [],
    selected: null,
    rejected: []
  };
}

function projectCanonicalFailure({ task, error }) {
  const canonical = buildFailureCanonical(task, error);
  let lanes;
  let perspectiveExpansion;
  try {
    lanes = projectFiveLanes({ task, canonical, domain: task?.domain || {} });
  } catch {
    lanes = fallbackFailureLanes(task, canonical, error);
  }
  try {
    perspectiveExpansion = deterministicPerspectiveExpansion({ task, canonical, domain: task?.domain || {} });
  } catch {
    perspectiveExpansion = failurePerspective(task, canonical, error);
  }
  return { canonical, lanes, perspective_expansion: perspectiveExpansion };
}

module.exports = {
  projectCanonicalTask,
  projectCanonicalFailure,
  buildFailureCanonical,
  taskErrorCode
};
