"use strict";
const test=require("node:test");const assert=require("node:assert/strict");const{evaluate,sha256Text}=require("../../index");
test("implementation_complete without repository/test/artifact/tgserver is blocked",async()=>{const content=`# 目的
実装する。
# 実装
実装済み。
# 入力
JSON。
# 出力
JSON。
# 異常処理
停止する。
# 設定
固定。
# 起動方法
node。
# 停止方法
SIGTERM。
# 既存機能との接続
内部Import。
# 失敗時処理
掲載しない。
# 再試行
修正後。
# Rollback
旧版維持。
# 復旧方法
再起動。
# Version
1.0.0
# 変更履歴
初版。
# 既知の制限
なし。
# 再評価方法
再投入。`;const request={schema_version:"astera.quality-completion.request.v1",evaluation_id:"eval_impl_missing",project_id:"astera-v8",target:{candidate_id:"impl-1",candidate_version:1,artifact_type:"implementation",title:"impl",content,content_hash:sha256Text(content),declared_status:"implementation_complete"},requirements:[{requirement_id:"R1",text:"実装する",mandatory:true,fulfillment:{status:"fulfilled",locations:["section:実装"]}}],evidence:{repository:[],tests:[],artifacts:[]},analysis:{technical_checks:[{id:"t1",status:"passed"},{id:"t2",status:"passed"},{id:"t3",status:"passed"},{id:"t4",status:"passed"}],logical_checks:[{id:"l1",status:"passed"},{id:"l2",status:"passed"}],contradictions:[],ambiguities:[],boundary_checks:[{id:"b1",status:"passed"},{id:"b2",status:"passed"}],boundary_violations:[],purpose_mismatch:false},evaluation_config:{rubric_version:"quality-completion-rubric.v1",blocking_rule_version:"blocking-rules.v1"}};const result=await evaluate(request);assert.equal(result.status,"BLOCKED");assert.ok(result.blocking.some(item=>item.block_id==="KB-HB-003"));});
