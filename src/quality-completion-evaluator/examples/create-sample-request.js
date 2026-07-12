"use strict";

const { sha256Text } = require("../utils/hash");

const content = `# 目的
ASTERA内部で品質と完成度を固定Ruleにより個別採点し、両方95点以上の場合だけKB掲載候補にする。
# 範囲
品質採点、完成度採点、Blocking、KB Admissionまで。
# 責任分担
ASTERAが入力を渡し、本Moduleが判定し、KB Systemが保存する。
# 構成
InputValidator、RequirementMapper、EvidenceVerifier、RuleEngine、AdmissionGate。
# 入力
Evaluation Packetを受け取る。
# 出力
Evaluation ResultとKB Recordを返す。
# データ構造
Request、Result、KB RecordのSchemaを固定する。
# 処理フロー
入力検証、要求照合、証拠確認、採点、Blocking、95点Gateの順で処理する。
# 判定条件
品質95点以上かつ完成度95点以上、Blocking 0件。
# 異常処理
入力不正はINVALID_INPUT、処理失敗はEVALUATION_FAILEDとする。
# テスト条件
境界値、Hash不一致、Secret、未達要求、重複登録を検証する。
# 完成条件
全Test合格、同一入力で同一判定、95点未満を通過させない。
# 実装順序
Schema、Rule、基礎処理、採点、連携、検証の順で実装する。
# 失敗時処理
採点処理を停止しKB掲載を行わない。
# 再試行
入力または成果物を修正しcandidate_versionを更新して再評価する。
# Rollback
新Version不合格時は旧Versionをactiveのまま維持する。
# Archive
合格した新Version掲載時に旧VersionをArchiveへ移す。
# Version
1.0.0
# 変更履歴
初版。
# 既知の制限
ASTERA既存分析結果は構造化入力として受け取る。
# 再評価方法
同一Rubric Versionで修正後Packetを再投入する。`;

const requirements = ["品質と完成度を個別採点する","両方95点以上の場合だけKB掲載候補にする","平均点判定を使用しない"].map((text, index) => ({ requirement_id: `REQ-${String(index + 1).padStart(3, "0")}`, text, mandatory: true, source: "master_instruction", fulfillment: { status: "fulfilled", locations: ["target.content"], evidence_refs: [] } }));

const request = {
  schema_version: "astera.quality-completion.request.v1",
  evaluation_id: "eval_sample_01",
  project_id: "astera-v8",
  task_id: "task_sample_01",
  run_id: "run_sample_01",
  trace_id: "trace_sample_01",
  target: { candidate_id: "candidate_sample_01", candidate_version: 1, artifact_type: "design", title: "ASTERA 品質・完成度採点Module 設計", content, content_hash: sha256Text(content), declared_status: "design_complete" },
  requirements,
  evidence: { repository: [], tests: [], artifacts: [] },
  analysis: { technical_checks: [{ id: "TECH-001", status: "passed", evidence_refs: ["REQ-001"] },{ id: "TECH-002", status: "passed", evidence_refs: ["REQ-002"] },{ id: "TECH-003", status: "passed", evidence_refs: ["REQ-003"] }], logical_checks: [{ id: "LOGIC-001", status: "passed" },{ id: "LOGIC-002", status: "passed" }], contradictions: [], ambiguities: [], boundary_checks: [{ id: "BOUNDARY-001", status: "passed" },{ id: "BOUNDARY-002", status: "passed" }], boundary_violations: [], purpose_mismatch: false },
  evaluation_config: { rubric_version: "quality-completion-rubric.v1", blocking_rule_version: "blocking-rules.v1" }
};

process.stdout.write(`${JSON.stringify(request, null, 2)}\n`);
