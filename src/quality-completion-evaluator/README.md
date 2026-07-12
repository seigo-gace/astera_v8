# ASTERA QualityCompletionEvaluator

ASTERA内部で、成果物の**品質**と**完成度**をそれぞれ100点満点で固定Rule採点し、両方95点以上の場合だけKB掲載候補を生成するNode.js Moduleです。

## 固定条件

- 品質スコア `>= 95`  
- 完成度スコア `>= 95`  
- Blocking `0件`  
- 必須Requirement未達 `0件`  
- Evidence不整合 `0件`  
- 評価処理が正常完了  
- 平均点判定は禁止

## 必要環境

- Node.js 20以上  
- 外部npm依存なし  
- ASTERAのModule配置先: `src/quality-completion-evaluator`

## 現行Astera v8への統合境界

- 正式配置先: `src/quality-completion-evaluator`
- 現行 `Dockerfile` は `src/` 全体をコピーするため、本Moduleも本番コンテナへ含まれます。
- 現時点では既存 `/process` へ自動接続しません。成果物・Requirement・Evidenceが確定した処理から明示的に呼び出します。
- KB System連携はAdapter経由のみです。EvaluatorからKB DBへ直接書き込みません。

## 検証

./scripts-verify.sh

または:

npm test

npm run smoke

## ASTERAからの使用

const {

  evaluate,

  evaluateAndPublish,

  createHttpKbSystemAdapter

} = require("./src/quality-completion-evaluator");

const result = await evaluate(evaluationPacket);

if (result.judgment.kb_eligible) {

  const adapter = createHttpKbSystemAdapter({

    baseUrl: process.env.KB_SYSTEM_URL,

    token: process.env.KB_SYSTEM_TOKEN

  });

  const published = await evaluateAndPublish(evaluationPacket, adapter);

  console.log(published.status);

}

## CLI

STDIN:

node examples/create-sample-request.js | node cli/evaluate.js

JSON File:

node cli/evaluate.js /path/to/evaluation-request.json

HTTP KB Systemへ掲載:

KB_SYSTEM_URL=http://kb-system:8080 \

KB_SYSTEM_TOKEN='***' \

node cli/evaluate.js /path/to/request.json --publish-http

## 高得点に必要な入力

固定Ruleだけで95点以上を安全に出すため、ASTERA既存解析から以下を構造化して渡します。

{

  "analysis": {

    "technical_checks": [{ "id": "TECH-001", "status": "passed" }],

    "logical_checks": [{ "id": "LOGIC-001", "status": "passed" }],

    "contradictions": [],

    "ambiguities": [],

    "boundary_checks": [{ "id": "BOUNDARY-001", "status": "passed" }],

    "boundary_violations": [],

    "purpose_mismatch": false

  }

}

要求ごとの達成状態も明示します。

{

  "requirement_id": "REQ-001",

  "text": "品質と完成度を個別採点する",

  "mandatory": true,

  "fulfillment": {

    "status": "fulfilled",

    "locations": ["section:目的"],

    "evidence_refs": []

  }

}

明示情報がない場合は保守的に減点し、推測だけで95点以上にしません。

## Exit Code

- `0`: KB掲載条件合格  
- `1`: 評価完了だが掲載条件未達またはBlocking  
- `2`: 入力不正、評価処理失敗、CLI失敗

## 安全境界

このModuleは成果物修正、Commit、Push、Deploy、Rubric自動変更を行いません。KB保存は明示的に渡されたKB Adapterだけが担当します。  
