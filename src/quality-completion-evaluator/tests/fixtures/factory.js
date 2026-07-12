"use strict";
const{sha256Text,sha256Json}=require("../../utils/hash");
function fullDesignContent(){return`# 目的
品質と完成度を個別採点する。
# 範囲
ASTERA内部Moduleの判定処理。
# 責任分担
ASTERA、Evaluator、KB Systemを分離する。
# 構成
固定Rule Engineで構成する。
# 入力
Evaluation Packet。
# 出力
Evaluation Result。
# データ構造
SchemaをVersion固定する。
# 処理フロー
検証、採点、Blocking、Gate。
# 判定条件
品質95点以上かつ完成度95点以上。
# 異常処理
異常時は掲載しない。
# テスト条件
境界値を検証する。
# 完成条件
全Test合格。
# 実装順序
Schemaから実装する。
# 失敗時処理
掲載を停止する。
# 再試行
修正後に再評価する。
# Rollback
旧Versionを維持する。
# Archive
旧Versionを削除せずArchiveする。
# Version
1.0.0
# 変更履歴
初版。
# 既知の制限
構造化分析入力が必要。
# 再評価方法
candidate_versionを上げる。`;}
function baseDesignRequest(overrides={}){const content=overrides.content||fullDesignContent();const events=overrides.events||[];const request={schema_version:"astera.quality-completion.request.v1",evaluation_id:"eval_test_01",project_id:"astera-v8",task_id:"task_01",run_id:"run_01",trace_id:"trace_01",target:{candidate_id:"candidate_01",candidate_version:1,artifact_type:"design",title:"Test Design",content,content_hash:sha256Text(content),declared_status:"design_complete"},requirements:[{requirement_id:"REQ-001",text:"品質と完成度を個別採点する",mandatory:true,fulfillment:{status:"fulfilled",locations:["section:目的"],evidence_refs:[]}},{requirement_id:"REQ-002",text:"両方95点以上だけKB掲載",mandatory:true,keywords:["品質95点以上","完成度95点以上"],fulfillment:{status:"fulfilled",locations:["section:判定条件"],evidence_refs:[]}}],evidence:overrides.includeTg?{tgserver:{snapshot_id:"snap_01",snapshot_hash:sha256Json(events),events},repository:[],tests:[],artifacts:[]}:{repository:[],tests:[],artifacts:[]},analysis:{technical_checks:[{id:"TECH-001",status:"passed"},{id:"TECH-002",status:"passed"},{id:"TECH-003",status:"passed"}],logical_checks:[{id:"LOGIC-001",status:"passed"},{id:"LOGIC-002",status:"passed"}],contradictions:[],ambiguities:[],boundary_checks:[{id:"BOUNDARY-001",status:"passed"},{id:"BOUNDARY-002",status:"passed"}],boundary_violations:[],purpose_mismatch:false},evaluation_config:{rubric_version:"quality-completion-rubric.v1",blocking_rule_version:"blocking-rules.v1"}};return Object.assign(request,overrides.request||{});}
module.exports={baseDesignRequest,fullDesignContent};
