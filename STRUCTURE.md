# Astera v8 — STRUCTURE（構成図・絶対）

> LibralCore 第六原則: 本Projectの実装・配置はこの構成図に従う。

## 責務

Astera v8は、入力の意味判定、38専門ジャンル分類、固定Ruleによる5本柱処理、8段の判断材料生成を担当する。一般的な会話AIやKnowledge保存Systemではない。

- 分類・Lens正本: `src/all-domain-lens-catalog.js`
- 分類実行: `src/domain-template-router.js`
- Taxonomy Version: `1.0.0`
- Runtime分類: `G01`〜`G38`の専門ジャンルLens
- 判定Module Lens接続: `src/quality-completion-evaluator/domain-lens-resolver.js`
- 4階層連結: 各Genreの検証Anchor Pathを保持し、将来ASTERA-KBの完全Path結果へ接続する
- ログ永続正本: TGserver経由のTelegram
- ログ検索索引: TGserver配下のMeilisearch
- ログ送信失敗時の一時状態: `/home/admin1/logs/astera-v8/outbox`
- テナント・使用量・Stripe webhook冪等性: `/data/astera.db`（Application状態。ログ正本ではない）
- KB連携: 未実装。生ログ・処理結果の自動投入は禁止
- 品質・完成度判定: `src/quality-completion-evaluator`。固定Ruleで評価し、KB掲載候補Recordを生成する。KB保存は担当しない

## ディレクトリ構造

```text
astera_v8/
├── STRUCTURE.md                    # 本ファイル（構成図・絶対）
├── README.md                       # Project入口
├── RELEASE_MANIFEST.txt            # 配布対象一覧
├── start.js                        # Docker ContainerのComposition Root
├── package.json
├── Dockerfile
├── docker-compose.yml              # 本番常駐の唯一の起動方式
├── .env / .env.example
├── .gitignore / .dockerignore
├── src/
│   ├── server.js                   # HTTP境界・Routing
│   ├── kagura-engine.js            # 5本柱・8段処理の順序統合
│   ├── all-domain-lens-catalog.js  # G01〜G38 Lens定義・検証Anchor Path
│   ├── domain-template-router.js   # 入力正規化・38 Genre分類・Overlay選択
│   ├── worker-pool.js              # Worker Lifecycle
│   ├── logger.js                   # 構造化Event生成・配送順序
│   ├── logging/
│   │   ├── tgs-client.js           # TGserver HTTP配送・再試行
│   │   └── outbox.js               # 未送信Eventの一時状態
│   ├── safe-json.js                # Secret除去・安全なJSON処理
│   ├── mood-detector.js
│   ├── hyperion-human-reader.js
│   ├── auth/                       # Tenant認証
│   ├── billing/                    # 課金・使用量
│   ├── guard/                      # Rate Limit
│   ├── llm/                        # 任意の外部出力Adapter境界
│   │   ├── llm-client.js           # Provider Chain
│   │   ├── adapter-base.js         # Adapter契約
│   │   ├── adapters.js             # Provider Factory
│   │   ├── http-client.js          # Timeout・Response上限
│   │   └── providers/              # 1 Provider = 1 Module
│   ├── pillars/                    # Fact / Risk / Multi / Inquiry / Compare Worker群
│   ├── store/                      # Application状態
│   ├── quality-completion-evaluator/
│   │   ├── domain-lens-resolver.js # 同じG01〜G38 Lensの読込・分野別確認
│   │   └── ...                     # 品質・完成度固定Rule採点／KB掲載候補判定
│   └── public/                     # 最小Web UI
├── test/                           # Node標準Test
├── scripts/                        # 短時間の検証用。常駐禁止
├── deploy/
│   └── nginx/                      # Docker前段のHTTPS Reverse Proxy例
├── docs/                           # 仕様・API・運用文書
└── archive/                        # 廃止資材の退避先（削除禁止）
```

## 依存方向

```text
start
  → server
      → auth / guard / billing / store
      → kagura-engine
          → domain-template-router
              → all-domain-lens-catalog
          → worker-pool → pillars
          → llm adapters
          → logger → logging/tgs-client → TGserver
                   → logging/outbox → /home/admin1/logs/astera-v8/outbox

evaluation caller（成果物・Requirement・Evidence確定後）
  → quality-completion-evaluator
      → domain-lens-resolver
          → domain-template-router
          → all-domain-lens-catalog
      → Artifact Profile
      → Requirement / Evidence / Blocking Rule
      → KB System Adapter（publish明示時のみ）
```

- `server`より下位のModuleは`server`をImportしない。
- `kagura-engine`より下位のModuleは`kagura-engine`をImportしない。
- `all-domain-lens-catalog`はRuntime・Worker・KBをImportしない。
- `domain-template-router`は`all-domain-lens-catalog`だけを分類定義の正本として読む。
- `pillars/*`は分類を再実行せず、Routerが返した同一Lensを参照する。
- `quality-completion-evaluator`は`server`・`kagura-engine`・KB DBをImportしない。
- `quality-completion-evaluator/domain-lens-resolver`は通常版と同じCatalog・Routerを参照し、別のLens定義を複製しない。
- Artifact Profileは設計・実装・研究などの成果物種別を扱い、`G01`〜`G38` Lensは分野固有のRisk・Evidence・Safety条件を扱う。両者を混同しない。
- `quality-completion-evaluator`は成果物を修正せず、固定Ruleの評価結果とKB掲載候補Recordだけを返す。
- 現行の`/process`へ品質・完成度判定を自動挿入しない。成果物・Requirement・Evidenceが確定した処理から明示的に呼び出す。
- `logger`はTGserverのHTTP Ingest契約だけに依存し、TGserver内部ModuleをImportしない。
- TGserverはAsteraをImportせず、意味判定を行わない。

## Module責務

| Module | 単一責務 |
|---|---|
| `server` | HTTP受付・認証順序・Response |
| `kagura-engine` | 38 Genre Lens、5本柱、8段判断材料の順序統合 |
| `all-domain-lens-catalog` | `G01`〜`G38`の固定ID、分類語、5本柱Lens、Evidence条件、検証Anchor Path |
| `domain-template-router` | 入力正規化、決定論的Score、Primary・Secondary・Overlay選択、Confidence生成 |
| `worker-pool` | Workerの割当・Timeout・再生成 |
| `pillars/*` | 選択済みLensに基づく各認知観点の決定論的処理 |
| `llm/llm-client` | 任意Provider ChainとFallback順序 |
| `llm/adapters` | Provider名からAdapterを生成するFactory |
| `llm/http-client` | 外部HTTPのTimeout・Response上限 |
| `llm/providers/*` | 各Provider固有のRequest・Response変換 |
| `quality-completion-evaluator` | 品質・完成度を個別採点し、95/95・Blocking・Requirement・Evidence条件からKB掲載候補を判定 |
| `quality-completion-evaluator/domain-lens-resolver` | 同じ38 Genre Lensを読込み、指定Path・分野別Risk・Evidence・Safety確認を採点Contextへ追加 |
| `logger` | Secret除去済みEventの生成と配送順序の統合 |
| `logging/tgs-client` | TGserver HTTP配送・Timeout・再試行 |
| `logging/outbox` | 未送信Eventの一時保存・復旧・期限削除 |
| `store` | Tenant・Usage・Webhook状態 |
| `billing/*` | Stripe境界・Subscription反映 |

## Lens分類契約

```text
Input
  → Normalize
  → G01〜G38 Score
  → Primary 1件
  → Secondary 最大3件
  → Overlay 0〜5件
  → 同一Lensを5本柱へ配布
  → 8段の判断材料へ反映
```

- 同一Input・同一Taxonomy Versionは同じ分類順序を返す。
- 空Inputは分類せず`ASTERA_LENS_INPUT_REQUIRED`状態を返す。
- `AI`、`IT`等の短いASCII語は単語境界で照合し、別単語の一部で発火させない。
- 弱い一致は`HYPOTHESIS_LAST_RESORT`、低Confidence、Review必須として返す。
- `未分類`、`その他`、`不明`、`other`、`unknown`、`unclassified`を分類IDとして作らない。
- 現行Runtimeは38 Genre Lensを選択する。ASTERA-KB完成後はKBが返す完全4階層Pathを同じ`Gxx`へ接続する。

## 判定Module Lens契約

```text
Artifact + Requirement + Evidence
  → domain_lens指定あり: 指定GxxとPathを使用
  → domain_lens指定なし: 同一Routerで決定論的に補完
  → Lens固有Risk / Evidence / Safety確認
  → 固定Rule採点
  → Blocking / KB掲載候補判定
```

- `domain_lens.enforce=false`または未指定時は、Lensを評価結果へ付与するが、未確認項目だけでBlockingしない。
- `domain_lens.enforce=true`時は、Lens固有項目を`analysis.domain_checks`で確認する。
- `passed`はEvaluatorが`VALID`と確認したEvidence IDへ接続されている場合だけ有効とする。
- 任意文字列、存在しないEvidence ID、別CandidateのEvidenceでは合格させない。
- 未確認・失敗時は`KB-HB-016`でKB掲載候補をBlockingする。

## HTTPアクセスログ契約

- 正常終了した `GET /healthz` は定期監視Noiseのため、TGserverへ送信しない。
- `/healthz` の失敗Response・Client切断は異常検知の対象として送信する。
- その他のHTTP Accessは従来どおり構造化Eventとして送信する。

## ログ一時Cache契約

Host上の `/home/admin1/logs/astera-v8/outbox` はTGserver配送の一時状態だけに使用する。

- 書込条件: TGserver送信開始前に、Secret除去済みEventを1件1Fileで置く。
- 再送条件: 初回送信失敗時の規定回数再試行、およびProcess再起動時。
- 削除条件: TGserverが2xxを返した直後。
- 保持期限: 7日（`ASTERA_LOG_CACHE_TTL_MS`で変更可能）。期限超過Fileは起動時に削除する。
- 禁止: 成功済みLogの複製、長期監査Log、Telegram原本の複製、KB、仕様書。
- Project直下へ`logs/`や`astera-logs/`を作らない。

## 運用境界

- 本番常駐はDocker / Docker Composeのみ。
- `node start.js`と検証Scriptは短時間検証に限る。
- systemd / pm2 / nohup / screen / tmuxによるApplication直接常駐は禁止。
- 本番起動・再起動・切替は管理者の明示承認後に行う。
- 不要資材は削除せず`archive/YYYY-MM-DD/`へ退避する。
