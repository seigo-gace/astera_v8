# Astera v8 — User Guide

## 1. Asteraを使う位置

```text
Question / Document / Search result / System output
  → Astera v8
  → 8段の判断材料
  → Human / Application / Main AI
```

AsteraはAIではなく、AI専用でもありません。

## 2. 良い入力

最低限、次を含めます。

- 目的
- 対象
- 成功条件
- 制約
- 確定事実
- 未確認事項

Example:

```text
稼働中のNode.js APIを停止せず段階移行する判断材料を作る。
成功条件は互換性維持、Rollback可能、既存利用者への影響なし。
制約は3core/4GB、外部npm依存を増やさない。
未確認は現在のPeak request数。
```

## 3. 8段の読み方

1. 01が本当の目的と一致するか
2. 02に重大な不足がないか
3. 03で事実と推測が分かれているか
4. 04の先行対策を実行したか
5. 05の反論に耐えられるか
6. 06を同じ比較軸で見たか
7. 07の条件を満たすか
8. AIを使う場合だけ08を再指示として渡す

## 4. AIを使わない場合

01〜07を、会議、設計、承認、レビュー、調査、運用判断の資料として利用します。08は無視して構いません。

## 5. AIを使う場合

1. Astera出力全文を渡す
2. 事実、未確認、Risk、禁止事項を保持させる
3. 08だけでなく01〜07も一緒に渡す
4. 最新情報や高Risk領域は一次Sourceまたは専門家で確認する

## 6. 利用経路

| Route | Use | Classification |
|---|---|---|
| Copy & Paste | 個人・会議・設計 | Public use |
| Web UI | Browser | Astera App responsibility |
| Core API | System integration | Astera v8 Core |
| MCP | Tool integration | Possible external route |
| Evaluator API | Artifact evaluation | Independent module |
| Webhook | Event input | Webhook Gateway responsibility |
| Account / Payment | Registration and commerce | Astera App / Commerce |

Repository内のSkill / Tenant / Stripe EndpointはLegacy compatibilityであり、新規一般利用の中心にしません。

## 7. Common mistakes

- AsteraをAIとして扱う
- AIが必須だと思う
- 02を無視して処理を続ける
- 03の未確認事項を確定事実に変える
- 04を無視して07だけ採用する
- 06の比較軸を変えて都合よく比較する
- `KB_ELIGIBLE`を保存済みと誤認する
- Account / Square / CreditをRuntimeへ直接実装する

## 8. High-risk fields

医療、法律、税務、投資、Security Incident、最新仕様はAstera出力だけで確定しません。Overlayは確認項目を増やしますが、外部事実や専門家判断を代替しません。
