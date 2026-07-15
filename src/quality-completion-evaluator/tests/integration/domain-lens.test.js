"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluate } = require("../../index");
const { resolveDomainLens } = require("../../domain-lens-resolver");
const { baseDesignRequest } = require("../fixtures/factory");

function g29Request({ enforce = false, includeTg = false } = {}) {
  const request = baseDesignRequest({ includeTg, events: includeTg ? [{ event_id: "event_01", status: "passed" }] : [] });
  request.domain_lens = {
    id: "G29",
    taxonomy_version: "1.0.0",
    path_key: "G29/G29-L03/G29-L03-M03/G29-L03-M03-S04",
    enforce
  };
  return request;
}

function completeChecks(request, evidenceId) {
  const lens = resolveDomainLens(request);
  return [
    ...lens.risk_lens.map((lensItem) => ({ lens_type: "risk", lens_item: lensItem, status: "passed", evidence_refs: [evidenceId] })),
    ...lens.evidence_to_collect.map((lensItem) => ({ lens_type: "evidence", lens_item: lensItem, status: "passed", evidence_refs: [evidenceId] })),
    ...lens.safety_gate.map((lensItem) => ({ lens_type: "safety", lens_item: lensItem, status: "passed", evidence_refs: [evidenceId] }))
  ];
}

test("Evaluatorは指定されたG29 Lensを同じ固定定義で返す", async () => {
  const result = await evaluate(g29Request());
  assert.equal(result.domain_lens.id, "G29");
  assert.equal(result.domain_lens.source, "request");
  assert.equal(result.domain_lens.taxonomy_version, "1.0.0");
  assert.equal(result.domain_lens.path_key, "G29/G29-L03/G29-L03-M03/G29-L03-M03-S04");
  assert.equal(result.domain_lens.assessment.status, "NOT_ENFORCED");
  assert.ok(result.domain_lens.risk_lens.includes("Rollback不能"));
  assert.ok(result.domain_lens.evidence_to_collect.includes("API契約"));
});

test("Lens未指定時は同じ決定論的Routerで補完する", async () => {
  const request = baseDesignRequest();
  request.target.title = "APIサーバーのシステム開発";
  const result = await evaluate(request);
  assert.equal(result.domain_lens.id, "G29");
  assert.equal(result.domain_lens.source, "deterministic_router");
  assert.equal(result.domain_lens.path_resolution, "GENRE_LENS_ANCHOR");
});

test("存在しないGenre IDはINVALID_INPUTにする", async () => {
  const request = baseDesignRequest();
  request.domain_lens = { id: "G99", taxonomy_version: "1.0.0", enforce: true };
  const result = await evaluate(request);
  assert.equal(result.status, "INVALID_INPUT");
  assert.ok(result.errors.some((item) => item.code === "UNSUPPORTED_DOMAIN_LENS"));
});

test("Enforce時にLens固有確認がない場合はBlockingする", async () => {
  const result = await evaluate(g29Request({ enforce: true }));
  assert.equal(result.domain_lens.assessment.status, "FAILED");
  assert.ok(result.blocking.some((item) => item.block_id === "KB-HB-016"));
  assert.equal(result.judgment.kb_eligible, false);
});

test("任意文字列のEvidence参照ではLens確認を通さない", async () => {
  const request = g29Request({ enforce: true });
  request.analysis.domain_checks = completeChecks(request, "fake_evidence");
  const result = await evaluate(request);
  assert.equal(result.domain_lens.assessment.status, "FAILED");
  assert.ok(result.domain_lens.assessment.missing.every((item) => item.reason === "verified_evidence_ref_required"));
  assert.ok(result.blocking.some((item) => item.block_id === "KB-HB-016"));
});

test("VALID Evidenceへ全Lens確認を接続した場合だけDomain Blockingを解除する", async () => {
  const request = g29Request({ enforce: true, includeTg: true });
  request.analysis.domain_checks = completeChecks(request, "snap_01");
  const result = await evaluate(request);
  assert.equal(result.domain_lens.assessment.status, "PASSED");
  assert.equal(result.domain_lens.assessment.complete, true);
  assert.ok(result.domain_lens.assessment.valid_evidence_ids.includes("snap_01"));
  assert.equal(result.blocking.some((item) => item.block_id === "KB-HB-016"), false);
});
