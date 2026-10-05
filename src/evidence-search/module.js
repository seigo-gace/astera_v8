'use strict';

const crypto = require('node:crypto');
const { SearchOrchestrator } = require('./core/search-orchestrator');
const { calculateUsageReport } = require('./paid/usage-calculator');
const { stableStringify } = require('../quality-completion-evaluator/utils/stable-json');

const REQUEST_SCHEMA_VERSION = 'astera.evidence-search.module-request.v1';
const RESPONSE_SCHEMA_VERSION = 'astera.evidence-search.module-response.v1';
const OPERATIONS = Object.freeze({ SEARCH_EVIDENCE: 'SEARCH_EVIDENCE', CALCULATE_PAID_USAGE: 'CALCULATE_PAID_USAGE', HEALTH: 'HEALTH' });

function fail(message, code = 'INVALID_MODULE_REQUEST') { const error = new Error(message); error.code = code; throw error; }
function sha256(value) { return crypto.createHash('sha256').update(stableStringify(value)).digest('hex'); }

function enforceDualRoutePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const search = payload.search && typeof payload.search === 'object' && !Array.isArray(payload.search)
    ? payload.search
    : {};
  if (search.free_projection === false || search.free_current === false || search.free_general_web === false) {
    fail(
      'Evidence Search requires Specialist/Authoritative and General/Current routes on every search',
      'EVIDENCE_DUAL_ROUTE_REQUIRED'
    );
  }
  return Object.freeze({
    ...payload,
    search: Object.freeze({
      ...search,
      free_projection: true,
      free_current: true,
      free_general_web: true
    })
  });
}

function configuredRouteSummary(providers) {
  const configured = (Array.isArray(providers) ? providers : []).filter((provider) => (
    provider?.certified === true && provider?.source_class !== 'PAID_PROVIDER'
  ));
  const specialist = configured.filter((provider) => (
    provider.source_class === 'FREE_PROJECTION' || provider.source_class === 'FREE_OFFICIAL_LIVE'
  ));
  const generalCurrent = configured.filter((provider) => (
    provider.source_class === 'FREE_OFFICIAL_LIVE' || provider.source_class === 'FREE_GENERAL_WEB'
  ));
  const summarize = (records) => Object.freeze({
    available: records.length > 0,
    provider_count: records.length,
    provider_ids: Object.freeze(records.map((provider) => provider.provider_id))
  });
  const distinctProviderIds = new Set(configured.map((provider) => String(provider?.provider_id || '').trim()).filter(Boolean));
  return Object.freeze({
    specialist_authoritative: summarize(specialist),
    general_current: summarize(generalCurrent),
    distinct_provider_count: distinctProviderIds.size,
    dual_route_ready: specialist.length > 0 && generalCurrent.length > 0 && distinctProviderIds.size >= 2
  });
}

function routeExecutionSummary(result) {
  const initial = Array.isArray(result?.provider_execution?.initial) ? result.provider_execution.initial : [];
  // FREE_OFFICIAL_LIVE is intentionally a bridge class: an official live source can
  // satisfy the authoritative side of Route A and the current side of Route B.
  // FREE_PROJECTION remains specialist-only; FREE_GENERAL_WEB remains general/current-only.
  const specialist = initial.filter((item) => (
    item.source_class === 'FREE_PROJECTION' || item.source_class === 'FREE_OFFICIAL_LIVE'
  ));
  const generalCurrent = initial.filter((item) => (
    item.source_class === 'FREE_OFFICIAL_LIVE' || item.source_class === 'FREE_GENERAL_WEB'
  ));
  const summarize = (records) => Object.freeze({
    attempted: records.length > 0,
    provider_count: records.length,
    fulfilled_count: records.filter((item) => item.status === 'FULFILLED').length,
    rejected_count: records.filter((item) => item.status !== 'FULFILLED').length,
    provider_ids: Object.freeze(records.map((item) => item.provider_id))
  });
  const distinctProviderIds = new Set(initial.map((item) => String(item?.provider_id || '').trim()).filter(Boolean));
  return Object.freeze({
    specialist_authoritative: summarize(specialist),
    general_current: summarize(generalCurrent),
    distinct_provider_count: distinctProviderIds.size
  });
}

function dualRouteExecutionComplete(routeExecution) {
  return Boolean(
    routeExecution.specialist_authoritative.attempted
    && routeExecution.general_current.attempted
    && routeExecution.distinct_provider_count >= 2
  );
}

function attachDualRouteTrace(result, configuredRoutes = null) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return result;
  const routeExecution = routeExecutionSummary(result);
  if (!dualRouteExecutionComplete(routeExecution)) {
    if (!configuredRoutes?.dual_route_ready) {
      fail(
        'Evidence Search did not attempt both required search routes',
        'EVIDENCE_DUAL_ROUTE_EXECUTION_INCOMPLETE'
      );
    }
    const { result_hash: ignoredResultHash, ...withoutHash } = result;
    void ignoredResultHash;
    const failClosedTrace = Object.freeze({
      ...routeExecution,
      dual_route_complete: false,
      configured_dual_route_ready: true,
      fail_closed: true,
      failure_mode: 'ROUTE_UNAVAILABLE_FOR_QUERY'
    });
    const rejected = Object.freeze({
      ...withoutHash,
      status: 'REJECTED',
      evidence: Object.freeze([]),
      route_execution: failClosedTrace
    });
    return Object.freeze({ ...rejected, result_hash: sha256(rejected) });
  }
  const { result_hash: ignoredResultHash, ...withoutHash } = result;
  void ignoredResultHash;
  const traced = Object.freeze({ ...withoutHash, route_execution: routeExecution });
  return Object.freeze({ ...traced, result_hash: sha256(traced) });
}

function enforceAdoptedEvidenceBoundary(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return result;
  if (result.status === 'FINAL_VALID') return result;
  const { result_hash: ignoredResultHash, ...withoutHash } = result;
  void ignoredResultHash;
  const publishable = Object.freeze({ ...withoutHash, evidence: Object.freeze([]) });
  return Object.freeze({ ...publishable, result_hash: sha256(publishable) });
}

class EvidenceSearchModule {
  constructor(options = {}) {
    this.moduleId = 'astera-evidence-search';
    this.version = String(options.version || '2.4.0');
    this.orchestrator = new SearchOrchestrator(options);
    this.configuredRoutes = configuredRouteSummary(options.providerRegistry?.providers || options.providers || []);
  }

  async execute(request) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) fail('request must be an object');
    if (request.schema_version !== REQUEST_SCHEMA_VERSION) fail(`schema_version must be ${REQUEST_SCHEMA_VERSION}`, 'UNSUPPORTED_MODULE_SCHEMA');
    const operation = String(request.operation || '').trim().toUpperCase();
    if (!Object.values(OPERATIONS).includes(operation)) fail(`unsupported operation: ${operation || '(empty)'}`, 'UNSUPPORTED_MODULE_OPERATION');
    let result;
    if (operation === OPERATIONS.SEARCH_EVIDENCE) {
      const payload = enforceDualRoutePayload(request.payload);
      const searched = await this.orchestrator.execute(payload, request.context || {});
      result = enforceAdoptedEvidenceBoundary(attachDualRouteTrace(searched, this.configuredRoutes));
    } else if (operation === OPERATIONS.CALCULATE_PAID_USAGE) result = calculateUsageReport(request.payload);
    else result = this.orchestrator.health();
    return Object.freeze({ schema_version: RESPONSE_SCHEMA_VERSION, module_id: this.moduleId, module_version: this.version, operation, status: 'OK', result });
  }
}

function createEvidenceSearchModule(options = {}) {
  const instance = new EvidenceSearchModule(options);
  return Object.freeze({ execute: instance.execute.bind(instance) });
}

module.exports = createEvidenceSearchModule;
module.exports.enforceDualRoutePayload = enforceDualRoutePayload;
module.exports.configuredRouteSummary = configuredRouteSummary;
module.exports.routeExecutionSummary = routeExecutionSummary;
module.exports.attachDualRouteTrace = attachDualRouteTrace;