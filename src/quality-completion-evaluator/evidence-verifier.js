"use strict";

const { sha256Json, isSha256 } = require("./utils/hash");
const { verifyLocalGitReference } = require("./utils/repository");

const COMPLETE_STATUSES = new Set(["implementation_complete","test_complete","operation_ready","production_ready","deployed","completed"]);

function statusRecord(kind, id, status, reason = null, details = {}) { return { kind, evidence_id: id || null, status, reason, ...details }; }

async function verifyRepositoryEvidence(items = []) {
  const results = [];
  for (const [index, ref] of items.entries()) {
    const id = ref.evidence_id || `repository:${index}`;
    if (ref.local_path) {
      const local = await verifyLocalGitReference(ref);
      results.push(statusRecord("repository", id, local.valid ? "VALID" : "INVALID", local.reason, local));
      continue;
    }
    const trusted = ref.verification?.source === "trusted_adapter";
    const valid = trusted && ref.verification?.commit_exists === true && ref.verification?.path_exists === true && ref.verification?.hash_match === true;
    results.push(statusRecord("repository", id, valid ? "VALID" : "INVALID", valid ? null : "repository reference is not verified by a trusted adapter", { repository: ref.repository, commit_sha: ref.commit_sha, path: ref.path }));
  }
  return results;
}

function verifyTestEvidence(items = []) {
  return items.map((item, index) => {
    const id = item.evidence_id || `test:${index}`;
    const hasRequired = Boolean(item.command && Number.isInteger(item.exit_code) && item.executed_at && item.environment);
    const passed = item.exit_code === 0 && ["passed", "success"].includes(String(item.status).toLowerCase());
    if (!hasRequired) return statusRecord("test", id, "INVALID", "test evidence is missing command, exit_code, executed_at, or environment");
    return statusRecord("test", id, passed ? "VALID" : "INVALID", passed ? null : "test did not pass", { exit_code: item.exit_code, command: item.command, artifact_hash: item.artifact_hash || null });
  });
}

function verifyArtifactEvidence(items = []) {
  return items.map((item, index) => {
    const id = item.evidence_id || `artifact:${index}`;
    const valid = Boolean(item.artifact_hash && isSha256(item.artifact_hash));
    return statusRecord("artifact", id, valid ? "VALID" : "INVALID", valid ? null : "artifact_hash is missing or invalid");
  });
}

function verifyTgserverEvidence(snapshot) {
  if (!snapshot) return [statusRecord("tgserver", null, "NOT_REQUIRED", "snapshot not supplied")];
  if (!Array.isArray(snapshot.events) || !snapshot.snapshot_id || !snapshot.snapshot_hash) return [statusRecord("tgserver", snapshot.snapshot_id, "INVALID", "snapshot_id, snapshot_hash, events are required")];
  const calculated = sha256Json(snapshot.events);
  const valid = calculated === snapshot.snapshot_hash;
  return [statusRecord("tgserver", snapshot.snapshot_id, valid ? "VALID" : "INVALID", valid ? null : "snapshot hash mismatch", { calculated_snapshot_hash: calculated })];
}

function requiredEvidenceKinds(profile, declaredStatus, content) {
  const claimsComplete = COMPLETE_STATUSES.has(declaredStatus) || /(実装済み|テスト済み|本番利用可能|運用可能|production ready|implemented|tests? passed)/iu.test(content);
  const required = new Set(profile.required_evidence || []);
  if (claimsComplete) for (const kind of profile.complete_status_required_evidence || []) required.add(kind);
  return { claimsComplete, required };
}

async function verifyEvidence(request, profile) {
  const evidence = request.evidence || {};
  const repository = await verifyRepositoryEvidence(evidence.repository || []);
  const tests = verifyTestEvidence(evidence.tests || []);
  const artifacts = verifyArtifactEvidence(evidence.artifacts || []);
  const tgserver = verifyTgserverEvidence(evidence.tgserver);
  const all = [...repository, ...tests, ...artifacts, ...tgserver];
  const { claimsComplete, required } = requiredEvidenceKinds(profile, request.target.declared_status, request.target.content);
  const missingRequired = [];
  for (const kind of required) if (all.filter((item) => item.kind === kind && item.status === "VALID").length === 0) missingRequired.push(kind);
  const invalid = all.filter((item) => item.status === "INVALID");
  const valid = all.filter((item) => item.status === "VALID");
  const notRequired = all.filter((item) => item.status === "NOT_REQUIRED");
  const failedTests = tests.filter((item) => item.status === "INVALID" && item.exit_code !== undefined && item.exit_code !== 0);
  return { items: all, counts: { valid: valid.length, missing: missingRequired.length, invalid: invalid.length, not_required: notRequired.length }, missing_required: missingRequired, invalid_items: invalid, failed_tests: failedTests, claims_complete: claimsComplete, all_required_valid: missingRequired.length === 0 && invalid.length === 0 };
}

module.exports = { verifyEvidence, COMPLETE_STATUSES };
