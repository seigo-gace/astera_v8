# ASTERA 品質・完成度採点／KB掲載判定Module

## 総合設計書 v1.0 — 現行 `astera_v8` 適合版

## 1. 目的

`QualityCompletionEvaluator` は、ASTERAが確定した成果物・Requirement・解析結果・TGserverログ・Repository情報・Test結果を固定Ruleで検査し、次の2項目だけを100点満点で採点する決定論的な内部Moduleである。

- 品質スコア
- 完成度スコア

KB掲載候補の条件は次に固定する。

- 品質 `>= 95`
- 完成度 `>= 95`
- Blocking `0件`
- 必須Requirement未達 `0件`
- Evidence不整合 `0件`
- 評価処理が正常完了

品質と完成度の平均点は使用しない。

## 2. 配置

現行Repositoryの絶対構成とDockerfileに合わせ、正式配置先を次に固定する。

```text
astera_v8/
└─ src/
   └─ quality-completion-evaluator/
```

ルート直下の `modules/` は使用しない。現行Dockerfileの `COPY src ./src` により、本ModuleはASTERA本番コンテナへ含まれる。

## 3. 責任範囲

### 実行する処理

1. Evaluation Packet入力検証
2. Requirement対応確認
3. Evidence整合確認
4. 品質採点
5. 完成度採点
6. Blocking判定
7. KB掲載候補判定
8. 不合格理由の構造化
9. KB Record候補生成

### 実行しない処理

- 成果物の修正
- Code生成
- RepositoryへのCommit・Push
- Deploy
- RubricやWeightの自動変更
- 不足Evidenceの捏造
- KB DBへの直接書込み

## 4. 呼出境界

現行 `src/server.js` の `/process` と `src/kagura-engine.js` へ自動挿入しない。成果物・Requirement・Evidenceを確定できる処理から、明示的に呼び出す。

```text
成果物・Requirement・Evidence確定
  → createEvaluationPacket
  → QualityCompletionEvaluator.evaluate
  → KB_ELIGIBLE
  → 正式KB System Adapterへ明示的に引渡し
```

現行ASTERAではKB連携が未実装であるため、本Module追加だけでKB自動掲載済みとは扱わない。

## 5. 内部構成

```text
quality-completion-evaluator/
├─ input-validator.js
├─ requirement-mapper.js
├─ evidence-verifier.js
├─ quality/quality-rule-engine.js
├─ completion/completion-rule-engine.js
├─ blocking/blocking-rule-engine.js
├─ score-calculator.js
├─ kb-admission-gate.js
├─ evaluation-result-builder.js
├─ adapters/
├─ contracts/
├─ profiles/
├─ integration/
├─ tests/
└─ utils/
```

## 6. 入力契約

Schema Versionは `astera.quality-completion.request.v1` とする。最低限、次を必須とする。

- `evaluation_id`
- `project_id`
- `target.candidate_id`
- `target.artifact_type`
- `target.content`
- `target.content_hash`
- `requirements`
- `evaluation_config.rubric_version`
- `evaluation_config.blocking_rule_version`

実装済み・Test済み・本番利用可能などを宣言する場合は、Repository、Commit SHA、Path、Test Command、Exit Code、実行日時、実行環境、Artifact Hash等の証拠を追加要求する。

## 7. Artifact Type

- `design`
- `implementation`
- `test_result`
- `operation_document`
- `research`
- `incident_resolution`
- `knowledge_document`
- `configuration`
- `other`

Artifact TypeごとにProfileを切り替えるが、最終スコアは品質と完成度の2つだけとする。

## 8. 採点軸

### 品質

- Requirement Accuracy: 30
- Technical Accuracy: 25
- Logical Consistency: 20
- Clarity / Precision: 15
- Boundary Control: 10

### 完成度

- Requirement Coverage: 30
- Artifact Completion: 25
- Verification Completion: 20
- Operation / Recovery: 15
- Documentation / Handoff: 10

各Criterionは0〜5点で評価し、Weightを掛けて100点へ正規化する。

## 9. Blocking

次の代表条件は点数に関係なくKB掲載候補を停止する。

- 必須Requirement未達
- 固定仕様・根本指示との矛盾
- 完了宣言に必要なEvidence不足
- Evidence Hash・Repository参照不整合
- 重大技術エラー
- Secret・Token・Password・秘密鍵混入
- 目的不一致
- 境界違反
- Test失敗状態で完成宣言
- 必須Criterion未評価

## 10. 出力

結果Schemaは `astera.quality-completion.result.v1` とし、次を返す。

- `status`
- `evaluation_complete`
- `scores.quality`
- `scores.completion`
- `scores.minimum`
- Criterion別内訳
- Requirement集計
- Evidence集計
- Blocking一覧
- `judgment.kb_eligible`
- 修正理由
- 合格時のみKB Record候補

## 11. KB System連携

KB保存はAdapterだけが担当する。Evaluator本体はKB DBへ接続しない。

- `createInMemoryKbAdapter`: Test用
- `createHttpKbSystemAdapter`: 正式KB API接続用
- Idempotency Keyにより重複登録を防止

## 12. 検証結果

現行 `astera_v8` 構造へ加工後、次を確認済み。

- JavaScript構文確認: 合格
- JSON Parse: 20件合格
- Shell構文確認: 合格
- Unit / Boundary / Integration / Regression: 18 passed / 0 failed
- CLI STDIN: 合格
- 95/95境界: 合格
- 94.99/100: 不合格
- Blocking優先: 合格
- Content Hash不一致: `INVALID_INPUT`
- Local Git Commit / Path / Hash実在確認: 合格
- KB Adapter・Idempotency: 合格
- 同一入力の再現性: 合格
- 仮ASTERA Rootへの `src/quality-completion-evaluator` 配置: 合格
- Smoke: `KB_ELIGIBLE`、品質100、完成度100

Docker Engineが検証環境に存在しないため、単体Docker Buildだけは未実施である。ASTERA本体のDockerfileは `src/` をコピーするため、配置包含は成立している。
