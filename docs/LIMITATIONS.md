# Astera v8 Known Limitations

## 1. 保証しないもの

- 外部情報の最新性・正確性
- 医療、法律、税務、投資等の専門判断
- 主役AIが生成する最終回答の完全性
- `KB_ELIGIBLE`後のKB保存
- 未実装の外部System接続

## 2. 現行実装の制限

- Rate LimiterはProcess内Memory Mapで、複数Replica間共有ではない
- Application状態はSQLiteまたはFallback Storeを使用する
- Evaluator APIは本体と別Process・別Port
- RootのDocker ComposeはEvaluator APIを自動起動しない
- 判断材料生成用の汎用Webhookはない
- `clarification_needed`はHTTP 200 Textで、専用JSON Fieldはない
- Tenant Keyの失効、再発行、Rotation専用公開Endpointはない
- `Retry-After` Headerは返さず、429 Bodyの`rate.resetAt`を使う
- 外部検索・一次情報取得はAstera本体の保証範囲外
- ASTERA-KB接続は未実装

## 3. 運用制限

- 本番常駐はDocker Composeのみ
- `node start.js`、`npm start`は短時間検証用
- HTTPS終端、CORS、Secret注入、Backup、監視は運用側で設定
- TGserver停止中のLogはOutboxへ一時保持し、長期正本にしない
- `ASTERA_SKILL_API_KEY`をBrowserや一般利用者へ配布しない

## 4. 商用条件として確定していない項目

RuntimeにはFree / Pro / BusinessのRate LimitとStripe接続境界がありますが、次は本Repositoryの実装文書だけでは確定しません。

- 公開価格
- Credit付与量と減算単位
- 有料検索APIの追加減算
- 未使用Credit、有効期限、天井設定
- 解約、返金
- 利用規約
- Privacy Policy
- 特定商取引法表記
- Acceptable Use Policy

確定前に旧文書や例示価格を公開仕様として転記しません。

## 5. 検証環境依存

- Docker Engineがない環境ではImage BuildとCompose起動を検証できない
- Stripe、TGserver、Cloudflare、外部LLMは実Credentialと接続環境が必要
- GitHub Actionsの過去成功は現在SHAの検証を自動的に意味しない

## 6. 変更時の原則

制限を解消した場合は、Code、Test、`STRUCTURE.md`、`docs/API_REFERENCE.md`、本書、`RELEASE_MANIFEST.txt`を同じ作業Blockで同期します。
