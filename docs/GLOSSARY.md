# Astera v8 Glossary

| 用語 | 意味 |
|---|---|
| 主役AI | 最終回答を作るChatGPT、Claude、Gemini、自作AI等 |
| Astera | 主役AIの外側で判断材料を生成するRuntime |
| Cognition Runtime | 問いを分類・検査・比較し、判断可能な形へ実行変換する基盤 |
| Judgment Material | 主役AIや利用者へ渡す8段の判断材料 |
| Judgment Capsule | 8段の判断材料を一まとまりとして扱う説明上の名称 |
| 5本柱 | Fact / Risk / Multi / Inquiry / Compare |
| 8段 | 本当の目的から主役AIへの再指示までの固定出力順 |
| Lens | 分野ごとに重点確認するRisk、Evidence、立場、比較軸 |
| Primary Lens | `G01`〜`G38`から選ばれる主Lens |
| Secondary Lens | Primaryを補助する上位候補。最大3件 |
| Overlay | Legal、Medical、Current、Evidence Strict、Safety Abuseの追加検査 |
| Taxonomy | 情報を分類する体系。現行Lens Versionは`1.0.0` |
| Anchor Path | 将来ASTERA-KBの完全4階層Pathへ接続する検証Path |
| Human Reader | 急ぎ、怒り、混乱、精度要求等を固定Ruleで検出する処理 |
| Dialectic | 主案、悪手、反対案、第三案等を比較する候補生成 |
| clarification_needed | 5本柱実行前に重大な前提不足を返す状態 |
| Evidence | 事実・Test・Repository・Artifact等を裏付ける検証情報 |
| Evidence gap | 必要だが確認できていない根拠 |
| QualityCompletionEvaluator | 成果物の品質と完成度を別々に固定Rule採点するModule |
| Artifact Profile | 設計、実装、Test結果等の成果物種別 |
| Blocking | 点数に関係なく掲載候補化を止める重大条件 |
| KB_ELIGIBLE | KB掲載条件を満たす判定。保存済みではない |
| Tenant Key | 一般利用者を識別しRate Limit・使用量を適用するKey |
| Skill PRIVATE Key | 所有者のアプリGPT専用Key |
| TGserver | Secret除去済み構造化Logの送信先 |
| Outbox | TGserver未送信中だけ保持する一時状態 |
| Google V8 | Node.jsが使用するJavaScript実行Engine |
| Worker Threads | 5本柱の一部を分離・並列実行するNode.js機構 |
