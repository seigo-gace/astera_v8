# Astera v8 — Glossary

Updated: 2026-09-26

Canonical architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md)

| Term | Meaning |
|---|---|
| Astera v8 | 問いをEvidence-backedな判断材料へ変換する非AI・決定論的Runtime |
| Three Core Modules | 判断材料生成Module / 根拠検索Module / 判定Module |
| Judgment Material Generation / 判断材料生成Module | InputをTask / Claim / Evidence Requirementへ構造化し、Five LanesとMain8へ投影するModule |
| Evidence Search / 根拠検索Module | 外部Sourceを検索し、Candidateを測定・品質判定して採用Evidenceまたは未解決状態を返すModule |
| Evaluation / Verification / 判定Module | SubjectをProfile / Measurements / Evidenceで汎用評価し、Score / Blocking / Judgment / Auditを返す非AI Module |
| Main AI / 主役AI | Asteraの材料を受け、必要に応じて最終回答・判断を行う外部AI。Astera自身ではない |
| Final Decision Authority | Human / Main AI / Calling System。AsteraはExternal-only final decision boundaryを維持する |
| Judgment Material | 判断のための構造化材料。最終Decisionそのものではない |
| Main8 / 8段 | 01本当の目的 / 02前提不足 / 03事実確認 / 04危機察知 / 05反対視点 / 06比較案 / 07根拠成立状態 / 08主役AI・利用者への再指示 |
| Five Lanes / 5本柱 | Fact / Risk / Multi / Inquiry / Compare。共通Canonical recordsから独立投影する |
| Compare | 比較材料を生成するLane。Ranking、Winner、Recommendationを所有しない |
| Task | Inputを実行・検証可能な処理単位へ分解したもの |
| Task Graph | Task間の`depends_on`関係と実行順を保持するDependency Graph |
| Execution Wave | Dependency順を守ったTask実行Group。同一Waveの独立Taskだけを並列化する |
| Bounded Concurrency | 並列数を固定上限内へ制限し、Resource暴走を防ぐ実行Policy |
| Task Admission | Active Task数とQueue上限を管理する受付境界。容量超過は明示的にRejectする |
| `TASK_QUEUE_FULL` | Task admissionのQueue容量を超えたため、新規Workを無制限に積まずRejectした状態 |
| `SKIPPED_DEPENDENCY` | 必須DependencyがFailed/Skippedのため、後続Taskを誤実行せずSkipした状態 |
| Cancellation Propagation | Request/TaskのCancelをQueue待ち・Wave実行へ伝播し、不要処理を継続しない仕組み |
| Claim | 検証対象となる主張。Search resultに合わせて後からTruthを作り替えない |
| Canonical Claim Record | Claim、Policy、Binding、Confirmation等を保持する正規化Record |
| Evidence Requirement | Claimを検証するために必要なSource role、scope、条件等 |
| Search Plan | Claim / Evidence Requirementから生成する検索計画 |
| Evidence | 外部Source record、Test、Repository artifact等の検証可能な裏付け |
| Evidence Candidate | Provider取得後、まだ採用Evidenceとして確定していない候補 |
| Accepted Evidence | Evidence Searchの採用条件を満たしたEvidence |
| Evidence gap | 必要だが成立していない・取得できていない根拠 |
| `CONFIRMED` | Canonical Claim confirmation条件を満たした状態。単にSearch Candidateが存在するだけでは成立しない |
| `UNDETERMINED` | Claimを確定する根拠・条件が不足している状態 |
| Evidence Search Information Quality | Retrieved CandidateをEvidenceとして採用可能か判定する専用sub-capability。Generic Evaluation v2とは別Contract |
| Reinforcement Search | Initial Information Qualityが要求した場合に行う追加検索Phase |
| `FINAL_VALID` | Evidence SearchのFinal Information Qualityを通過した採用可能状態 |
| Evidence Registry | Generic Evaluator v2が評価に使うEvidence record集合とIntegrity情報 |
| Evidence Binding | EvidenceをMeasurement / Claim等の評価対象へ結び付ける追跡情報 |
| Measurement | Generic EvaluatorがMetricへ入力する実測値。Provenance / Hashを伴う |
| Metric | Profile内の評価尺度 |
| Dimension | 複数Metricをまとめる評価軸 |
| Hard Blocking | Scoreに関係なく`BLOCKED`へできる重大条件 |
| `PASSED` | Generic v2でProfile thresholdとHard Block条件を満たした評価状態。Deploy/merge/publication許可ではない |
| `REVISION_REQUIRED` | Hard Blockはないが必要Score/Dimension条件を満たさないGeneric v2状態 |
| `BLOCKED` | Hard Blocking conditionが成立したGeneric v2状態 |
| `INVALID_INPUT` | Generic v2 Request Contractが成立しない状態 |
| `EVALUATION_FAILED` | Generic v2評価処理がEvidence Search等のFailureで完遂できない状態 |
| Legacy Evaluator v1 | `/v1/evaluate`等で維持される旧Quality / Completion系互換Contract。Generic v2とは区別する |
| QCE | Historical abbreviation for the legacy Quality Completion Evaluator. Current generic module nameとして使用しない |
| Lens | Domain固有のRisk / Inquiry / Comparison / Evidence requirement観点 |
| Primary Lens | `G01`〜`G38`から選ばれる主Lens |
| Secondary Lens | Primaryを補助するLens候補 |
| Overlay | High-stakes legal、medical safety、current information、evidence strict、safety abuse等の追加観点 |
| Human Reader | 入力SignalからPresentation/attention材料を補助する固定Rule機能。TruthやFinal Decisionを変更しない |
| Japanese Parser boundary | 日本語解析を行う外部解析境界。Asteraの4つ目のModuleではない |
| Optional LLM Adapter | 外部LLMを必要時に接続する境界。Asteraの決定論的Moduleそのものではない |
| Internal Service Auth | Core/Evidence等の内部HTTP Requestを署名・期限・Nonce等で検証するShared boundary |
| TGserver Logging | Secret除去済み構造Logを送る外部Logging boundary。判断Moduleではない |
| Outbox | TGserver配送失敗Eventの一時Retry領域。Evidence/Knowledge Baseではない |
| Google V8 | Node.jsが利用するJavaScript Engine |
| Worker Threads | Node.jsの並列実行機構。Asteraの別AI/Agentを意味しない |

---

## Terminology rules

Current technical docsでは次を守ります。

```text
07 = 根拠成立状態
Compare = material only
Task Graph = dependency-aware deterministic execution
Generic v2 = Evaluation / Verification
Information Quality = Evidence Search candidate adoption
QCE = historical / legacy context only
PASSED ≠ deploy / merge / publish permission
```
