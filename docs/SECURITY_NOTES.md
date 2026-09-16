# Astera v8 — Security Notes

Updated: 2026-08-03

## 1. Security boundary

Astera v8 Coreは判断材料生成を担当します。Account、個人情報、Square、Credit、財務DBは別Systemが所有します。

Coreへ不要な個人情報や決済情報を渡さないことが第一の防御です。

## 2. Secrets currently present in repository configuration

- Runtime API secrets (`ASTERA_API_KEY`, `ASTERA_SKILL_API_KEY`)
- Internal service secrets
- Evidence spool / recovery keys
- Optional external LLM keys
- TGserver connection secrets

## 3. Implemented protections

- Secret / token / password pattern masking
- Payload size protection
- JSON parse validation
- Worker timeout
- External HTTP timeout
- CORS allowlist option
- HTTPS / HSTS option
- Structured logging
- Failed log delivery outbox
- Skill API key authentication

## 4. Required production controls

- Cloudflare / reverse proxyでHTTPS終端
- CORSを許可Originへ限定
- BrowserへServer Secretを埋め込まない
- Input本文、個人情報、決済情報をLogへ送らない
- TGserverへ送る前にSecret removalを検証
- Outboxを長期Log DBとして使用しない
- Container、Secret、Backup、Restore、Monitoringを検証
- App / Account / CommerceとのContractを明示する

## 5. Data minimization

Asteraへ渡すのは判断に必要な範囲だけにします。

- 不要な氏名、住所、電話、Card情報を除去
- 文書は必要Sectionへ絞る
- High-risk dataは識別子を置換する
- Logには原文を無条件保存しない

## 6. Responsibility boundary warning

Core HTTP does not own account, billing, subscription, signup, or commerce state. Do not embed App-owned credentials in Core deployment or treat Core as the account or payment system of record.

## 7. Domain Lens と QCE

QCE は Evidence 取得後に Domain Lens 充足で Blocking しません。Lens 確認不足は Evidence Search / Information Quality の責務です。

## 8. Incident evidence

障害報告では次を残します。

- Commit SHA
- Request ID
- Timestamp
- Endpoint
- Secret除去済みError
- Reproduction inputの最小化版
- Container / workflow status
