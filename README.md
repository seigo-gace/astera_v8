# Astera v8 — Multi-Perspective Cognition Runtime

> **問いを星図に変える。**  
> 固定Rule・Script・検証工程によって、入力を「判断に使える材料」へ再構成する非生成AI型Runtime。

**個人設計・個人開発：Seigo (`seigo-gace`)**

## Astera v8とは

Astera v8は、会話AIや文章生成AIではありません。

問い、資料、検索結果、ほかのAIの出力を受け取り、目的、前提不足、事実、危機、反対視点、比較案、推奨判断、次の指示へ整理するためのRuntimeです。

AIを主役から外すのではなく、AIや人間が判断する前段に、固定Ruleで動く検査・比較・再構成層を置くことを目的にしています。

```text
Input
  → 分類・検査・比較
  → 不足／Risk／反対視点の抽出
  → 8段の判断材料
  → Human / Main AI
```

## このプロジェクトで示している開発力

Astera v8は、単一機能のToolではなく、複数の責務を壊さずにつなぐSystem設計の実例です。

- 曖昧な要求を、固定ID・固定Rule・責務境界へ落とし込む設計
- 38専門ジャンルLensを共有Catalogとして扱う分類構造
- Fact / Risk / Multi / Inquiry / Compareを分離した処理構造
- 並列化できる処理と、順序依存する処理の切り分け
- 通常処理と品質判定で同じ定義を参照する重複排除
- 推測で完成扱いせず、Blocking条件を残す品質Gate
- API、Tenant、Rate Limit、課金、LogをRuntime本体から分離する運用境界
- Unit / Integration / 実例Testをつないだ検証設計

## 8段の判断材料

1. **01 本当の目的**
2. **02 前提不足**
3. **03 事実確認**
4. **04 危機察知**
5. **05 反対視点**
6. **06 比較案**
7. **07 推奨判断**
8. **08 主役AIへの再指示**

出力を一つの長文にまとめず、用途の異なる判断材料として分離することで、利用者が根拠、Risk、比較、次工程を追えるようにしています。

## 主な設計要素

- **Node.js V8 / Worker Threads** — 独立処理を並列化
- **38専門ジャンルLens** — Primary / Secondary / Overlayを選択
- **決定論的分類** — 固定分類語、Score、Tie Break、Confidence
- **5本柱** — Fact / Risk / Multi / Inquiry / Compare
- **Safety Overlay** — 法律、医療、現在情報、根拠、不正利用Risk
- **Quality Completion Evaluator** — 完成条件とBlocking条件を固定Ruleで判定
- **Structured Logging** — Secret除去後の構造化Logと未送信Outbox
- **npm依存ゼロの中核** — Node.js標準機能を中心に構成

## Astera全体での位置

```text
Astera App
  └─ 利用者が入力・履歴・結果を扱う公開UI

Astera v8
  └─ 判断材料を生成・検査する中核Runtime

Webhook Gateway
  └─ 外部Eventを安全に受け、内部Serviceへ配送する境界
```

この3つは、画面、判断処理、外部連携を一つへ混在させず、それぞれを交換・検証できる単位に分けています。

## 公開MCPとの関係

現在公開準備を進めているMCPは、導入して試せるDownload型の公開作品です。

Astera v8はそれとは別に、より大きなSystemで要求整理、責務分離、品質Gate、運用境界まで設計・実装できることを示す開発実績として位置付けています。

## 処理経路

```text
Input
  → Normalize
  → G01〜G38分類
  → Primary / Secondary / Overlay
  → Fact / Risk / Multi / Inquiry / Compare
  → 01〜08判断材料
```

分類一覧と共有契約：

- `docs/LENS_GENRE_INDEX.md`
- `docs/DOMAIN_TEMPLATE_CATALOG.md`

実行時の正本：

- `src/all-domain-lens-catalog.js`
- `src/domain-template-router.js`

## 起動

```bash
docker compose up -d --build
```

```text
http://127.0.0.1:7373
```

## 検証

```bash
npm test
bash scripts/smoke.sh
npm run verify
```

主な検証対象：

- 38 Genreの選択と決定性
- 空Input・短語誤発火・Overlay
- 医療、Software移行、CVE、前払Credit、家庭園芸の実例
- 通常Routerと品質判定Moduleの共有Lens接続
- Evidence、Risk、Safety条件、Blocking結果
- GitHub Actions上のNode.js 22検証

未取得の情報や未完成の処理を、存在するものとして装わないことも受入条件に含めています。

## Documentation

- `docs/DOCUMENTATION_INDEX.md` — 利用者別入口
- `STRUCTURE.md` — 構成、依存方向、Module責務
- `docs/QUICK_START.md` — 起動と最短実行
- `docs/USER_GUIDE.md` — 8段出力の利用方法
- `docs/ARCHITECTURE.md` — Architecture
- `docs/API_REFERENCE.md` — API契約
- `docs/DOMAIN_TEMPLATE_CATALOG.md` — Lens実装と検証記録
- `docs/LIMITATIONS.md` — 保証外、未実装、運用制約
- `docs/PRODUCTION_CHECKLIST.md` — 本番確認
- `docs/SECURITY_NOTES.md` — Security境界

## Developer

Astera v8は、企画、要件整理、構造設計、実装指示、検証条件、改善判断までを一貫して組み立てた個人開発Projectです。

完成品だけでなく、**複雑な要求を分解し、責務と依存関係を整理し、検証可能なSystemへ変換する能力**を示すための開発実績でもあります。
