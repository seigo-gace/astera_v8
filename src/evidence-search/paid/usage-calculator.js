'use strict';

const crypto = require('node:crypto');
const { stableStringify } = require('../../quality-completion-evaluator/utils/stable-json');

const BPS_DENOMINATOR = 10_000n;
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const REPORT_SCHEMA_VERSION = 'astera.paid-search-usage-report.v1';

function fail(message, code = 'INVALID_USAGE_INPUT') {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function toNonNegativeBigInt(value, field) {
  if (typeof value === 'bigint') {
    if (value < 0n) fail(`${field} must be a non-negative integer`);
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) fail(`${field} must be a non-negative safe integer`);
    return BigInt(value);
  }
  if (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)) return BigInt(value);
  fail(`${field} must be a non-negative integer`);
}

function toPositiveBigInt(value, field) {
  const parsed = toNonNegativeBigInt(value, field);
  if (parsed === 0n) fail(`${field} must be greater than zero`);
  return parsed;
}

function toBasisPoints(value, field) {
  const parsed = toNonNegativeBigInt(value, field);
  if (parsed > 100_000n) fail(`${field} is unreasonably high`, 'INVALID_PRICING_POLICY');
  return parsed;
}

function ceilDiv(numerator, denominator) {
  if (denominator <= 0n) fail('denominator must be greater than zero', 'INVALID_PRICING_POLICY');
  return numerator === 0n ? 0n : ((numerator - 1n) / denominator) + 1n;
}

function clamp(value, minimum, maximum) {
  let next = value;
  if (minimum !== null && next < minimum) next = minimum;
  if (maximum !== null && next > maximum) next = maximum;
  return next;
}

function minorToJson(value) {
  return value <= MAX_SAFE_BIGINT ? Number(value) : value.toString();
}

function canonicalCurrency(value) {
  const currency = String(value || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) fail('currency must be a three-letter ISO-style code');
  return currency;
}

function normalizeUsage(usage) {
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) fail('usage must be an object');
  const metrics = {};
  for (const [metric, rawValue] of Object.entries(usage)) {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(metric)) fail(`invalid usage metric: ${metric}`);
    metrics[metric] = toNonNegativeBigInt(rawValue, `usage.${metric}`);
  }
  return metrics;
}

function normalizeProviderPricing(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) fail('provider_pricing must be an object', 'INVALID_PRICING_POLICY');
  const providerId = String(policy.provider_id || '').trim();
  const pricingVersion = String(policy.pricing_version || '').trim();
  if (!providerId) fail('provider_pricing.provider_id is required', 'INVALID_PRICING_POLICY');
  if (!pricingVersion) fail('provider_pricing.pricing_version is required', 'INVALID_PRICING_POLICY');
  const currency = canonicalCurrency(policy.currency);
  const fixedCostMinor = toNonNegativeBigInt(policy.fixed_cost_minor || 0, 'provider_pricing.fixed_cost_minor');
  const rawComponents = Array.isArray(policy.components) ? policy.components : [];
  if (!rawComponents.length && fixedCostMinor === 0n) fail('provider pricing must define components or a fixed cost', 'INVALID_PRICING_POLICY');

  const seen = new Set();
  const components = rawComponents.map((component, index) => {
    if (!component || typeof component !== 'object' || Array.isArray(component)) fail(`provider_pricing.components[${index}] must be an object`, 'INVALID_PRICING_POLICY');
    const metric = String(component.metric || '').trim();
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(metric)) fail(`invalid provider metric at index ${index}`, 'INVALID_PRICING_POLICY');
    if (seen.has(metric)) fail(`duplicate provider metric: ${metric}`, 'INVALID_PRICING_POLICY');
    seen.add(metric);
    const rounding = String(component.rounding || 'CEIL').toUpperCase();
    if (!['CEIL', 'FLOOR', 'EXACT'].includes(rounding)) fail(`unsupported rounding for ${metric}`, 'INVALID_PRICING_POLICY');
    return {
      metric,
      unit_size: toPositiveBigInt(component.unit_size || 1, `provider_pricing.components[${index}].unit_size`),
      price_minor: toNonNegativeBigInt(component.price_minor || 0, `provider_pricing.components[${index}].price_minor`),
      rounding
    };
  });
  return { provider_id: providerId, pricing_version: pricingVersion, currency, fixed_cost_minor: fixedCostMinor, components };
}

function normalizeAsteraPricing(policy, currency) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) fail('astera_pricing must be an object', 'INVALID_PRICING_POLICY');
  const pricingVersion = String(policy.pricing_version || '').trim();
  if (!pricingVersion) fail('astera_pricing.pricing_version is required', 'INVALID_PRICING_POLICY');
  const policyCurrency = canonicalCurrency(policy.currency || currency);
  if (policyCurrency !== currency) fail('provider and ASTERA pricing currencies must match', 'CURRENCY_MISMATCH');
  const maximumRaw = policy.maximum_service_fee_minor;
  return {
    pricing_version: pricingVersion,
    currency: policyCurrency,
    markup_bps: toBasisPoints(policy.markup_bps || 0, 'astera_pricing.markup_bps'),
    minimum_service_fee_minor: toNonNegativeBigInt(policy.minimum_service_fee_minor || 0, 'astera_pricing.minimum_service_fee_minor'),
    maximum_service_fee_minor: maximumRaw === undefined || maximumRaw === null
      ? null
      : toNonNegativeBigInt(maximumRaw, 'astera_pricing.maximum_service_fee_minor')
  };
}

function normalizeDirectVariablePolicy(policy, currency) {
  const source = policy || {};
  if (typeof source !== 'object' || Array.isArray(source)) fail('direct_variable_policy must be an object', 'INVALID_PRICING_POLICY');
  const policyCurrency = canonicalCurrency(source.currency || currency);
  if (policyCurrency !== currency) fail('direct variable cost currency must match provider currency', 'CURRENCY_MISMATCH');
  return {
    currency: policyCurrency,
    fixed_minor: toNonNegativeBigInt(source.fixed_minor || 0, 'direct_variable_policy.fixed_minor'),
    provider_cost_bps: toBasisPoints(source.provider_cost_bps || 0, 'direct_variable_policy.provider_cost_bps'),
    minimum_minor: source.minimum_minor === undefined || source.minimum_minor === null
      ? null
      : toNonNegativeBigInt(source.minimum_minor, 'direct_variable_policy.minimum_minor'),
    maximum_minor: source.maximum_minor === undefined || source.maximum_minor === null
      ? null
      : toNonNegativeBigInt(source.maximum_minor, 'direct_variable_policy.maximum_minor')
  };
}

function billedUnits(quantity, unitSize, rounding, metric) {
  if (rounding === 'CEIL') return ceilDiv(quantity, unitSize);
  if (rounding === 'FLOOR') return quantity / unitSize;
  if (quantity % unitSize !== 0n) fail(`usage.${metric} is not an exact multiple of its pricing unit`, 'NON_EXACT_USAGE_UNIT');
  return quantity / unitSize;
}

function calculateProviderCost(usageMetrics, providerPricing) {
  let total = providerPricing.fixed_cost_minor;
  const components = [];
  const pricedMetrics = new Set();

  for (const component of providerPricing.components) {
    const quantity = usageMetrics[component.metric] || 0n;
    const units = billedUnits(quantity, component.unit_size, component.rounding, component.metric);
    const cost = units * component.price_minor;
    total += cost;
    pricedMetrics.add(component.metric);
    components.push({
      metric: component.metric,
      quantity: minorToJson(quantity),
      unit_size: minorToJson(component.unit_size),
      billed_units: minorToJson(units),
      price_minor: minorToJson(component.price_minor),
      cost_minor: minorToJson(cost),
      rounding: component.rounding
    });
  }

  const unpricedNonZeroMetrics = Object.entries(usageMetrics)
    .filter(([metric, quantity]) => quantity > 0n && !pricedMetrics.has(metric))
    .map(([metric]) => metric)
    .sort();
  if (unpricedNonZeroMetrics.length) {
    fail(`usage contains non-zero metrics without pricing: ${unpricedNonZeroMetrics.join(', ')}`, 'UNPRICED_USAGE_METRIC');
  }

  return { total, components };
}

function calculateDirectVariableCost(providerCost, policy) {
  const percentage = ceilDiv(providerCost * policy.provider_cost_bps, BPS_DENOMINATOR);
  return clamp(policy.fixed_minor + percentage, policy.minimum_minor, policy.maximum_minor);
}

function calculateAsteraServiceFee(providerCost, policy) {
  const percentage = ceilDiv(providerCost * policy.markup_bps, BPS_DENOMINATOR);
  return clamp(percentage, policy.minimum_service_fee_minor, policy.maximum_service_fee_minor);
}

function sha256(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function calculateUsageReport(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('input must be an object');
  const requestId = String(input.request_id || '').trim();
  const tenantId = String(input.tenant_id || '').trim();
  const providerId = String(input.provider_id || '').trim();
  const mode = String(input.mode || 'ACTUAL').trim().toUpperCase();
  if (!requestId) fail('request_id is required');
  if (!tenantId) fail('tenant_id is required');
  if (!providerId) fail('provider_id is required');
  if (!['ESTIMATE', 'ACTUAL'].includes(mode)) fail('mode must be ESTIMATE or ACTUAL');

  const usageMetrics = normalizeUsage(input.usage || {});
  const providerPricing = normalizeProviderPricing(input.provider_pricing);
  if (providerPricing.provider_id !== providerId) fail('provider_id does not match provider pricing', 'PROVIDER_MISMATCH');
  const asteraPricing = normalizeAsteraPricing(input.astera_pricing, providerPricing.currency);
  const directPolicy = normalizeDirectVariablePolicy(input.direct_variable_policy, providerPricing.currency);

  const provider = calculateProviderCost(usageMetrics, providerPricing);
  const directVariableCost = calculateDirectVariableCost(provider.total, directPolicy);
  const asteraServiceFee = calculateAsteraServiceFee(provider.total, asteraPricing);
  const totalBillable = provider.total + directVariableCost + asteraServiceFee;

  const usageJson = Object.fromEntries(Object.entries(usageMetrics).sort(([a], [b]) => a.localeCompare(b)).map(([metric, value]) => [metric, minorToJson(value)]));
  const fingerprintPayload = {
    request_id: requestId,
    tenant_id: tenantId,
    provider_id: providerId,
    mode,
    usage: usageJson,
    provider_pricing_version: providerPricing.pricing_version,
    astera_pricing_version: asteraPricing.pricing_version
  };
  const usageFingerprint = sha256(fingerprintPayload);
  const report = {
    schema_version: REPORT_SCHEMA_VERSION,
    report_id: `psu_${usageFingerprint.slice(0, 32)}`,
    request_id: requestId,
    tenant_id: tenantId,
    provider_id: providerId,
    mode,
    currency: providerPricing.currency,
    usage: usageJson,
    provider_pricing_version: providerPricing.pricing_version,
    astera_pricing_version: asteraPricing.pricing_version,
    provider_cost_minor: minorToJson(provider.total),
    direct_variable_cost_minor: minorToJson(directVariableCost),
    astera_service_fee_minor: minorToJson(asteraServiceFee),
    total_billable_minor: minorToJson(totalBillable),
    provider_cost_components: provider.components,
    usage_fingerprint: usageFingerprint
  };
  return Object.freeze({ ...report, report_hash: sha256(report) });
}

module.exports = {
  REPORT_SCHEMA_VERSION,
  calculateUsageReport,
  calculateProviderCost,
  calculateDirectVariableCost,
  calculateAsteraServiceFee
};
