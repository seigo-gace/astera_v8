# Astera v8 — Security Notes

Updated: 2026-08-03

## 1. Security boundary

Astera v8 Coreは判断材料生成を担当します。Account、個人情報、Square、Credit、財務DBは別Systemが所有します。

Coreへ不要な個人情報や決済情報を渡さないことが第一の防御です。

## 2. Secrets currently present in repository configuration

- Runtime API secrets
- Key pepper
- Optional external LLM keys
- TGserver connection secrets
- Legacy Tenant / Skill keys
- Legacy Stripe secrets

Legacy Secretも、移行完了までは保護対象です。

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
- Legacy Stripe webhook signature verification
- Legacy API key hashing

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

## 6. Legacy compatibility warning

Tenant / Stripe / Store CodeはCore外へ移管する対象です。移管前に削除して認証やWebhookを破壊せず、代替Contract、Migration、Testを用意します。

## 7. Known defect

`KB-HB-016`とBlocking Rule Registryの不一致は、評価Integrityに影響するためSecurity / Quality上の未解消事項として扱います。

## 8. Incident evidence

障害報告では次を残します。

- Commit SHA
- Request ID
- Timestamp
- Endpoint
- Secret除去済みError
- Reproduction inputの最小化版
- Container / workflow status
