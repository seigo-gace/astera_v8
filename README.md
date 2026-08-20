# Astera v8 — Development Repository

> **問いを星図に変える。**
>
> **Private / Active Development**  
> Astera v8はAIではありません。固定Rule・Script・検証工程で、問い・資料・検索結果・他Systemの出力を、判断に使える8段の材料へ再構成する非AI・決定論的Multi-Perspective Cognition Runtimeです。

**設計・開発:** Seigo (`seigo-gace`)  
**Runtime package:** `astera-v8-runtime` v1.1.1  
**Runtime:** Node.js 22以上 / Google V8  
**Runtime npm dependencies:** 0  
**Lens taxonomy:** `1.0.0`

---

## 1. このRepositoryの位置付け

このRepositoryは、Astera v8の**開発・検証・責務分離を行うPrivate Repository**です。

このREADMEは宣伝用の紹介文ではありません。初めてCodeを読む開発者が、次を誤解しないための開発入口です。

- Astera v8が何をするSystemか
- Code上で何が実装されているか
- 何が正式なCore責務か
- 現行Codeに残るが、別Systemへ分離すべきものは何か
- 何が未実装・未検証か
- どの順でCodeとTestを確認するか

公開HP、CAMPFIRE、Press、Landing Page等へ掲載する最終本文は、Repository内の古い原稿を直接転用せず、Notionの公開本文正本を優先します。

---

## 2. Astera v8とは

Astera v8は、入力をそのままAIへ渡したり、ひとつの答えへ急いでまとめたりしません。

入力を固定RuleとScriptで分解し、目的、前提不足、未確認情報、Risk、反対視点、比較案、推奨判断、主役AIへの再指示へ整理する**判断材料生成Runtime**です。

```text
Question / Document / Search Result / Other System Output
  ↓
Input Normalize
  ↓
Inquiry Preflight
  ↓
38 Genre Lens + Secondary Lens + Safety Overlay
  ↓
Fact / Risk / Inquiry
  ↓
Multi Perspective
  ↓
Dialectic Candidates
  ↓
Compare
  ↓
01〜08 Judgment Material
  ↓
Human / Application / Main AI
```

入力元はAIに限定されません。人間、Web Form、CLI、業務System、API、MCP、検索結果、文書、他AIの出力などを受け取れます。

Astera v8の中心は「答えを生成すること」ではなく、**答えを出す前に必要な判断材料を、再現可能な処理順で作ること**です。

---

## 3. Astera v8ではないもの

| 対象 | Astera v8との関係 |
|---|---|
| ChatGPT / Claude / Gemini等 | 主役AI。Asteraとは別System |
| AMATERAS Ω / β / Δ | HFや複数AIを使う別System。Asteraへ混在させない |
| Astera App | UI、入力、履歴、Account、Plan等を扱う別Repository |
| Account / Login / Square / Credit | Astera Runtime Coreの正式責務外 |
| ASTERA-KB | Knowledge保存・検索を担う別System。接続は現時点で未実装 |
| Webhook Gateway | 外部Eventの受信・検証・保存・配送・再送を担う別System |
| TGserver | 構造化Logの配送先。Astera内部処理を所有しない |
| 検索エンジン | Astera Coreは外部情報を自動取得しない |
| 専門家判断 | 医療、法律、税務、投資等を代替しない |

外部LLM Adapterは存在しますが任意です。既定の`null` Providerでは外部AIを呼びません。

---

## 4. 現在の責務境界

### 正式なCore責務

- 入力本文とContextの正規化
- 過去のAstera 8段出力が再入力された場合のMeta Block除去
- `G01`〜`G38`専門ジャンルLensの決定論的分類
- Primary 1件、Secondary最大3件、Overlay最大5件の選択
- Fact / Risk / Inquiryの並列処理
- Multi Perspective、Dialectic、Compareの順序実行
- 01〜08の判断材料生成
- 任意LLM Adapterへ渡すPrompt生成
- Secret除去済み構造化LogのTGserver配送
- 独立QualityCompletionEvaluatorによる品質・完成度判定

### 現行Codeに存在するMigration Debt

次の機能は現在のCodeに実装されていますが、現在確定した責務境界ではAstera App / Account / Commerce側へ分離すべき対象です。

- `POST /signup`
- Tenant API Key発行・照合
- Free / Pro / BusinessのProcess内Rate Limit
- Usage計測
- Stripe Checkout
- Stripe WebhookとSubscription同期
- `ASTERA_SKILL_API_KEY`を使う所有者専用Endpoint
- Tenant・Usage・Stripe状態を保持するSQLite / JSON fallback

これらを削除済みとも、将来の正式構成とも扱いません。**現行実装として存在するが、責務分離が未完了のMigration Debt**として記録します。

---

## 5. 実装Status

| 領域 | Status | 現在の事実 |
|---|---|---|
| Input Normalizer | Implemented | NFKC正規化、Context統合、Astera Meta Block除去 |
| 38 Genre Lens | Implemented | `G01`〜`G38`、Taxonomy `1.0.0` |
| Secondary Lens | Implemented | Score順で最大3件 |
| Safety Overlay | Implemented | Legal / Medical / Current / Evidence / Abuse |
| Worker Pool | Implemented | `worker_threads`、Queue、Timeout、Crash時再生成 |
| Fact | Implemented with limitation | 入力内の確認候補・未確認・意見を分類。外部検索はしない |
| Risk | Implemented | 固定RuleとLens由来Risk / Safety Gate |
| Inquiry Preflight | Implemented | 短文、対象不足、成功条件不足を検査 |
| Human Reader | Implemented as rules | 文字列SignalでUrgency等を推定。心理診断ではない |
| Multi | Implemented | Attack / Defense / Critical / Domain視点 |
| Dialectic | Implemented | 主案・悪手・反対案・第三案・人読み最適案 |
| Compare | Implemented | 100点からの減点方式、矛盾検出、Decision分類 |
| Main 8 | Implemented | 日本語・英語表示、固定順序 |
| Optional LLM | Implemented | Null / OpenAI / Anthropic / Ollama / OpenAI-compatible |
| TGserver Logging | Implemented | Secret Mask、Retry、短期Outbox、起動時再送 |
| QualityCompletionEvaluator | Implemented independently | 95/95、Blocking、Evidence、KB候補判定 |
| ASTERA-KB connection | Not implemented | `KB_ELIGIBLE`後も自動保存しない |
| Account / Square / Credit | Out of Runtime Scope | Astera App / Commerce側の責務 |
| Current SHA CI evidence | Verification required | Test Sourceの存在と、現在SHAの成功結果を分離する |

### Status用語

- **Implemented**: Codeが存在する
- **Implemented with limitation**: Codeはあるが、保証範囲に重要な制限がある
- **Migration Debt**: Codeには存在するが、確定責務から分離が必要
- **Not implemented**: 将来構想を実装済みとして扱わない
- **Verification required**: Test Sourceだけで成功済みとは判定しない

---

## 6. 実際の処理順

### 6.1 Input Normalize

`src/domain-template-router.js`

1. `question`と`context`を受け取る
2. 過去のAstera 01〜08 Blockが貼られていれば分析対象から除去する
3. Core RequestとAnalysis Textを分離する
4. 空Inputは`ASTERA_LENS_INPUT_REQUIRED`として分類しない

### 6.2 Genre Lens Router

`src/all-domain-lens-catalog.js`  
`src/domain-template-router.js`

分類はAI推論ではありません。

- 固定分類語
- Anchor Title
- Exact Match
- 文字長に応じたScore
- 3-gram overlap
- 固定Tie-break
- Confidence
- `HYPOTHESIS_LAST_RESORT`

同一Input・同一Taxonomy Versionでは同じ分類順序を返す設計です。

```text
Normalize
  → G01〜G38 Score
  → Primary 1
  → Secondary 0〜3
  → Overlay 0〜5
```

#### Overlay

- `high_stakes_legal`
- `medical_safety`
- `current_information`
- `evidence_strict`
- `safety_abuse`

OverlayはPrimary Lensを上書きせず、Risk、Evidence、Safety Gateを追加します。

### 6.3 Inquiry Preflight

`src/pillars/inquiry-worker.js`

短すぎる入力や、対象・成功条件が同時に不足する入力だけを停止します。明確な入力は不要な質問で止めず、Lens固有の不足を分析結果へ渡します。

### 6.4 Parallel Pillars

```text
Fact ─────┐
Risk ─────┼─ parallel
Inquiry ──┘
```

- **Fact**: 入力内の具体値・固有語を確認候補にする。外部検証済みとは扱わない
- **Risk**: Security、Production、Cost、Data等の固定RuleとDomain Riskを検査
- **Inquiry**: 問いの健全性、Missing Questions、Human Reader情報を作る

### 6.5 Sequential Judgment

```text
Fact / Risk / Inquiry
  → Multi
  → Dialectic
  → Compare
  → Main 8
```

- **Multi**: Attack / Defense / Critical / Domain視点を作る
- **Dialectic**: 主案・悪手・反対案・第三案・人読み最適案を生成する
- **Compare**: Risk、未確認、問いの不健全、High-Stakes Overlay等を減点する

Compare Decision:

- `recommend`
- `recommend_with_caution`
- `hold_and_clarify`

---

## 7. 01〜08 Judgment Material

| No. | 固定名称 | 役割 |
|---:|---|---|
| 01 | 本当の目的 | Core Requestと達成目的 |
| 02 | 前提不足 | 不足条件、Context、Assumption |
| 03 | 事実確認 | Evidence候補、未確認、Evidence Gap |
| 04 | 危機察知 | Risk、Safety Gate、Domain Check |
| 05 | 反対視点 | Opposition、矛盾、悪手から得る教訓 |
| 06 | 比較案 | Candidate Ranking、Score、比較軸 |
| 07 | 推奨判断 | Decision、理由、条件 |
| 08 | 主役AIへの再指示 | Main AIへ渡す再構成指示 |

08はAI接続時に使う再指示です。AIを使わない経路では、01〜07を人間または別Systemの判断材料として使用できます。

通常`POST /process`は内部Map全体ではなく、利用者向けの`text/plain`判断材料を返します。

---

## 8. 精度上の重要な境界

### Factは外部事実確認ではない

`fact-worker.js`は入力本文を分類します。Web検索、一次Source取得、現在情報確認は行いません。

内部の`confirmed`は「入力内に具体値・固有語がある確認候補」です。外部検証済みの事実ではありません。

### Human Readerは診断ではない

`hyperion-human-reader.js`はUrgency、Anger、Fatigue、Confusion、Precision等の固定Signalを検出し、応答方針を調整します。感情・心理状態を医学的に判定する機能ではありません。

### Current-Information Overlayは情報取得をしない

最新性が必要なことを検出し、確認項目を追加します。最新情報自体を取得・保証する機能ではありません。

### Optional LLMはCoreではない

既定値は`LLM_CHAIN=null`です。Null Adapterは外部AIを呼ばず、Asteraが作ったPromptを返します。

### QCEはKBへ保存しない

`KB_ELIGIBLE`は掲載可能判定です。保存完了、公開完了、品質保証済みを意味しません。

---

## 9. QualityCompletionEvaluator

`src/quality-completion-evaluator/`

本体`/process`とは独立した固定Rule評価Moduleです。

合格条件:

- Quality `>= 95`
- Completion `>= 95`
- Blocking `0`
- Mandatory Requirement failure `0`
- Evidence mismatch `0`
- Evaluation成功

Artifact ProfileとDomain Lensを分離します。

- **Artifact Profile**: design / implementation / research / test等
- **Domain Lens**: `G01`〜`G38`のRisk / Evidence / Safety条件

### 現在確認済みのDefect

`blocking-rule-engine.js`は`KB-HB-016`を生成しますが、`blocking-rules.v1.json`のRegistryは`KB-HB-015`までです。

これは修正・Test対象として残っています。

### 起動境界

Evaluator APIは別Process・別Portです。

```bash
npm run start:evaluator-api
```

既定: `127.0.0.1:7374`

Rootの`docker-compose.yml`は現時点でEvaluator APIを自動起動しません。

---

## 10. Repository構造

```text
astera_v8/
├── README.md
├── STRUCTURE.md
├── RELEASE_MANIFEST.txt
├── package.json
├── start.js
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── src/
│   ├── server.js
│   ├── kagura-engine.js
│   ├── all-domain-lens-catalog.js
│   ├── domain-template-router.js
│   ├── worker-pool.js
│   ├── mood-detector.js
│   ├── hyperion-human-reader.js
│   ├── pillars/
│   ├── llm/
│   ├── logging/
│   ├── auth/              # Migration Debtを含む
│   ├── billing/           # Migration Debtを含む
│   ├── store/             # Migration Debtを含むApplication状態
│   ├── guard/
│   ├── public/
│   └── quality-completion-evaluator/
├── test/
├── scripts/
├── docs/
├── deploy/
├── .github/workflows/
└── archive/
```

### 最初に読むCode

1. `src/kagura-engine.js` — 全処理順
2. `src/domain-template-router.js` — Input Normalizeと分類
3. `src/all-domain-lens-catalog.js` — 38 Genre Lens正本
4. `src/pillars/` — 各Rule処理
5. `src/worker-pool.js` — 並列実行
6. `src/quality-completion-evaluator/` — 独立品質Gate
7. `src/server.js` — 現行HTTP境界とMigration Debt
8. `start.js` — 現行Composition Root

内部Class / File名に`Kagura`が残っています。Public名はAstera v8のまま維持し、内部名称Migrationは互換性とTestを保って別作業で行います。

---

## 11. 現行HTTP Endpoint

> 以下は**現在のCodeに存在するObserved Contract**です。すべてが将来の正式責務という意味ではありません。

### Runtime `127.0.0.1:7375`

| Method | Path | Position |
|---|---|---|
| GET | `/` | 最小Web UI |
| GET | `/healthz` | Health / Runtime / Logging状態 |
| POST | `/process` | 判断材料生成 |
| POST | `/signup` | 現行Tenant Key発行。Migration Debt |
| POST | `/v1/skill/process` | 現行所有者専用入口。Migration Debt |
| POST | `/billing/checkout` | 現行Stripe境界。Migration Debt |
| POST | `/billing/webhook` | 現行Stripe境界。Migration Debt |

### Evaluator `127.0.0.1:7374`

| Method | Path | Position |
|---|---|---|
| GET | `/healthz` | Evaluator状態 |
| POST | `/v1/evaluate` | 現行Tenant評価入口。Auth依存はMigration対象 |
| POST | `/v1/skill/evaluate` | 現行所有者専用評価入口。Migration対象 |

詳細なObserved Contractは`docs/API_REFERENCE.md`を参照してください。

---

## 12. Local Development

### Requirements

- Node.js 22以上
- Bash（Smoke Test用）
- Docker / Docker Compose（Container確認時）

npm Packageの追加Installは不要です。

```bash
node --version
npm test
```

### 短時間のLocal起動

認証を省略するLocal開発例:

```bash
ASTERA_LOCAL_NO_AUTH=1 \
ASTERA_TGS_ENABLED=0 \
LLM_CHAIN=null \
npm start
```

PowerShell:

```powershell
$env:ASTERA_LOCAL_NO_AUTH = "1"
$env:ASTERA_TGS_ENABLED = "0"
$env:LLM_CHAIN = "null"
npm start
```

Health:

```bash
curl http://127.0.0.1:7375/healthz
```

Process:

```bash
curl -X POST http://127.0.0.1:7375/process \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Node.js APIを互換性を保って段階移行する判断材料を作る。対象は本番Serviceで、成功条件は停止時間を作らずRollback可能にすること。",
    "context": "外部情報は未確認。現行構成とTest結果を根拠に判断する。",
    "language": "ja",
    "llm": {"chain": ["null"]}
  }'
```

### Docker起動

```bash
cp .env.example .env
# Secretと接続先をLocal環境に合わせて設定する
docker compose up -d --build
```

| サービス | ポート | 役割 |
|---|---|---|
| `astera-v8`（本体） | `127.0.0.1:7375` | 判断材料生成 API |
| `astera-v8-evaluator` | `127.0.0.1:7374` | 品質・完成度判定 API |
| nginx（personal ローカル） | `127.0.0.1:8082` → `7375` | ローカル reverse proxy（`docker-compose.personal.yml` の `nginx-personal`） |

`docker-compose.personal.yml` の `astera-v8-personal`（personal 本体）は既定では起動しません。本番の `astera-v8`（7375）と `astera-v8-evaluator`（7374）を使用してください。personal 用 nginx（8082→7375）だけが必要な場合は `docker compose -f docker-compose.personal.yml up -d nginx-personal` で起動します。

現行ComposeはHost Network、loopback、TGserver接続、Cloudflare profileを前提にします。開発PCでそのまま本番設定を流用しないでください。ホストの `npm start` / systemd 常駐は本番運用では行いません。

---

## 13. Testと検証

```bash
npm test
bash scripts/smoke.sh
npm run verify
```

`npm test`:

- Runtime Test
- QualityCompletionEvaluator Test
- Evaluator API Test

`npm run verify`:

- 全Test
- Runtime起動
- `/signup`
- `/process`
- G10 Lens
- 01〜08出力
- Evidence表示

主なTest範囲:

- 38 Genre固定IDとAnchor Path
- 同一Input 100回の決定性
- 空Input
- 短いASCII分類語の誤発火防止
- Overlay順序
- Main 8の順序・英日表示
- Astera Meta Block除去
- Worker Timeout / Crash復旧
- HTTP入力型・Payload上限・CORS・HTTPS
- Secret Mask
- Stripe署名と価格改ざん拒否
- Tenant / Skill Key境界
- TGserver Outbox
- QCE Requirement / Evidence / Blocking / Determinism

### 検証結果の扱い

- Test Fileがあるだけでは「成功済み」としない
- 過去Commitの成功は現在SHAの成功を意味しない
- READMEに固定Test件数を書かない
- GitHub Actionsと実行Logで同一SHAを確認する
- 未実行・取得不能は`未検証`と書く

Workflow:

- `.github/workflows/test.yml`
- `.github/workflows/verify.yml`
- `.github/workflows/gh-ready.yml`

---

## 14. Known Debt / Known Limitation

### P0 — 責務境界

- Runtime Composition RootにTenant / Billing / Stripeが混在している
- Account / Plan / Square / Creditの正式責務はAstera App / Commerce側
- Evaluator APIも現行Tenant認証Moduleへ依存している

### P0 — QCE Registry

- `KB-HB-016`がEngineに存在するがRegistryにない

### P1 — Evidence

- Fact Workerは外部Sourceを取得しない
- Current Overlayは最新情報を取得しない
- ASTERA-KBは未接続

### P1 — Runtime / API

- Rate LimiterはProcess内Memory MapでReplica間共有ではない
- `clarification_needed`はHTTP 200 Textで専用JSON契約がない
- Tenant Keyの失効・Rotation Endpointがない
- Root ComposeはEvaluatorを起動しない

### P1 — Naming

- `KaguraServer`、`KaguraEngine`等の内部名称が残る
- Public InterfaceやPathを壊さずMigrationする必要がある

### P2 — Documentation

- Repository内のPress / LP / Public Packは開発用Draft
- 公開本文はNotionの最新公開正本を優先する
- Archiveは歴史資料であり現行仕様の根拠にしない

詳細: `docs/LIMITATIONS.md`

---

## 15. Documentation Map

### 開発入口

- `README.md` — 本ページ
- `STRUCTURE.md` — 現行Repository構造と依存方向
- `docs/DOCUMENTATION_INDEX.md` — 文書の分類と優先順位
- `docs/ARCHITECTURE.md` — Runtime内部構造
- `docs/API_REFERENCE.md` — 現行CodeのObserved HTTP Contract
- `docs/LIMITATIONS.md` — 制限と未実装

### Lens

- `docs/LENS_GENRE_INDEX.md`
- `docs/DOMAIN_TEMPLATE_CATALOG.md`
- `src/all-domain-lens-catalog.js`
- `src/domain-template-router.js`

### QualityCompletionEvaluator

- `src/quality-completion-evaluator/README.md`
- `src/quality-completion-evaluator/contracts/`
- `src/quality-completion-evaluator/tests/`

### Operations

- `docs/DEPLOYMENT_VPS.md`
- `docs/PRODUCTION_CHECKLIST.md`
- `docs/SECURITY_NOTES.md`
- `docs/TROUBLESHOOTING.md`

### Public copy

Repository内の次のFileは**Internal Draft / Reference**です。

- `docs/README_PUBLIC.md`
- `docs/PRESS_KIT.md`
- `docs/LP_COPY.md`
- `docs/BRAND_PHILOSOPHY.md`

最終公開本文はNotionの次の正本を優先します。

- [Astera公式HP｜公開本文・参照Source正本](https://app.notion.com/p/3a9cdcf128e481ca9c90c186c60bd5d8)

### Notion development canon

- [04｜Astera v8 本体](https://app.notion.com/p/3aecdcf128e48161a895c208087c9ad5)
- [01｜Astera v8 議事録](https://app.notion.com/p/3aecdcf128e481c69afcc2470f878aa4)
- [Astera v8｜実装正本](https://app.notion.com/p/3accdcf128e48197981cc71a0d2d630b)
- [Astera v8｜全Code正本](https://app.notion.com/p/3adcdcf128e4811a84e0d4b14e60a2d2)

---

## 16. 正本の優先順位

仕様判断は次の順で行います。

1. マスターがNotion正本で確定した最新の目的・責務・境界
2. 現行RepositoryのCode / Schema / TestによるObserved Fact
3. 本READMEの開発向け説明
4. `STRUCTURE.md`と技術文書
5. Repository内のPublic Draft
6. `archive/`内の歴史資料

Codeと確定責務が矛盾する場合、Codeを「現行事実」、Notionを「到達すべき責務」として分離し、Migration Debtとして記録します。説明だけを書き換えて、実装済み・分離済みとは扱いません。

---

## 17. 変更時の同期Rule

変更は次を同じ作業単位で確認します。

```text
Notion議事録
  → 基本設計 / 詳細設計
  → Code
  → Test
  → README / STRUCTURE / API / LIMITATIONS
  → Notion Status
```

禁止:

- 未実装を実装済みと書く
- 未実行Testを成功扱いする
- AsteraをAI本体と表現する
- AMATERAS ΩやHF構成をAsteraへ混在させる
- Account / Square / CreditをRuntime Core責務へ戻す
- `KB_ELIGIBLE`をKB保存済みと表現する
- Public DraftをNotion公開正本より優先する

---

## 18. 現在の開発判断

Astera v8のCore Runtimeは、38 Genre Lens、5 Overlay、Worker Pool、5本柱、Dialectic、Compare、Main 8、Optional LLM、独立QCE、TGserver LoggingまでCodeとして存在します。

ただし、Repository全体は完成状態ではありません。

最優先は、現行Codeに残るTenant / Stripe / Skill API等を、確定済みの責務境界へ合わせて分離し、QCE Registry不一致を修正し、同一SHAのTest・Smoke・CI Evidenceを取得することです。
