# TGserver ZERO Integration

Astera-v8の開発Evidence取得は、TGserver ZEROの中央GitHub Readerへ統一する。

このDocumentは、CHATがMasterのTerminal貼付へ依存せず、Source/Test/Build/VerifyとRuntime Logを取得するためのProject側Contractである。

## Authority

TGserver ZEROの中央Authorityは`seigo-gace/TGserver`のmainとし、Project側でReader実装を複製しない。

Astera-v8のTGserver ZERO登録は中央Project Mapを正本とする。2026-10-04時点の確認済みCurrent Authorityでは:

```text
repository=seigo-gace/astera_v8
stream=default
project_id=P002
registered=true
```

Project IDはAstera側で推測・再採番しない。中央Mapと不一致の場合はTGserver側の登録作業として扱う。

## Source / Test / Build / Verify evidence

Project Repository自身の`.github/workflows/dev-probe.yml`を使用する。

通常運用Trigger:

```text
owner-only GitHub Issue
Title prefix: [DEV-PROBE]
```

`[DEV-PROBE]` Issueは実行要求だけであり、Issue本文をShell Commandとして評価・展開・実行しない。

Development Probeは新しい検証Frameworkを持たず、既存Canonical Workflow:

```text
.github/workflows/verify.yml
```

をReusable Workflowとして呼び出す。

Canonical Verifyが所有するSource tests / Initial Fast Path gate / real Japanese Parser build and release gate / real HTTP smoke / unseen effect gateをそのまま再利用する。

Development Probeは固定Evidence JSONを3日Artifactとして保存する。CHATはGitHub Actions Job LogとArtifactを直接Readbackし、Source/Test/Build/Verifyの状態を確認する。

Feature BranchでWorkflow自身を検証するときだけ`pull_request` Triggerを使用する。これはProduction操作ではなく、固定されたCanonical Verifyを同じSource SHAで実行するためのPre-merge検証経路である。

## Runtime / Server Log evidence

Runtime Logを読む場合、Astera-v8 RepositoryからTGserver `/search`を直接呼ばない。

CHATは`seigo-gace/TGserver`のTGserver ZERO中央Readerを使用する。

標準要求:

```text
repo=seigo-gace/astera_v8
stream=default
```

中央ReaderがProject Mapから登録済みProject IDを解決し、Cloudflare Accessを経由してlegacy `/search`を実行し、sanitized Artifactを生成する。

```text
GitHub Issue [TGZERO]
→ TGserver ZERO GitHub Actions
→ Cloudflare Access
→ TGserver ZERO
→ legacy /search
→ sanitized Artifact
→ CHAT readback
```

TGserver vNextはこの経路では使用しない。

## Producer boundary

Astera-v8のRuntime Producerは既存の`src/logging/tgs-client.js`と`src/logging/outbox.js`を使用する。

Producerは中央Readerとは別責務である。既存のP002送信、Secret masking、一時Outbox、成功後削除、失敗時再送を維持する。

Project側のProducer Sourceが存在すること、CI TestがPASSすること、実Runtime Logが中央Readerで検索できることは別々に検証する。

## Prohibited integration

Astera-v8側では以下を行わない。

- TGserver ZERO `/search`へのProject-local direct call
- `LEGACY_TGSERVER_URL`等を使った独自Reader Workflow
- Cloudflare Access Client ID / Secretの複製
- Issue本文からの任意Shell Command実行
- GitHub Actionsからの任意Server Command
- Deploy / restart / recreate
- Secret変更
- Provider変更
- TGserver vNext利用
- Project IDの推測・既存P番号の流用

## State separation

Evidenceは必ず別状態として扱う。

```text
SOURCE
TEST
CI
RUNTIME
PRODUCTION
```

SourceやCIがPASSしてもRuntimeを自動的にPASSへ昇格しない。Runtime Log検索が必要な場合はTGserver ZERO中央Readerの実検索とCHAT側Artifact Readbackまで確認する。

## Legacy reader retirement

ZERO統一前にAstera-v8側へ存在した次のProject-local Readerは廃止する。

```text
.github/astera-legacy-tgserver-query.json
.github/workflows/astera-legacy-tgserver-log-read.yml
```

以後、Runtime Log ReaderのAuthorityは`seigo-gace/TGserver`のTGserver ZERO中央Readerだけとする。
