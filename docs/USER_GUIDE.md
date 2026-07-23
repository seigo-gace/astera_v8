# Astera v8 User Guide

## 1. Asteraを使う位置

```text
利用者の問い
  → Astera
  → 8段の判断材料
  → 主役AI
  → 最終回答
```

Asteraは主役AIではありません。ChatGPT、Claude、Gemini、自作AI等へ渡す前の材料を整えます。

## 2. 良い入力

次の4点を含めます。

- 目的: 何を決めるか
- 対象: 誰・何に対する判断か
- 成功条件: 何を満たせばよいか
- 制約: 予算、期限、禁止事項、技術条件

例:

```text
既存Node.js APIを段階移行する判断材料を作る。
対象は稼働中の利用者向けAPI。
成功条件は互換性維持、停止時間なし、Rollback可能。
制約は3core/4GB、外部npm依存を増やさない。
```

## 3. 8段の読み方

1. 01で目的が自分の意図と一致するか確認
2. 02の不足前提を埋める
3. 03の推測・未確認を事実として扱わない
4. 04の重大Riskを先に潰す
5. 05の反論に耐えられるか確認
6. 06で主案と代替案を比較
7. 07の推奨条件を確認
8. 08を主役AIへ渡す

## 4. 主役AIへ渡す

最小手順:

1. Asteraの出力全文をCopy
2. 主役AIへ貼り付け
3. 「以下の判断材料を守り、最終回答を作成してください」と指示
4. 重要な未確認事項はWeb検索、一次資料、専門家確認を別途行う

## 5. 利用経路の使い分け

| 経路 | 用途 | 現行状態 |
|---|---|---|
| Copy & Paste | 個人が最短で使う | 利用可能 |
| Web UI | Browserから試す | 最小UIあり |
| `/process` | App、CLI、System連携 | 利用可能 |
| `/v1/skill/process` | 所有者のアプリGPT Skill | PRIVATE Keyで利用可能 |
| `/v1/evaluate` | 成果物の品質・完成度判定 | 別Processで利用可能 |
| 汎用Webhook | 判断材料生成の受信 | 未実装 |
| Stripe Webhook | 課金Event | `/billing/webhook`のみ |

汎用Webhookがあると誤解して`/billing/webhook`へ問いを送らないでください。

## 6. 利用者別

### 個人

Copy & PasteまたはWeb UIを使い、重要判断の見落としを減らします。

### チーム

同じ入力条件と8段出力を共有し、目的・前提・Risk・比較軸を揃えます。Tenant Keyを公開Chatへ貼りません。

### 開発者

`/process`をAppの内側から呼びます。BrowserへSecretを埋め込まず、App ServerをGateにします。

### 法人・運用者

HTTPS、CORS、Tenant分離、Rate Limit、TGserver、Backupを確認し、`docs/PRODUCTION_CHECKLIST.md`を満たしてから公開します。

## 7. よくある失敗

- 「いい案を出して」だけで目的・対象・成功条件がない
- 03の未確認情報を確定事実として使う
- 04のRiskを無視し、07だけ採用する
- 08を主役AIへ渡さずAstera出力だけで完結させる
- Skill Keyを公開Keyとして配布する
- `KB_ELIGIBLE`をKB保存済みと誤認する

## 8. 判断を確定してはいけない領域

医療、法律、税務、投資、Security Incident、最新仕様等は、Astera出力だけで確定しません。Overlayは確認を強めますが、外部事実の正しさや専門判断を保証しません。
