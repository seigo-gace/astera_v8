"use strict";

const { TAXONOMY_VERSION, GENRE_LENSES } = require("../all-domain-lens-catalog");
const { routeDomainTemplates } = require("../domain-template-router");

const GENRE_BY_ID = new Map(GENRE_LENSES.map((item) => [item.id, item]));
const VALID_CHECK_TYPES = new Set(["risk", "evidence", "safety"]);
const VALID_CHECK_STATUSES = new Set(["passed", "failed", "not_applicable"]);

function clean(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

function validateDeclaredDomainLens(value) {
  const errors = [];
  if (value === undefined || value === null) return errors;
  if (typeof value !== "object" || Array.isArray(value)) return [{ path: "domain_lens", code: "TYPE", message: "domain_lens must be an object" }];
  if (!GENRE_BY_ID.has(value.id)) errors.push({ path: "domain_lens.id", code: "UNSUPPORTED_DOMAIN_LENS", message: "domain_lens.id must be G01 through G38" });
  if (value.taxonomy_version !== undefined && value.taxonomy_version !== TAXONOMY_VERSION) errors.push({ path: "domain_lens.taxonomy_version", code: "UNSUPPORTED_TAXONOMY_VERSION", message: `taxonomy_version must be ${TAXONOMY_VERSION}` });
  if (value.path_key !== undefined && (!value.id || !String(value.path_key).startsWith(`${value.id}/`))) errors.push({ path: "domain_lens.path_key", code: "DOMAIN_PATH_MISMATCH", message: "path_key must belong to domain_lens.id" });
  if (value.enforce !== undefined && typeof value.enforce !== "boolean") errors.push({ path: "domain_lens.enforce", code: "TYPE", message: "domain_lens.enforce must be boolean" });
  return errors;
}

function publicLens(genre, declared, source) {
  const requestedPath = clean(declared?.path_key);
  return {
    id: genre.id,
    name: genre.name,
    taxonomy_version: TAXONOMY_VERSION,
    source,
    enforce: declared?.enforce === true,
    path_key: requestedPath || genre.anchor_path.path_key,
    path_resolution: requestedPath ? "REQUESTED_TAXONOMY_PATH" : "GENRE_LENS_ANCHOR",
    fact_lens: genre.fact_lens,
    risk_lens: genre.risk_lens,
    multi_lens: genre.multi_lens,
    inquiry_lens: genre.inquiry_lens,
    compare_lens: genre.compare_lens,
    evidence_to_collect: genre.evidence_to_collect,
    safety_gate: genre.safety_gate || []
  };
}

function resolveDomainLens(request) {
  const declared = request?.domain_lens || null;
  if (declared?.id) return publicLens(GENRE_BY_ID.get(declared.id), declared, "request");
  const routed = routeDomainTemplates({
    question: request?.target?.title || request?.target?.candidate_id || "",
    context: request?.target?.content || ""
  });
  if (!routed.primary) return null;
  return publicLens(GENRE_BY_ID.get(routed.primary.id), null, "deterministic_router");
}

function checkKey(type, item) {
  return `${type}:${clean(item).toLowerCase()}`;
}

function assessDomainLens(request, lens) {
  if (!lens) return null;
  const declaredChecks = Array.isArray(request?.analysis?.domain_checks) ? request.analysis.domain_checks : [];
  const checks = [];
  for (const [index, item] of declaredChecks.entries()) {
    const type = VALID_CHECK_TYPES.has(item?.lens_type) ? item.lens_type : null;
    const status = VALID_CHECK_STATUSES.has(item?.status) ? item.status : null;
    checks.push({
      index,
      lens_type: type,
      lens_item: clean(item?.lens_item),
      status,
      evidence_refs: Array.isArray(item?.evidence_refs) ? item.evidence_refs.filter(Boolean) : [],
      valid: Boolean(type && status && clean(item?.lens_item))
    });
  }

  const expected = [
    ...lens.risk_lens.map((item) => ({ lens_type: "risk", lens_item: item })),
    ...lens.evidence_to_collect.map((item) => ({ lens_type: "evidence", lens_item: item })),
    ...lens.safety_gate.map((item) => ({ lens_type: "safety", lens_item: item }))
  ];
  const byKey = new Map(checks.filter((item) => item.valid).map((item) => [checkKey(item.lens_type, item.lens_item), item]));
  const missing = [];
  const failed = [];
  const verified = [];

  for (const item of expected) {
    const check = byKey.get(checkKey(item.lens_type, item.lens_item));
    if (!check) {
      missing.push(item);
      continue;
    }
    if (check.status === "failed") {
      failed.push({ ...item, evidence_refs: check.evidence_refs });
      continue;
    }
    if (lens.enforce && check.status === "passed" && check.evidence_refs.length === 0) {
      missing.push({ ...item, reason: "evidence_ref_required" });
      continue;
    }
    verified.push({ ...item, status: check.status, evidence_refs: check.evidence_refs });
  }

  const complete = missing.length === 0 && failed.length === 0;
  return {
    status: lens.enforce ? (complete ? "PASSED" : "FAILED") : "NOT_ENFORCED",
    enforce: lens.enforce,
    expected_count: expected.length,
    verified_count: verified.length,
    missing_count: missing.length,
    failed_count: failed.length,
    complete,
    verified,
    missing,
    failed,
    invalid_checks: checks.filter((item) => !item.valid)
  };
}

module.exports = {
  resolveDomainLens,
  assessDomainLens,
  validateDeclaredDomainLens,
  TAXONOMY_VERSION,
  GENRE_BY_ID
};
