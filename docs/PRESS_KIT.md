# Astera v8 — Press Kit

## 正式名称

**Astera v8 — Multi-Perspective Cognition Runtime**

## タグライン

**問いを星図に変える。**

## 1行説明

**Astera v8は、主役AIを置き換えず、38専門ジャンルLensと5本柱で問いを8段の判断材料へ変換する外付け判断材料生成レイヤーです。**

## 短い紹介

Astera v8は、ChatGPT、Claude、Gemini、自作AI等の外側で動き、目的、前提、事実、Risk、反対視点、比較案、推奨判断、再指示を整理します。

## English

**Astera v8 is an external judgment-material generation layer that strengthens a primary AI without replacing it.**

## 解決する問題

- 表面的な依頼だけに答えて本当の目的を外す
- 前提不足のまま、それらしい回答を作る
- 事実と推測を混同する
- Riskと反対視点を見落とす
- 複数案を比較せず一案へ飛びつく
- 最終回答へ反映できる再指示がない

## 現行構成

- 38専門ジャンルLens
- 5 Overlay
- Fact / Risk / Multi / Inquiry / Compare
- 01〜08 Judgment Material
- QualityCompletionEvaluator
- 一般Tenant API / Skill PRIVATE API

## 重要な表現上の境界

- AsteraをAI本体と表現しない
- 外部情報の正しさを保証すると表現しない
- 医療・法律等の専門判断を代替すると表現しない
- `KB_ELIGIBLE`を掲載済みと表現しない
- 未確定の料金・Credit・法務条件を確定仕様として掲載しない

## 正本

技術仕様は`STRUCTURE.md`、`docs/API_REFERENCE.md`、`docs/LENS_GENRE_INDEX.md`を参照してください。
