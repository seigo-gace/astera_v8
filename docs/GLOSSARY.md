# Astera v8 Glossary

| Term | Meaning |
|---|---|
| Astera v8 | 固定RuleとScriptで判断材料を生成する非AI Runtime |
| Multi-Perspective Cognition Runtime | 複数観点の検査工程を順序実行し、判断可能な構造へ変換する実行基盤 |
| Main AI / 主役AI | Asteraの材料を受け、必要な場合に最終回答を生成する外部AI |
| Judgment Material | 01〜08の構造化された判断材料 |
| 8段 | 本当の目的から主役AIへの再指示までの固定出力順 |
| 5本柱 | Fact / Risk / Multi / Inquiry / Compare |
| Lens | 分野固有のRisk、Evidence、Safety、比較観点 |
| Primary Lens | `G01`〜`G38`から選ばれる主Lens |
| Secondary Lens | Primaryを補助する候補。最大3件 |
| Overlay | Legal、Medical、Current、Evidence、Safetyの追加確認 |
| Taxonomy | Lens分類体系。現行Versionは`1.0.0` |
| Human Reader | 急ぎ、怒り、混乱、精度要求等を固定Ruleで検出する工程 |
| Dialectic | 主案、悪手、反対案、第三案、人読み適合案を候補化する工程 |
| Evidence | 事実、Source、Test、Repository、Artifact等の裏付け |
| Evidence gap | 必要だが確認できていない根拠 |
| clarification | 重大な前提不足により追加情報を要求する状態 |
| Optional LLM Adapter | 外部LLMを必要な場合だけ接続する境界。Core必須ではない |
| Quality Completion Evaluator | 成果物の品質・完成度・Blockingを固定Rule評価する独立Module |
| Artifact Profile | 設計、実装、Test、運用等の成果物種別 |
| Blocking | 点数に関係なく合格候補化を止める条件 |
| KB_ELIGIBLE | KB掲載可能判定。保存済みではない |
| Astera App | UI、Account、認証、Plan、Square、Creditを所有する別System |
| Webhook Gateway | 外部Webhookの受信・検証・保存・配送・再送を行う別System |
| ASTERA-KB | Knowledge保存・検索を行う別System |
| TGserver | Secret除去済みSystem Logの送信先 |
| Outbox | TGserver未送信Eventだけを一時保持する領域 |
| Legacy compatibility | 現行Codeに残るがCore完成責務ではない互換機能 |
| Migration debt | Tenant、Stripe、旧名称等、分離・整理が必要な残存実装 |
| `kagura-*` | 内部に残る旧名称。Public InterfaceはAstera v8 |
| Google V8 | Node.jsが利用するJavaScript Engine |
| Worker Threads | 独立処理を別Workerで実行するNode.js機構 |
