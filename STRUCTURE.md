# Astera v8 — Structure and Responsibility Map

## 1. Core purpose

Astera v8は、入力を分類・検査・比較し、01〜08の判断材料へ変換する非AI Runtimeです。

Coreが所有する責務:

- Input normalization
- Inquiry preflight
- `G01`〜`G38` Domain Lens選択
- Fact / Risk / Inquiry / Multi / Dialectic / Compare
- Human Reader
- 8段の判断材料生成
- 任意LLM Adapter境界
- Secret除去済みRuntime Log生成
- 独立Quality Completion Evaluatorへの明示呼出し境界

Coreが所有しない責務:

- Account、Login、Passkey、2FA
- Plan、Square決済、Credit残高、返金
- 財務DB、個人情報DB
- Webhook Gateway
- Knowledge Base保存
- 主役AIまたは最終意思決定
- 外部情報の取得・正しさの保証

## 2. 現行Repositoryと完成責務の差異

現行Repositoryには`src/auth`、`src/billing`、`src/store`、Tenant Key、Stripe Endpointが残っています。これは現行Codeの事実ですが、Astera v8 Coreの確定責務ではありません。

```text
現行Codeに存在する
  ≠ Coreが今後も所有する
  ≠ 公開製品機能として宣伝してよい
```

移行完了までは、API Referenceで「Legacy compatibility / migration debt」と明示し、Core説明から分離します。

## 3. Runtime flow

```text
Input
  → Normalizer
  → Inquiry preflight
      ├─ 重大な前提不足: clarification
      └─ 続行
          → Domain Router
          → Fact / Risk / Inquiry（並列可能領域）
          → Multi
          → Human Reader / Dialectic
          → Compare
          → 01〜08 Judgment Material
          → Optional LLM Adapter
```

## 4. Directory map

```text
astera_v8/
├── README.md
├── STRUCTURE.md
├── start.js
├── src/
│   ├── server.js
│   ├── kagura-engine.js                # 内部Legacy名。Public名はAstera v8
│   ├── all-domain-lens-catalog.js
│   ├── domain-template-router.js
│   ├── hyperion-human-reader.js
│   ├── mood-detector.js
│   ├── worker-pool.js
│   ├── pillars/
│   │   ├── fact-worker.js
│   │   ├── risk-worker.js
│   │   ├── inquiry-worker.js
│   │   ├── multi-worker.js
│   │   ├── dialectic-worker.js
│   │   ├── compare-worker.js
│   │   └── pool-runner.js
│   ├── llm/                            # Optional boundary
│   ├── logger.js
│   ├── logging/
│   ├── quality-completion-evaluator/   # Independent module
│   ├── auth/                           # Legacy compatibility / migration debt
│   ├── billing/                        # Legacy Stripe boundary / migration debt
│   ├── guard/                          # Legacy tenant rate policy
│   ├── store/                          # Legacy application state
│   └── public/
├── test/
├── scripts/
├── deploy/
├── docs/
└── archive/                            # 歴史資料。現行仕様の根拠にしない
```

## 5. Dependency direction

```text
server
  → cognition engine
      → domain router
          → lens catalog
      → worker pool
          → pillars
      → optional llm adapters
      → logger
          → TGserver client / outbox

explicit evaluator caller
  → quality-completion-evaluator
      → shared domain router / catalog
      → artifact profile
      → requirement / evidence / blocking rules
      → optional KB adapter only when explicitly requested
```

禁止する依存:

- Lens CatalogからRuntime、KB、Billingへの逆依存
- Pillar内での独自再分類
- Evaluatorから本体ServerやKB DBへの暗黙依存
- RuntimeからAccount / Commerce DBへの直接所有
- TGserverからAstera内部ModuleへのImport
- Public docsからLegacy実装をCore機能へ格上げすること

## 6. Module responsibilities

| Module | Responsibility |
|---|---|
| `server` | HTTP受付、Input上限、Routing、Response |
| `kagura-engine` | 現行内部Composition名。5本柱・Dialectic・Compare・8段の順序統合 |
| `domain-template-router` | 正規化、決定論的Score、Primary / Secondary / Overlay |
| `all-domain-lens-catalog` | `G01`〜`G38`の固定定義 |
| `worker-pool` | Worker lifecycle、timeout、再生成 |
| `pillars/*` | 選択済みLensを使う各検査工程 |
| `hyperion-human-reader` | 利用者状態信号の固定Rule検出 |
| `llm/*` | 任意Provider Adapter。Core必須ではない |
| `logger` / `logging/*` | Secret除去、TGserver配送、一時Outbox |
| `quality-completion-evaluator` | 品質・完成度・Blocking判定。自動修正・自動保存はしない |
| `auth` / `billing` / `store` | 現行互換Code。Core外へ移管する対象 |

## 7. Lens contract

- 同一Input・同一Taxonomy Versionは同じ分類順を返す。
- Primaryは1件、Secondaryは最大3件、Overlayは必要分だけ。
- 空Inputは分類しない。
- 短いASCII語は単語境界で照合する。
- `other`、`unknown`、`unclassified`等を固定Genre IDとして作らない。
- ASTERA-KBの完全Pathは、外部KBが返した場合だけ接続する。存在しない結果を装わない。

## 8. Evaluator contract

- Runtimeとは独立して呼び出す。
- 品質と完成度を別々に採点する。
- `KB_ELIGIBLE`は保存済みを意味しない。
- `domain_lens.enforce=true`時だけLens固有未確認をBlockingへ反映する。
- 現行`KB-HB-016`とRule Registryの不一致は未解消Defectであり、検証結果へ明示する。

## 9. Operation boundary

- 本番常駐はDocker / Docker Compose。
- Node直接起動は短時間検証だけ。
- Secret、個人情報、入力本文を無条件にLogへ保存しない。
- TGserver未送信EventだけをOutboxへ保持する。
- Account、決済、Credit、法務の正本はAstera App / Commerce側に置く。
