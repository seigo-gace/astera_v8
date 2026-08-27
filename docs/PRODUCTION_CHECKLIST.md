# Astera v8 — Production / Release Evidence Checklist

> このChecklistは「本番投入済み」を宣言するものではない。各項目は実行・Evidence取得後にのみ完了扱いとする。G5承認前はDeploy / Release / Production変更を行わない。

## 1. Authority / Scope

- [ ] G5 Promotion / Release GateがMasterから明示承認されている。
- [ ] 対象Repository / Branch / Commit SHAが固定されている。
- [ ] Release対象FileとOut of Scopeが固定されている。
- [ ] main / protected branchの現行運用Ruleを再確認した。
- [ ] Force Push / 無断Merge / Branch削除を行わない。

## 2. Canonical Core Boundary

- [ ] `GET /healthz`の`commerce_boundary.legacy_routes_enabled=false`を実Runtimeで確認した。
- [ ] `POST /signup`がCanonical Runtimeで404である。
- [ ] `POST /billing/checkout`がCanonical Runtimeで404である。
- [ ] `POST /billing/webhook`がCanonical Runtimeで404である。
- [ ] Tenant CredentialはCore外のAccount / App境界からProvisioningされる。
- [ ] Plan / Credit / PaymentのBusiness LogicがCoreへ混在していない。
- [ ] Usage MeterはCore境界として維持されている。

## 3. Canonical Naming

- [ ] Canonical Engine実装が`src/astera-engine.js`である。
- [ ] Runtimeの現行Class名が`AsteraEngine` / `AsteraServerBase`系である。
- [ ] 新規Canonical Codeが旧`Kagura`内部名へ逆戻りしていない。
- [ ] `ASTERA_*`を正式Env名として使用している。

## 4. Authentication / Guard

- [ ] `ASTERA_KEY_PEPPER`を本番専用の十分長いRandom値へ変更した。
- [ ] `ASTERA_LOCAL_NO_AUTH=0`である。
- [ ] Public `/process`はTenant API Key必須である。
- [ ] Skill APIは公開Tenant Keyとは異なる`ASTERA_SKILL_API_KEY`を使用する。
- [ ] CORS allowlistを本番Originへ限定した。
- [ ] HTTPS終端を設定した。
- [ ] `ASTERA_REQUIRE_HTTPS=1`等の採用Security設定を確認した。
- [ ] API Key / LLM Key / Internal SecretがLogへ平文出力されない。
- [ ] Payload上限、Timeout、Rate Limitが実Runtimeで有効である。

## 5. Input / Task / Lens

- [ ] Input Understandingが対象言語・Scriptを処理できる。
- [ ] Multi-task RequestがAnalysis Task Graphへ分解される。
- [ ] Dependency / Execution Waveが保持される。
- [ ] TaskごとにG01-G38 LensがRoutingされる。
- [ ] Operation IntentとDomain Lensを混同しない。
- [ ] Hard Constraint / Prohibition / Preserve条件がTaskへ残る。

## 6. Evidence

- [ ] Evidence不要Taskは`NOT_REQUIRED`になる。
- [ ] Evidence必要Taskで根拠なしFactをConfirmedへ昇格しない。
- [ ] Evidence Search未設定時は明示Unavailableになる。
- [ ] Provider failureがRejected / Partialとして保持される。
- [ ] Paid searchが現行Policyどおり無効である。
- [ ] Integrated ProcessでTask別EvidenceがDecision Materialsへ接続される。

## 7. Main8 / Decision Trace

- [ ] 01-08が固定順序で生成される。
- [ ] Task IDがTraceへ残る。
- [ ] Lens IDがTraceへ残る。
- [ ] Evidence RefがTraceへ残る。
- [ ] Constraint / Risk / Candidate比較がTraceへ残る。
- [ ] Rejected reason / Uncertainty / Blocking conditionが失われない。
- [ ] Blocking状態を解消せず最終確定しない。

## 8. Module Switch / Evaluator

- [ ] `astera.decision-materials`が明示Targetで動作する。
- [ ] `astera.evidence-search`が明示Targetで動作する。
- [ ] `astera.quality-gate`が明示Targetで動作する。
- [ ] 不正Targetが`INVALID_MODULE_TARGET`で拒否される。
- [ ] Quality Completion EvaluatorがKBへ自動Publishしない。
- [ ] `KB_ELIGIBLE`を保存済みと誤認しない。

## 9. Logging

- [ ] Secret Mask後のEventだけが外部Log sinkへ渡る。
- [ ] TGserver設定時の配送を実Runtimeで確認した。
- [ ] TGserver停止時に未送信Outboxが残る。
- [ ] 再接続後に未送信Eventが再送される。
- [ ] 成功済みEventをOutboxへ恒久保持しない。
- [ ] `/healthz`成功Accessを不要Noiseとして大量保存しない。

## 10. Test

- [ ] `node --test` / `npm test`を対象Commitで実行した。
- [ ] `test/commerce-boundary.test.js`がPASSした。
- [ ] `test/legacy-naming-boundary.test.js`がPASSした。
- [ ] Input / Task / Lens RegressionがPASSした。
- [ ] Evidence IntegrationがPASSした。
- [ ] QCE Requirement / Evidence / Blocking RegressionがPASSした。
- [ ] Failure caseも期待StatusでPASSした。

## 11. Smoke / API E2E

- [ ] `bash scripts/smoke.sh`が対象CommitでPASSした。
- [ ] `/healthz`実応答を保存した。
- [ ] `/process`実応答を保存した。
- [ ] `/v1/skill/process`実応答を確認した。
- [ ] `/v1/evidence/search`設定有無に応じた期待応答を確認した。
- [ ] `/v1/integrated/process`実応答を確認した。
- [ ] `/v1/astera/execute`各Targetを確認した。

## 12. Build / CI

- [ ] 対象CommitのGitHub Actions Workflow Runが存在する。
- [ ] Required Workflowが成功している。
- [ ] Combined Status / Check Runに未解決Failureがない。
- [ ] Build Artifactが必要な場合、対象Commit由来であることを確認した。

Workflow定義がRepositoryに存在するだけではCI PASSではない。

## 13. Runtime / Performance

- [ ] Worker Threads統合を実Runtimeで確認した。
- [ ] Process start / stop / graceful shutdownを確認した。
- [ ] Representative Story Testを実施した。
- [ ] Performance Gateを採用値で測定した。
- [ ] Memory / Timeout / concurrency異常を確認した。

## 14. Deploy / Release

G5承認後だけ実施:

- [ ] Merge対象PRとCommit SHAを再確認した。
- [ ] Release / Deploy対象環境を固定した。
- [ ] Deployを実施した。
- [ ] Production Healthをreadbackした。
- [ ] Production API Storyをreadbackした。
- [ ] Rollback条件と手順を確認した。
- [ ] Deploy Evidence / Runtime EvidenceをNotion議事録へ記録した。

## 15. 状態判定

以下を別々に報告する。

- Designed
- Implemented
- GitHub Reflected
- Tested
- CI Passed
- Deployed
- Runtime Verified

未実行項目を`完了`へ繰り上げない。
