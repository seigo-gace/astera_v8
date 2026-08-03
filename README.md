# Astera v8 — Multi-Perspective Cognition Runtime

> **問いを星図に変える。**
>
> Astera v8は、AIではありません。固定Rule・Script・検証工程で、問い・資料・検索結果・他Systemの出力を、判断に使える8段の材料へ再構成する非AI Runtimeです。

## Repository status

- Repository: private development repository
- Runtime: Node.js / Google V8
- Core dependency: Node.js標準機能中心
- Public interfaces and names are preserved
- Account、認証、決済、Credit、財務DBはAstera v8 Coreの責務ではありません
- Repository内のTenant・Stripe関連Codeは、現行実装に残る移行対象です。現在の製品責務として宣伝しません

## Astera v8が行うこと

Astera v8は、入力をそのままAIへ渡したり、ひとつの答えへ急いでまとめたりしません。

```text
Input
  → Normalize
  → Inquiry preflight
  → G01〜G38 Domain Lens
  → Fact / Risk / Inquiry
  → Multi / Human Reader / Dialectic
  → Compare
  → 01〜08 Judgment Material
  → Human / Application / Main AI
```

入力元はAIに限定されません。人間、Web Form、CLI、業務System、API、MCP、検索結果、文書、他AIの出力などを受け取れます。Astera単体の固定Rule処理だけでも実行でき、外部LLMは任意のAdapterです。

## 8段の判断材料

1. **01 本当の目的**
2. **02 前提不足**
3. **03 事実確認**
4. **04 危機察知**
5. **05 反対視点**
6. **06 比較案**
7. **07 推奨判断**
8. **08 主役AIへの再指示**

08はAI接続時に使う再指示です。AIを使わない利用経路では、01〜07を人間または別Systemの判断材料として使用できます。

## 現行Core

- **38 Domain Lens**: `G01`〜`G38`からPrimaryを決定論的に選択し、SecondaryとOverlayを付加
- **5本柱**: Fact / Risk / Multi / Inquiry / Compare
- **Human Reader**: 急ぎ、怒り、混乱、精度要求、Scope圧力等を固定Ruleで検出
- **Dialectic**: 主案、悪手、反対案、第三案、人読み適合案を候補化
- **Worker Threads**: 独立処理と順序依存処理を分離
- **Safety Overlay**: 法律、医療、現在情報、厳格Evidence、不正利用Risk
- **Structured Logging**: Secret除去済みEventをTGserverへ配送し、未送信分だけOutboxへ一時保持

## 独立Module

`src/quality-completion-evaluator`は、成果物の品質と完成度を固定Ruleで評価する独立Moduleです。

- Runtime `/process`へ自動挿入しない
- 成果物を自動修正しない
- `KB_ELIGIBLE`は掲載可能判定であり、KB保存完了ではない
- Domain Lensは本体と同じCatalog / Routerを参照する
- `KB-HB-016`とRegistryの不一致は、現行Code上の既知Defectとして扱う

## Astera全体での責務分離

```text
Astera App / Account / Commerce
  ├─ UI、Account、認証、Plan、Square、Credit
  └─ 利用者との契約・決済・残高管理

Astera v8
  ├─ Input整形、分類、検査、比較
  └─ 8段の判断材料生成

Webhook Gateway
  └─ 外部Event受信、検証、保存、配送、再送

TGserver
  └─ Secret除去済みSystem Logの集約
```

## 起動と検証

短時間の開発検証:

```bash
npm test
bash scripts/smoke.sh
npm run verify
npm start
```

本番常駐:

```bash
docker compose up -d --build
```

既定Health endpoint:

```text
http://127.0.0.1:7373/healthz
```

## Documentation

### 最初に読む

- `docs/DOCUMENTATION_INDEX.md`
- `docs/QUICK_START.md`
- `docs/USER_GUIDE.md`
- `docs/FAQ.md`

### 仕様・構造

- `STRUCTURE.md`
- `docs/ARCHITECTURE.md`
- `docs/API_REFERENCE.md`
- `docs/LENS_GENRE_INDEX.md`
- `docs/DOMAIN_TEMPLATE_CATALOG.md`
- `docs/HYPERION_PCE_INTEGRATION.md`

### 公開説明

- `docs/README_PUBLIC.md`
- `docs/PRESS_KIT.md`
- `docs/LP_COPY.md`
- `docs/BRAND_PHILOSOPHY.md`

### 制限・運用

- `docs/LIMITATIONS.md`
- `docs/SECURITY_NOTES.md`
- `docs/DEPLOYMENT_VPS.md`
- `docs/PRODUCTION_CHECKLIST.md`
- `docs/TROUBLESHOOTING.md`

## Documentation truth rules

1. 実装済み、設計確定、将来構想を混在させない。
2. Core責務と周辺System責務を混在させない。
3. Repositoryに残るLegacy Codeを現行製品機能として宣伝しない。
4. Test未実行・外部接続未検証を完成扱いしない。
5. 料金・Credit・法務はAstera App側の最新正本を参照し、本Repositoryへ重複保持しない。
