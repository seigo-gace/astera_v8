# ASTERA統合契約

## 呼出位置

ASTERAが成果物と既存解析結果を確定した後、KB登録前に呼び出します。

ASTERA処理結果確定

→ Evaluation Packet生成

→ QualityCompletionEvaluator.evaluate

→ KB_ELIGIBLE時だけ既存KB System Adapterへ渡す

## 禁止

- EvaluatorがASTERAの成果物を修正する  
- EvaluatorがRepositoryへ書き込む  
- EvaluatorがKB DBへ直接接続する  
- 平均点で合格させる  
- 未確認情報を`fulfilled`へ補完する

## 既存ASTERA解析から渡す値

- `technical_checks`  
- `logical_checks`  
- `contradictions`  
- `ambiguities`  
- `boundary_checks`  
- `boundary_violations`  
- `purpose_mismatch`  
- Requirementごとの`fulfillment`

これらは新しいAI判断ではなく、ASTERAが既に取得・判定した事実を構造化して渡す入力です。  

## 現行 `astera_v8` への適用

- 配置先は `src/quality-completion-evaluator` とする。
- `src/server.js` の既存 `/process` 契約は変更しない。
- `src/kagura-engine.js` の認知処理へ自動挿入しない。
- 現行ASTERAではKB連携が未実装のため、`evaluateAndPublish` は正式なKB System Adapterが接続された処理からのみ使用する。
- 本Module追加だけでKBへ自動掲載された状態とは扱わない。
