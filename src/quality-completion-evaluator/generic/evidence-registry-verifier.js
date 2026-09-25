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

function verifyEvidenceRegistry(registry, bindingSet) {
  const errors = [];
  const evidenceIds = new Set();
  const bindingIds = new Set();

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
    else evidenceIds.add(evidenceId);

    const { integrity, ...base } = entry;
    if (!integrity || integrity.algorithm !== "sha256" || integrity.entry_hash !== sha256(base)) {
      errors.push({ code: "EVIDENCE_ENTRY_HASH_MISMATCH", path: `evidence_registry.entries[${index}].integrity`, evidence_id: evidenceId || null });
    }
  }

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
    if (!evidenceIds.has(String(binding.evidence_id || ""))) errors.push({ code: "EVIDENCE_BINDING_TARGET_MISSING", path: `evidence_bindings.bindings[${index}].evidence_id`, binding_id: bindingId || null });
  }

  return {
    valid: errors.length === 0,
    errors,
    evidence_ids: evidenceIds,
    binding_ids: bindingIds,
    counts: { evidence: evidenceIds.size, bindings: bindingIds.size, invalid: errors.length }
  };
}

function validReference(ref, verification) {
  const id = String(ref || "");
  return verification.evidence_ids.has(id) || verification.binding_ids.has(id);
}

module.exports = {
  REGISTRY_SCHEMA_VERSION,
  BINDINGS_SCHEMA_VERSION,
  verifyEvidenceRegistry,
  validReference
};
