# Astera v8 — Public Document Pack

> **問いを星図に変える。**

このDirectoryは、Astera v8を一般利用者、技術者、協力者へ説明するための公開文書をまとめます。Repository内部のSecret、Credential、個人情報、運用Logは含めません。

## Astera v8とは

Astera v8はAIではありません。

問い、資料、検索結果、他Systemや他AIの出力を、目的、前提、事実、危険、反対視点、比較案、推奨判断、次工程へ整理する非AI Runtimeです。AIと組み合わせられますが、AI専用ではなく、人間、Application、API、MCP、業務Systemからも利用できます。

## 公開説明の中心

- 38 Domain Lens
- Fact / Risk / Multi / Inquiry / Compare
- Human Reader
- Dialectic候補競争
- 01〜08 Judgment Material
- Model-independent / Optional LLM
- 独立Quality Completion Evaluator
- CoreとApp・Commerce・Gateway・Loggingの責務分離

## 収録物

- `BRAND_PHILOSOPHY.md`: 名称、思想、タグライン
- `PRESS_KIT.md`: 紹介文、掲載用要約、表現境界
- `LP_COPY.md`: Landing Page向け本文構成
- `FULL_DOCUMENT.md`: 一般・技術をつなぐ全体説明
- `USER_GUIDE.md`: 利用手順
- `FAQ.md`: 誤解しやすい点
- `LIMITATIONS.md`: 保証外、既知Defect、未検証
- `DOCUMENTATION_AUDIT_2026-08-03.md`: 今回の全面同期記録

## 公開時の禁止表現

- Asteraを生成AI、会話AI、AI Agentと呼ぶ
- AIがなければ使えないと説明する
- 外部情報の真偽や最新性を保証すると説明する
- Account、Square、Credit、Stripe Legacy CodeをAstera Core機能として混在させる
- `KB_ELIGIBLE`をKB保存済みと説明する
- 未実装・未検証・将来構想を提供中機能として書く
- 医療、法律、投資等の専門判断を代替すると説明する

## 正本の優先順位

1. 現行Code / Schema / Test
2. `STRUCTURE.md`
3. `docs/API_REFERENCE.md`
4. `docs/LENS_GENRE_INDEX.md`
5. 公開説明文書

公開文書と実装が矛盾する場合は、宣伝文で実装事実を上書きせず、差異を明示して修正対象にします。
