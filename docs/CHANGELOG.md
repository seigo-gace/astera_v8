# Astera v8 Changelog

この文書はAstera全体の変更履歴です。QualityCompletionEvaluator単体の履歴は`src/quality-completion-evaluator/CHANGELOG.md`を参照してください。

## Unreleased

- 公開・利用者・開発者・運用者向けDocument導線を追加
- Quick Start、User Guide、FAQ、Troubleshooting、Glossary、Known Limitationsを追加
- API Referenceを現行Endpoint、上限、Status、再試行、認証方式へ同期
- `FULL_DOCUMENT.md`の欠番と旧構成を解消
- Public Document Packを現行38 Lens、5 Overlay、8段、Evaluatorへ同期
- `RELEASE_MANIFEST.txt`へ稼働中のSkill認証・Evaluator API・追加Documentを反映

## 1.1.1

- 38専門ジャンルLensと5 Overlay
- 5本柱から01〜08の判断材料生成
- Human ReaderとDialectic候補
- Tenant認証、Plan別Rate Limit、使用量計測
- Skill PRIVATE Process API
- QualityCompletionEvaluatorの一般・Skill API
- TGserver Log配送と未送信Outbox
- Stripe Checkout / Webhook境界
- Docker Compose本番運用

## QualityCompletionEvaluator 1.0.0

- 品質と完成度の個別100点採点
- 両方95点以上、Blocking 0のAdmission Gate
- Requirement、Evidence、Domain Lens固定Rule
- KB Adapter境界とIdempotency
- Unit、Boundary、Integration、Regression Test

## 変更記録ルール

- 予定だけの機能を実装済みに書かない
- Test件数を固定値で維持せず、実行結果へ結び付ける
- 破壊的なAPI変更はPathまたはSchema Versionを上げる
- Secret、価格ID、Tokenを記録しない
