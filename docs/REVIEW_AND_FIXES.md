# Astera v8 v1.1.1 レビュー改善表

## 結論

提示原稿は構想として強いが、そのまま「完成」と扱うには危険な記述があった。v1.0.1では、誇張を削り、起動・安全・仕様整合・テスト範囲を強化した。

## 改善した項目

| No | 原稿/前回版の問題 | v1.0.1での改善 |
|---:|---|---|
| 1 | 「5本柱をすべて並列」と読める | `Fact/Risk/Inquiry`は並列、`Multi/Compare`は依存関係ありの逐次に統一 |
| 2 | `node:sqlite`を安定版のように記載 | `node:sqlite`が使えない環境に備え、JSON fallback付きStoreに変更 |
| 3 | APIキー例にヘッダー欠落があった | 全curl例に `X-API-Key` と `Content-Type` を明記 |
| 4 | Stripe webhook検証が抽象的 | raw Buffer + `Stripe-Signature` + `STRIPE_WEBHOOK_SECRET` のHMAC検証を実装 |
| 5 | Stripe署名が複数`v1`に弱い | 複数`v1`署名を配列として扱い、いずれか一致で通す構造に修正 |
| 6 | raw bodyを文字列連結していた | Stripe検証用bodyはBufferのまま保持する構造に修正 |
| 7 | 不正JSONが500になり得た | `parseJsonStrict`で400エラー化 |
| 8 | Worker固着時の復旧が弱い | Worker timeoutと自動再spawnを実装 |
| 9 | 外部LLM API待ちで固まる余地 | LLM fetch timeoutを実装 |
| 10 | ログ漏洩リスク | secret/apiKey/token/password/stripe系キーとsecret値パターンをマスク |
| 11 | BYOKの保存方針が曖昧 | リクエストのLLMキーは保存しない。ログにもマスクして残す |
| 12 | 未知LLM providerの扱い | `KeyVault`で未知providerを除去し、Null fallbackを維持 |
| 13 | RateLimiterのMap肥大化 | bucket pruneを追加 |
| 14 | `port:0`テストができない | `options.port ?? 7373`へ修正 |
| 15 | answer線距離が仕様だけで実体なし | `compare-worker.js` に `answer_line_distance = 100 - score` として実装 |
| 16 | 7つの図が省略されがち | `ARCHITECTURE.md` に原型を残して統合 |
| 17 | 検証が薄い | engine/API/security/Stripe署名テストとsmoke testを追加 |

## 最終判定

旧KAGURA v1.0.1は「思想ドキュメント」ではなく、ゼロnpm依存で起動・テストできるランタイム一式になった。ただし、商用公開前にはHTTPS、法務文書、Stripe本番Webhook、監査ログ、DB移行計画を必ず詰める。
