"use strict";

const crypto = require("node:crypto");
const { stableStringify } = require("../utils/stable-json");

const REGISTRY_SCHEMA_VERSION = "astera.evidence-registry.v1";
const BINDINGS_SCHEMA_VERSION = "astera.evidence-bindings.v1";
const ENTRY_SCHEMA_VERSION = "astera.evidence-registry-entry.v1";
const BINDING_SCHEMA_VERSION = "astera.evidence-binding.v1";

function sha256(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : stableStringify(value)).digest("hex");
}

function sortedStrings(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(String).filter(Boolean))].sort();
}

function sameStrings(left, right) {
  return stableStringify(sortedStrings(left)) === stableStringify(sortedStrings(right));
}

function verifyEvidenceRegistry(registry, bindingSet) {
  const errors = [];
  const evidenceIds = new Set();
  const bindingIds = new Set();
  const entryMap = new Map();
  const claimIndex = new Map();

  if (!registry || typeof registry !== "object" || Array.isArray(registry)) {
    errors.push({ code: "EVIDENCE_REGISTRY_REQUIRED", path: "evidence_registry" });
    registry = { schema_version: null, entries: [], registry_hash: null };
  }
  if (!bindingSet || typeof bindingSet !== "object" || Array.isArray(bindingSet)) {
    errors.push({ code: "EVIDENCE_BINDINGS_REQUIRED", path: "evidence_bindings" });
    bindingSet = { schema_version: null, bindings: [], bindings_hash: null };
  }

  const entries = Array.isArray(registry.entries) ? registry.entries : [];
  const bindings = Array.isArray(bindingSet.bindings) ? bindingSet.bindings : [];

  if (registry.schema_version !== REGISTRY_SCHEMA_VERSION) errors.push({ code: "EVIDENCE_REGISTRY_SCHEMA_INVALID", path: "evidence_registry.schema_version" });
  if (bindingSet.schema_version !== BINDINGS_SCHEMA_VERSION) errors.push({ code: "EVIDENCE_BINDINGS_SCHEMA_INVALID", path: "evidence_bindings.schema_version" });
  if (registry.registry_hash !== sha256(entries)) errors.push({ code: "EVIDENCE_REGISTRY_HASH_MISMATCH", path: "evidence_registry.registry_hash" });
  if (bindingSet.bindings_hash !== sha256(bindings)) errors.push({ code: "EVIDENCE_BINDINGS_HASH_MISMATCH", path: "evidence_bindings.bindings_hash" });

  for (const [index, entry] of entries.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push({ code: "EVIDENCE_ENTRY_INVALID", path: `evidence_registry.entries[${index}]` });
      continue;
    }
    if (entry.schema_version !== ENTRY_SCHEMA_VERSION) errors.push({ code: "EVIDENCE_ENTRY_SCHEMA_INVALID", path: `evidence_registry.entries[${index}].schema_version` });
    const evidenceId = String(entry.evidence_id || "");
    if (!evidenceId) errors.push({ code: "EVIDENCE_ID_REQUIRED", path: `evidence_registry.entries[${index}].evidence_id` });
    else if (evidenceIds.has(evidenceId)) errors.push({ code: "EVIDENCE_ID_DUPLICATE", path: `evidence_registry.entries[${index}].evidence_id`, evidence_id: evidenceId });
    else {
      evidenceIds.add(evidenceId);
      entryMap.set(evidenceId, entry);
    }

    const { integrity, ...base } = entry;
    if (!integrity || integrity.algorithm !== "sha256" || integrity.entry_hash !== sha256(base)) {
      errors.push({ code: "EVIDENCE_ENTRY_HASH_MISMATCH", path: `evidence_registry.entries[${index}].integrity`, evidence_id: evidenceId || null });
    }
    if ((integrity?.content_hash ?? null) !== (entry.content?.content_hash ?? null)) {
      errors.push({ code: "EVIDENCE_CONTENT_HASH_REFERENCE_MISMATCH", path: `evidence_registry.entries[${index}].integrity.content_hash`, evidence_id: evidenceId || null });
    }
  }

  const bindingsByEvidence = new Map();
  for (const [index, binding] of bindings.entries()) {
    if (!binding || typeof binding !== "object" || Array.isArray(binding)) {
      errors.push({ code: "EVIDENCE_BINDING_INVALID", path: `evidence_bindings.bindings[${index}]` });
      continue;
    }
    if (binding.schema_version !== BINDING_SCHEMA_VERSION) errors.push({ code: "EVIDENCE_BINDING_SCHEMA_INVALID", path: `evidence_bindings.bindings[${index}].schema_version` });
    const bindingId = String(binding.binding_id || "");
    if (!bindingId) errors.push({ code: "EVIDENCE_BINDING_ID_REQUIRED", path: `evidence_bindings.bindings[${index}].binding_id` });
    else if (bindingIds.has(bindingId)) errors.push({ code: "EVIDENCE_BINDING_ID_DUPLICATE", path: `evidence_bindings.bindings[${index}].binding_id`, binding_id: bindingId });
    else bindingIds.add(bindingId);

    const { binding_hash: expectedHash, ...base } = binding;
    if (!expectedHash || expectedHash !== sha256(base)) errors.push({ code: "EVIDENCE_BINDING_HASH_MISMATCH", path: `evidence_bindings.bindings[${index}].binding_hash`, binding_id: bindingId || null });

    const evidenceId = String(binding.evidence_id || "");
    const target = entryMap.get(evidenceId);
    if (!target) {
      errors.push({ code: "EVIDENCE_BINDING_TARGET_MISSING", path: `evidence_bindings.bindings[${index}].evidence_id`, binding_id: bindingId || null });
      continue;
    }
    if (!bindingsByEvidence.has(evidenceId)) bindingsByEvidence.set(evidenceId, []);
    bindingsByEvidence.get(evidenceId).push(binding);

    const claimId = String(binding.claim_id || "").trim();
    if (claimId) {
      if (!claimIndex.has(claimId)) claimIndex.set(claimId, new Set());
      claimIndex.get(claimId).add(evidenceId);
    }

    const expectedPairs = [
      ["candidate_id", target.candidate_id ?? null],
      ["canonical_record_id", target.source?.canonical_record_id ?? null],
      ["source_role", target.source?.source_role ?? null],
      ["source_family_id", target.source?.source_family_id ?? null],
      ["authority_id", target.source?.authority_id ?? null],
      ["url", target.source?.canonical_locator?.url ?? null]
    ];
    for (const [field, expected] of expectedPairs) {
      const actual = binding[field] ?? null;
      if (actual !== expected) errors.push({ code: "EVIDENCE_BINDING_SOURCE_MISMATCH", path: `evidence_bindings.bindings[${index}].${field}`, binding_id: bindingId || null, field });
    }
  }

  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || !entry.evidence_id) continue;
    const related = bindingsByEvidence.get(String(entry.evidence_id)) || [];
    const expectedBindingIds = related.map((item) => item.binding_id);
    const expectedQueryIds = related.map((item) => item.query_id).filter(Boolean);
    const expectedClaimIds = related.map((item) => item.claim_id).filter(Boolean);
    if (!sameStrings(entry.provenance?.binding_ids, expectedBindingIds)) errors.push({ code: "EVIDENCE_PROVENANCE_BINDINGS_MISMATCH", evidence_id: entry.evidence_id });
    if (!sameStrings(entry.provenance?.query_ids, expectedQueryIds)) errors.push({ code: "EVIDENCE_PROVENANCE_QUERIES_MISMATCH", evidence_id: entry.evidence_id });
    if (!sameStrings(entry.provenance?.claim_ids, expectedClaimIds)) errors.push({ code: "EVIDENCE_PROVENANCE_CLAIMS_MISMATCH", evidence_id: entry.evidence_id });
  }

  return {
    valid: errors.length === 0,
    errors,
    evidence_ids: evidenceIds,
    binding_ids: bindingIds,
    entry_map: entryMap,
    claim_index: claimIndex,
    counts: { evidence: evidenceIds.size, bindings: bindingIds.size, claims: claimIndex.size, invalid: errors.length }
  };
}

function validReference(ref, verification) {
  const id = String(ref || "");
  return verification.evidence_ids.has(id) || verification.binding_ids.has(id);
}

function referencesForClaims(claimRefs, verification) {
  const refs = new Set();
  const missing = [];
  for (const raw of Array.isArray(claimRefs) ? claimRefs : []) {
    const claimId = String(raw || "").trim();
    if (!claimId) continue;
    const matched = verification.claim_index.get(claimId);
    if (!matched || matched.size === 0) {
      missing.push(claimId);
      continue;
    }
    for (const evidenceId of matched) refs.add(evidenceId);
  }
  return { refs: [...refs].sort(), missing: [...new Set(missing)].sort() };
}

module.exports = {
  REGISTRY_SCHEMA_VERSION,
  BINDINGS_SCHEMA_VERSION,
  verifyEvidenceRegistry,
  validReference,
  referencesForClaims
};
