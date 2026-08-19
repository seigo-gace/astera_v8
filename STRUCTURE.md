# Astera v8 — STRUCTURE（現行構成・依存境界）

> 本ファイルはRepository上の現行実装構造を説明する。設計・仕様の決定源はNotion正本であり、GitHub上の構造を理由に正本を逆上書きしない。

## 1. Core責務

Astera v8は、入力理解、Analysis Task Graph、Task別Lens Routing、根拠状態管理、固定Ruleによる認知処理、8段の判断材料生成を担当する。一般的な会話AI、Knowledge保存System、Account/Payment Platformではない。

Core内で維持する運用境界:

- API Key / Tenant解決
- Rate Limit
- Request Size
- Allowed Options / Abuse Guard
- Usage Meter境界
- Secret Mask / structured logging

Core非責務:

- Plan正本
- Credit正本
- Checkout / Subscription / Payment正本
- Account登録UI
- KB保存・自動Publish

## 2. Canonical Naming

- Canonical Engine実装: `src/astera-engine.js` → `AsteraEngine`
- Global Canonical Engine: `src/canonical-astera-engine.js` / `src/canonical-astera-engine-base.js`
- HTTP Base: `src/server-base.js` → `AsteraServerBase`
- Legacy compatibility path: `src/kagura-engine.js` → `require('./astera-engine')`
- 正式Env prefix: `ASTERA_*`
- `KAGURA_*`: 必要な既存環境互換のfallbackのみ維持

旧`Kagura`名称は現行Canonical実装の名前として新規利用しない。互換経路を無断削除もしない。

## 3. 現行主要正本

- Lens Catalog: `src/all-domain-lens-catalog.js`
- Lens Router: `src/domain-template-router.js`
- Input Understanding: `src/input-understanding.js`
- Canonical Decision Engine: `src/canonical-astera-engine.js`
- Base Decision Engine: `src/astera-engine.js`
- Module Switch: `src/astera-module-switch.js`
- Quality Completion Evaluator: `src/quality-completion-evaluator/`
- Evidence Search: `src/evidence-search/`
- Runtime Log sink境界: Logger → TGserver
- Application状態: SQLite / fallback store

## 4. ディレクトリ構造

```text
astera_v8/
├── STRUCTURE.md
├── README.md
├── RELEASE_MANIFEST.txt
├── start.js                         # Composition Root
├── package.json
├── Dockerfile
├── docker-compose.yml
├── docker-compose.evidence.yml
├── .env / .env.example
├── src/
│   ├── server-with-module-switch.js # 現行start.jsのHTTP最上位Server
│   ├── server-with-evidence.js      # Evidence / Integrated境界
│   ├── server.js                    # CanonicalAsteraEngineを標準注入
│   ├── server-base.js               # HTTP/Auth/Rate/Usage等のBase境界
│   ├── astera-module-switch.js      # 3 Targetの明示Switch
│   ├── canonical-astera-engine.js   # Global Input補強・Canonical出力
│   ├── canonical-astera-engine-base.js
│   ├── astera-engine.js             # 5本柱・Dialectic・Main8の基底実装
│   ├── kagura-engine.js             # Legacy compatibility shimのみ
│   ├── input-understanding.js       # 言語非依存Input理解・Task Packet
│   ├── judgment-materials-analyzer.js
│   ├── all-domain-lens-catalog.js   # G01-G38 Lens Catalog
│   ├── domain-template-router.js    # Task別Lens Routing
│   ├── worker-pool.js
│   ├── pool-runner.js
│   ├── pillars/
│   │   ├── fact-worker.js
│   │   ├── risk-worker.js
│   │   ├── multi-worker.js
│   │   ├── inquiry-worker.js
│   │   ├── dialectic-worker.js
│   │   └── compare-worker.js
│   ├── evidence-search/             # Evidence Search Module/API/Adapters
│   ├── quality-completion-evaluator/# 固定Rule品質・完成度判定
│   ├── auth/                        # Tenant / Skill認証
│   ├── guard/                       # Rate Limit等
│   ├── billing/
│   │   ├── meter.js                 # Core責務: Usage Meter境界
│   │   ├── key-vault.js             # Request LLM Key境界
│   │   ├── stripe-client.js         # Legacy Commerce Adapter
│   │   └── subscription-sync.js     # Legacy Commerce Adapter
│   ├── store/                       # Application状態
│   ├── llm/                         # 任意外部LLM Adapter境界
│   ├── logging/                     # TGserver配送 / Outbox
│   ├── logger.js
│   ├── safe-json.js
│   └── public/                      # 開発補助用最小Web UI
├── test/                            # Core Regression / Integration
├── scripts/                         # 短時間検証用
├── deploy/
├── docs/
└── archive/                         # Historical/Legacy。現行Canonへ混入禁止
```

## 5. Composition Root

```text
start.js
  ├─ SQLiteStore
  ├─ Logger
  ├─ ASTERA_ENABLE_LEGACY_COMMERCE=1 ?
  │    ├─ StripeClient
  │    └─ SubscriptionSync
  │  : 何も注入しない
  │
  └─ AsteraServerWithModuleSwitch
       └─ AsteraServerWithEvidence
            └─ AsteraServer
                 └─ AsteraServerBase
```

Canonical defaultではLegacy Commerce Adapterを生成しない。

## 6. Decision Runtime依存方向

```text
CanonicalAsteraEngine
  → CanonicalAsteraEngineBase
      → AsteraEngine
          → Input / Task analysis
          → domain-template-router
              → all-domain-lens-catalog
          → worker-pool
              → Fact
              → Risk
              → Inquiry
              → Multi
              → Dialectic
              → Compare
          → Main8 Judgment / Decision Trace
```

- `src/kagura-engine.js`は上記依存の本体ではない。旧Importを`AsteraEngine`へ転送するShim。
- 下位WorkerからServerへ逆Importしない。
- `all-domain-lens-catalog`はRuntime / Worker / KBをImportしない。
- `domain-template-router`はCatalogをLens分類正本として読む。
- WorkerはTaskへ割り当て済みLensを使用し、独自の別Catalogを作らない。

## 7. Analysis Task Graph契約

```text
Input
  → Input Understanding
  → Instruction Understanding
  → Analysis Task Packet
      ├─ tasks[]
      ├─ dependencies[]
      ├─ execution_waves[]
      ├─ constraints[]
      ├─ prohibitions[]
      ├─ preserve[]
      └─ hard_blockers[]
  → TaskごとにLens / Evidence Needを決定
```

複数要求を1つの曖昧な処理へ平均化しない。Taskの依存順序をExecution Waveとして保持する。

## 8. Lens契約

```text
Task text / target / premises
  → G01-G38 Score
  → Primary
  → Secondary
  → Overlay
  → 同一Task Lens Planを各Workerへ渡す
```

- 同一Input・同一Taxonomy Versionで決定性を維持する。
- 短い一般語の部分一致だけで強い専門Lensへ確定しない。
- Operation IntentとDomain Lensを混同しない。
- 外部Language Parserが未完成でもCoreを成立させる。将来のParserはAdapter候補。

## 9. Worker責務

| Module | 責務 |
|---|---|
| `fact-worker` | 根拠状態を踏まえFact / Unconfirmed / Opinionを分離 |
| `risk-worker` | Risk・Safety・Hard Constraint違反を検出 |
| `inquiry-worker` | 前提不足・確認必要条件を抽出 |
| `multi-worker` | 独立した複数Perspective / Trade-offを生成 |
| `dialectic-worker` | 主案・反対案・代替案等を比較候補へ構造化 |
| `compare-worker` | Candidateを同一Metricで比較しDecisionとBottleneckを出す |

Multi / Dialectic / Compareを同じ責務に重複させない。

## 10. Evidence境界

```text
Task
  → deriveEvidenceNeed
      ├─ NOT_REQUIRED
      └─ REQUIRED
           → Evidence Search
           → normalizeEvidencePacket
           → Fact / Risk / Compare Gate
```

Evidenceが必要なTaskで根拠取得に失敗した場合、失敗や未確認を確認済みFactへ昇格しない。

現行Main HTTP入口:

- `POST /v1/evidence/search`
- `POST /v1/skill/evidence/search`
- `POST /v1/integrated/process`

Evidence Search未設定時は明示的にUnavailableを返す。有料検索は現行無効。

## 11. Module Switch

`POST /v1/astera/execute`は次のTargetだけを受け付ける。

```text
astera.decision-materials
astera.evidence-search
astera.quality-gate
```

Target名を暗黙推定して別Moduleを呼ばない。

## 12. Main8 Decision Trace

8段出力は文章だけでなく、各Sectionで次の判断根拠を保持する。

- Rule IDs
- Task IDs
- Lens IDs
- Evidence refs
- Facts used
- Constraints used
- Risks used
- Candidate comparison
- Rejected reasons
- Score breakdown
- Uncertainty
- Blocking conditions
- Source spans

未確認・Blockingを隠して最終確定しない。

## 13. Auth / Guard / Usage責務

```text
HTTP
  → HTTPS / CORS
  → Authentication
  → Tenant resolution
  → Rate Limit
  → Request size / option validation
  → Core process
  → Usage Meter
  → Structured Log
```

Core責務は認証・防御・Usage境界まで。Plan/Credit/決済のBusiness LogicをCoreへ混在させない。

## 14. Commerce Compatibility境界

Canonical default:

```text
ASTERA_ENABLE_LEGACY_COMMERCE != 1
  → StripeClient生成なし
  → SubscriptionSync生成なし
  → /signup = 404
  → /billing/checkout = 404
  → /billing/webhook = 404
```

Legacy compatibility:

```text
ASTERA_ENABLE_LEGACY_COMMERCE=1
  → StripeClient / SubscriptionSyncを明示注入
  → 旧Routeだけ有効
```

これは互換経路であり、CoreのPlan/Credit/Payment責務ではない。

`UsageMeter`はCommerceではなくCoreのUsage境界なので削除しない。

## 15. Quality Completion Evaluator境界

```text
Artifact + Requirement + Evidence
  → Quality Completion Evaluator
  → fixed-rule scoring
  → Blocking / Revision / KB eligibility
```

- Core Processへ無条件で自動挿入しない。
- `KB_ELIGIBLE`は保存済みを意味しない。
- KB / modular-catalogへ自動Publishしない。
- Lens Resolverは通常Runtimeと同じCatalog / Routerを使用し、独自Taxonomyを複製しない。

## 16. Logging境界

- `logger`はSecret除去済みEventを扱う。
- TGserver設定時はHTTP Ingestへ送る。
- 未送信EventのみOutboxへ一時保持する。
- 成功済みLogをProject内へ二重正本化しない。
- `GET /healthz`成功は監視Noiseとして通常Access Logから除外する。

## 17. Test境界

- Unit / Regression: File・Module責務
- Integration: Requirement / Change Unit
- Smoke: Canonical Runtimeの短時間起動・Request
- CI: GitHub Actions Runが存在して成功したCommitのみCI成功Evidenceとする
- Deploy / Runtime: G5承認後の別Evidence

主な境界Regression:

- `test/commerce-boundary.test.js`
- `test/legacy-naming-boundary.test.js`

## 18. 運用境界

- 本番常駐は採用済みDeployment方式に従う。
- G4実装承認だけでMerge / Release / Deploy権限は発生しない。
- main / protected branchへ無断変更しない。
- Force Push / 無断Merge / Branch削除を行わない。
- Historical資材を現行Canonへ混入しない。
- 実装済み / Test済み / CI済み / Deploy済み / Runtime確認済みを分離して報告する。
