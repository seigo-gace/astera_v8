# Astera v8 — Deterministic Judgment-Material Runtime

> **問いを判断材料へ変換する、非AI・決定論的Runtime。**

Astera v8は、入力をTaskとClaimへ分解し、必要な根拠条件を整理し、Fact / Risk / Multi / Inquiry / Compareの複数観点から**判断材料**を生成するRuntimeです。

Astera自身が最終判断・採否・推奨案を決定することはありません。

```text
Human / Main AI
      │ request
      ▼
Astera v8
  deterministic task / claim / evidence / multi-perspective processing
      │ Main8 judgment material
      ▼
Human / Main AI
  final interpretation / decision
```

Runtime: **Node.js 22+ / Google V8**  
Runtime npm dependencies: **0**  
Primary implementation language: **JavaScript / CommonJS**

---

## 1. 設計正本

Astera v8の基本設計、詳細設計、ロジック、アーキテクチャ、各種定義、境界、Error state、完成Gateは次を正本とします。

**[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)**

READMEは入口・概要です。Architectureを独自に再定義しません。

---

## 2. 現在の完成状態

現行Coreの主要処理は実装されていますが、**Repository全体はまだRelease Completeではありません。**

現在解消が必要な主項目:

1. Japanese Parser preparationの一回化
2. Parser障害と「前提不足」の状態分離
3. 標準`npm run verify`とREAL Japanese Parser MCP Gateの統合
4. QCE `KB-HB-016` のmain統合
5. Tenant / SQLite / Stripe / Billing等のCore外への責務分離
6. 現行HEADと同一SHAでのLive Evidence / Story / Main8 E2E再証明
7. Archive / generated artifacts /旧文書の整理

**過去SHAで成功したTestやArtifactを、現在SHAの完成証拠とは扱いません。**

---

## 3. Astera v8がすること / しないこと

### Coreがすること

- Input normalization / source-role isolation
- 日本語Parser連携
- Deterministic Task Decomposition
- Task Graph validation
- `G01`〜`G38` Lens / Overlay routing
- Claim extraction / canonicalization
- Claim Policy / Search Plan生成
- Evidence Search boundary呼出し
- Evidence Binding
- `CONFIRMED / UNDETERMINED`判定
- Five-Lane projection
- Perspective expansion
- Human Reader presentation signal
- Main8判断材料生成

### Coreがしないこと

- 最終意思決定
- 自動Recommendation / Ranking
- User Account / Login / Passkey / 2FA管理
- Plan / Billing / Credit / Refund管理
- 個人情報DBの所有
- ASTERA-KBの保存主体
- 外部Web情報の真実性そのものの保証

現在Codeに残るTenant / SQLite / Stripe / Billing機能は**Legacy compatibility / migration debt**です。

---

## 4. 現在の実行経路

```text
start.js
  ↓
src/server.js
  ↓
src/kagura-engine.js
  ↓  legacy compatibility alias
src/astera-engine.js
  ↓
src/canonical-astera-engine.js
  ↓
src/canonical-astera-engine-base.js
  ↓
Task / Claim / Evidence / Five Lanes / Main8
```

`src/kagura-engine.js`は別Engineではありません。現在は`src/astera-engine.js`への互換Entry Pointです。

Evidence Searchは`src/astera-engine.js`からCanonical Evidence Boundaryへ注入されます。

---

## 5. Canonical processing pipeline

```text
Input / Context / Code / Quote / File
↓
Source Role Isolation
↓
Language / Locale / Script
↓
Japanese Parser MCP or deterministic local understanding
↓
Task Decomposition
↓
Task Graph Validation
↓
Domain Lens / Overlay
↓
Claim Extraction
↓
Claim Policy
↓
Search Plan
  ├─ support
  └─ counter
↓
Evidence Search / supplied Evidence
↓
Evidence Binding
↓
G1–G7 Confirmation
↓
Canonical Claim Records
  ├─ CONFIRMED
  └─ UNDETERMINED
↓
Five Lanes
  ├─ Fact
  ├─ Risk
  ├─ Multi
  ├─ Inquiry
  └─ Compare
↓
Perspective Expansion
↓
Main8
↓
Human / Main AI
```

TaskとClaimは別構造です。Search結果がClaimの意味を後から作り替えることもありません。

---

## 6. Main8

公開判断材料は8セクションで構成します。

| No. | Section |
|---:|---|
| 01 | 本当の目的 |
| 02 | 前提不足 |
| 03 | 事実確認 |
| 04 | 危機察知 |
| 05 | 反対視点 |
| 06 | 比較案 |
| 07 | 根拠成立状態 |
| 08 | 主役AI／利用者への再指示 |

Main8は「結論を決める8段」ではなく、受け手が判断するための材料です。

---

## 7. Five-Lane invariants

Five Lanesは同じCanonical Task / Claim Recordsを入力にします。

```text
Canonical Records
├─ Fact
├─ Risk
├─ Multi
├─ Inquiry
└─ Compare
```

禁止:

```text
Fact → Multi の真実入力化
Risk → Compare の意思決定入力化
Multi → Compare のRanking材料化
Inquiry → Fact の推測補完
```

Compareは比較材料を作りますが、Weighted Score・Selected Candidate・Recommendation・Final Decisionを所有しません。

---

## 8. Japanese Parser boundary

日本語解析が必要な入力ではJapanese Parser MCPを使用します。

設計上の必須条件:

- 1 RequestにつきPreparationは原則1回
- Parser必須時にMockや推測へ無言fallbackしない
- Parser未設定 / Timeout / Protocol failureを明示状態として保持
- Parser障害を「ユーザーの前提不足」に置き換えない

REAL MCP Gate runner:

```bash
node scripts/run-real-mcp-gate.js
```

現在、このGateと標準`npm run verify`を同一Release Gateとして閉じる作業が必要です。

---

## 9. Evidence Search

Evidence Search実装は`src/evidence-search/`に分離されています。

Core側の責務:

```text
Claim
→ Policy
→ Search Plan
→ Evidence Search boundary
→ Binding
→ Confirmation
```

Evidence Search側の責務:

- Provider retrieval
- Query execution
- Provider-specific adapter
- Recovery / scheduler
- Search result contract

Retrieval結果が返っただけでは`CONFIRMED`になりません。ClaimとEvidenceのBindingおよびConfirmation Gateを通過する必要があります。

---

## 10. Quality Completion Evaluator

`src/quality-completion-evaluator/`はAstera Coreとは独立したEvaluatorです。

```text
Artifact + Requirements + Evidence
→ validation
→ profile
→ quality rules
→ completion rules
→ blocking rules
→ result
```

QCEは:

- 成果物を自動修正しない
- KBへ自動保存しない
- `KB_ELIGIBLE`を保存完了扱いしない
- `/process`へ暗黙挿入しない

現在`KB-HB-016`のmain統合が未完です。

---

## 11. HTTP surface

### Core

```text
GET  /healthz
POST /process
```

Default runtime port: `7373`

`GET /`および`GET /index.html`はProcess APIのPreview UIではありません。

### Independent service

QCE APIは別Processとして起動できます。

```bash
npm run start:evaluator-api
```

Evidence Search APIも独立起動Scriptを持ちます。

```bash
npm run start:evidence-api
```

### Legacy compatibility

`/signup`、Skill Key、Billing / Stripe等のEndpointは現行互換Codeとして残っていますが、Canonical Core責務ではありません。

---

## 12. 起動

### Production

本番常駐はDocker / Docker Composeを前提とします。

```bash
docker compose up -d --build
```

`start.js`は本番相当のホスト直起動を防止します。

### Development / short verification

明示的な開発Overrideを設定した場合だけホスト起動できます。

```bash
ASTERA_ALLOW_HOST_START=1 npm start
```

Windows PowerShell例:

```powershell
$env:ASTERA_ALLOW_HOST_START="1"
npm start
```

---

## 13. Test / verification

### Standard source + runtime verification

```bash
npm run verify
```

`verify`はSource validation、Runtime/QCE系Test、Evidence architecture validation、Smokeを含みます。

### Evidence subsystem

```bash
npm run verify:evidence
```

### Real Japanese Parser MCP

```bash
node scripts/run-real-mcp-gate.js
```

### Story / regression

Repositoryには100-story、effect-story、unseen-story等のRunnerがあります。

ただし、**完成判定に使う場合は必ず現在の対象Commit SHAで再実行**してください。

---

## 14. 完成条件

Astera v8をCompleteと呼ぶには、最低でも同一Commit SHAで以下を成立させます。

```text
Source / JSON / Shell Gate
Runtime tests
QCE tests + blocking registry
Evaluator API tests
Evidence architecture validation
Runtime startup / health
Process API Main8 smoke
REAL Japanese Parser MCP
Evidence General Web LIVE
KB Target LIVE where required
Story / unseen-story regression
false confirmation = 0
final decision violation = 0
required constraint preservation
Docs / Runtime map一致
```

異なるSHAの成功結果を混ぜて完成判定しません。

---

## 15. Repository map

```text
astera_v8/
├─ start.js
├─ src/
│  ├─ server.js
│  ├─ kagura-engine.js
│  ├─ astera-engine.js
│  ├─ canonical-astera-engine.js
│  ├─ canonical-astera-engine-base.js
│  ├─ deterministic-task-decomposer.js
│  ├─ japanese-parser-mcp-client.js
│  ├─ canonical-claim-runtime.js
│  ├─ canonical-evidence-resolver.js
│  ├─ evidence-search/
│  ├─ quality-completion-evaluator/
│  ├─ runtime/
│  ├─ pillars/
│  └─ auth/ billing/ guard/ store/   # migration debt
├─ test/
├─ scripts/
├─ .github/workflows/
├─ deploy/
├─ docs/
│  └─ ARCHITECTURE.md                # canonical design reference
├─ artifacts/                        # generated evidence; cleanup/curation required
└─ archive/                          # historical only; never canonical design
```

---

## 16. Documentation rule

実装を確認する際の優先順位:

```text
1. 明示された現行Owner決定
2. docs/ARCHITECTURE.md
3. 現行Code / Contract / Test
4. README / STRUCTURE summary
5. Archive / historical docs
```

Archive、過去Story Artifact、古いREADME記述から現在仕様を逆生成しません。

---

## 17. 関連文書

- **Canonical design:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- API surface / migration boundary: [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md)
- Lens index: [`docs/LENS_GENRE_INDEX.md`](docs/LENS_GENRE_INDEX.md)
- Domain template catalog: [`docs/DOMAIN_TEMPLATE_CATALOG.md`](docs/DOMAIN_TEMPLATE_CATALOG.md)

その他の文書は今後のRepository cleanupで、重複・歴史資料・現行利用有無を判定して統合または削除します。
