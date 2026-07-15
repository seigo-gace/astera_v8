# ASTERA QualityCompletionEvaluator

ASTERA内部で、成果物の**品質**と**完成度**をそれぞれ100点満点で固定Rule採点し、両方95点以上の場合だけKB掲載候補を生成するNode.js Moduleです。

一般的なAI採点ではありません。Requirement、Evidence、固定Rubric、Blocking Rule、`G01`〜`G38`の分野LensをScriptで検査します。

## 固定条件

- 品質スコア `>= 95`
- 完成度スコア `>= 95`
- Blocking `0件`
- 必須Requirement未達 `0件`
- Evidence不整合 `0件`
- 評価処理が正常完了
- 平均点判定は禁止

## 必要環境

- Node.js 22以上
- 外部npm依存なし
- 配置先: `src/quality-completion-evaluator`

## 現行Astera v8への統合境界

- 現行`/process`へ自動接続しません。
- 成果物・Requirement・Evidenceが確定した処理から明示的に呼び出します。
- KB System連携はAdapter経由だけです。
- EvaluatorからKB DBへ直接書き込みません。
- 成果物種別Profileと専門ジャンルLensは別責務です。
  - Artifact Profile: 設計、実装、研究、Test結果など
  - Domain Lens: `G01`〜`G38`の分野固有Risk・Evidence・Safety条件

## 共通38 Genre Lens

Evaluatorは通常版Asteraと同じ次の正本を参照します。

- `../all-domain-lens-catalog.js`
- `../domain-template-router.js`

別のLens一覧を複製しません。

### Lens指定なし

対象TitleとContentを通常版と同じ決定論的Routerへ渡し、`G01`〜`G38`を補完します。

### Lens指定あり

ASTERA-KBや前段処理で4階層Pathが確定している場合は、Evaluation Packetへ指定します。

```json
{
  "domain_lens": {
    "id": "G29",
    "taxonomy_version": "1.0.0",
    "path_key": "G29/G29-L03/G29-L03-M03/G29-L03-M03-S04",
    "enforce": true
  }
}
```

- `id`: `G01`〜`G38`
- `path_key`: 指定`Gxx`配下の完全Path
- `enforce: false`: Lensを結果へ付与するが、Lens項目不足だけではBlockingしない
- `enforce: true`: Lens固有確認をKB掲載条件へ加える

## Lens固有確認

`enforce: true`では、次を`analysis.domain_checks`へ渡します。

```json
{
  "analysis": {
    "domain_checks": [
      {
        "lens_type": "risk",
        "lens_item": "Rollback不能",
        "status": "passed",
        "evidence_refs": ["test:migration-rollback"]
      },
      {
        "lens_type": "evidence",
        "lens_item": "API契約",
        "status": "passed",
        "evidence_refs": ["repository:api-contract"]
      }
    ]
  }
}
```

`lens_type`:

- `risk`
- `evidence`
- `safety`

`status`:

- `passed`
- `failed`
- `not_applicable`

### Evidence条件

`passed`は、Evaluatorが`VALID`と確認したEvidence IDへ接続されている場合だけ有効です。

次は合格にしません。

- 任意に作ったEvidence ID
- 存在しないEvidence ID
- 検証失敗したRepository・Test・Artifact
- 別CandidateのEvidence

未確認・失敗時は`KB-HB-016`でBlockingします。

## 使用例

```javascript
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
```

## 検証

```bash
./scripts-verify.sh
```

または:

```bash
npm test
npm run smoke
```

Lens関連Test:

- `tests/integration/domain-lens.test.js`
- 明示G29 Lens
- 同一Routerによる補完
- 無効G99拒否
- Enforce不足Blocking
- 偽Evidence拒否
- VALID Evidence接続時のBlocking解除

## 高得点に必要な入力

```json
{
  "analysis": {
    "technical_checks": [{"id": "TECH-001", "status": "passed"}],
    "logical_checks": [{"id": "LOGIC-001", "status": "passed"}],
    "contradictions": [],
    "ambiguities": [],
    "boundary_checks": [{"id": "BOUNDARY-001", "status": "passed"}],
    "boundary_violations": [],
    "purpose_mismatch": false,
    "domain_checks": []
  }
}
```

Requirementごとの達成状態も明示します。

```json
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
```

明示情報がない場合は保守的に減点し、推測だけで95点以上にしません。

## CLI

```bash
node examples/create-sample-request.js | node cli/evaluate.js
node cli/evaluate.js /path/to/evaluation-request.json
```

HTTP KB Systemへ掲載:

```bash
KB_SYSTEM_URL=http://kb-system:8080 \
KB_SYSTEM_TOKEN='***' \
node cli/evaluate.js /path/to/request.json --publish-http
```

## Exit Code

- `0`: KB掲載条件合格
- `1`: 評価完了だが掲載条件未達またはBlocking
- `2`: 入力不正、評価処理失敗、CLI失敗

## 安全境界

このModuleは成果物修正、Commit、Push、Deploy、Rubric自動変更を行いません。KB保存は明示的に渡されたKB Adapterだけが担当します。
