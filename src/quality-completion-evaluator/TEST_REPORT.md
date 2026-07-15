# 検証報告書

## 検証日

2026-07-15

## 実行環境

- GitHub Actions: Ubuntu 24.04
- Node.js: 22
- 外部npm依存: なし
- 対象Repository: `seigo-gace/astera_v8`

## 検証対象

- Astera v8通常版Runtime
- `src/quality-completion-evaluator`
- 共通`G01`〜`G38` Lens
- 5本柱・8段判断材料へのLens反映
- 品質・完成度判定へのLens反映
- Lens固有Evidence確認とBlocking
- HTTP Smoke Test

## 実行結果

| 検証 | 結果 |
| :---- | :---- |
| Root Runtime Test | 合格 |
| QualityCompletionEvaluator Test | 合格 |
| GitHub Actions `Astera Runtime Tests` | 合格 |
| GitHub Actions `Astera Verify` | 合格 |
| `npm run verify` | 合格 |
| HTTP Smoke Test | 合格 |
| 38 Genre固定ID・決定性 | 合格 |
| 空Inputの誤分類防止 | 合格 |
| 短いASCII語の部分一致誤発火防止 | 合格 |
| Overlay選択 | 合格 |
| 通常版と判定Moduleの同一Catalog参照 | 合格 |
| Lens未指定時の同一Router補完 | 合格 |
| 不正Genre ID拒否 | 合格 |
| `enforce=true`で確認不足時の`KB-HB-016` Blocking | 合格 |
| 偽Evidence参照の拒否 | 合格 |
| `VALID` Evidence接続時のBlocking解除 | 合格 |
| KB RecordへのTaxonomy保持 | 合格 |
| 同一入力の採点再現性 | 合格 |

## 実例をLensへ通した判定検証

通常版`routeDomainTemplates`へ例題を入力し、選択されたLens ID、Taxonomy Version、Anchor PathをQualityCompletionEvaluatorへ渡して実判定しました。

| 例題 | 選択Lens | 追加確認 | 判定Moduleで確認した項目 | 結果 |
| :---- | :---- | :---- | :---- | :---- |
| 高齢者の強い胸痛と冷や汗 | `G23` 医学・健康・薬学・医療 | `medical_safety` | `受診遅延` | 合格 |
| Node.js APIの無停止・互換性維持移行 | `G29` IT・Computer・System・Application開発 | なし | `API契約` | 合格 |
| 重大CVEの当日対策と恒久対策 | `G31` Cybersecurity・Privacy・暗号 | `current_information` | `CVE一次情報` | 合格 |
| 前払いCreditの売上・返金・失効 | `G11` 金融・会計・税務・保険 | なし | `返金負債` | 合格 |
| 初心者向けベランダ家庭園芸 | `G38` 家庭・生活・Personal・Hobby | なし | `環境条件` | 合格 |

各例題で次を確認しました。

1. 通常版Routerが期待する`Gxx`を選択する。
2. 該当時はOverlayを追加する。
3. 同じTaxonomy VersionとAnchor Pathを判定Moduleへ渡す。
4. Lens固有RiskまたはEvidence項目が評価Resultへ残る。
5. 評価対象が通常の品質・完成度条件を満たす場合は`KB_ELIGIBLE`になる。
6. Lensを強制した状態で確認が不足する場合は`KB-HB-016`で掲載を止める。

## デバッグ記録

初回の`Astera Verify`では、Lens本体と判定ModuleのTestは通過しましたが、HTTP Smoke Testが失敗しました。

原因は`scripts/smoke.sh`が旧Lens名`Marketing / Growth / Brand`を期待していた一方、現行38 Genreでは`G10 Business・経営・Marketing・Entrepreneurship`を返すためです。

Smoke Testの期待値を現行`G10`へ修正し、再実行後は次の2 Workflowがともに合格しました。

- `Astera Runtime Tests`
- `Astera Verify`

## 判定

共通Lensは通常版RuntimeとQualityCompletionEvaluatorで同じ正本を参照し、実例入力から判定結果まで接続されています。

ただし、`enforce=false`はLens情報を評価へ付与する運用です。Lens固有Risk・Evidence・Safety確認をKB掲載の必須条件にする処理では、Evaluation Packetへ`enforce=true`と検証済みEvidenceを渡す必要があります。
