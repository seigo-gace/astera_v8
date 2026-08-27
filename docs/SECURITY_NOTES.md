# Astera v8 — Security Notes

## 1. 守るべき秘密情報

- Tenant API Key
- `ASTERA_SKILL_API_KEY`
- `ASTERA_KEY_PEPPER`
- Internal Service Secret / Secret File
- Evidence Provider credential
- LLM API Key（外部Adapter利用時）
- ユーザーがRequestで許可された形で渡すBYOK Key

## 2. Core Security Boundary

Coreで維持する防御:

- API Key / Tenant解決
- HTTPS / CORS
- Rate Limit
- Request Size
- Allowed Options
- Abuse Guard
- Usage Meter境界
- Secret Mask
- structured security log

Plan / Credit / Checkout / Subscription / PaymentはCoreのSecurity authorityではない。外部Account / App / Commerce境界が決定したCredential / PolicyをCoreが受け取る構造とする。

## 3. 実装上の防御

- API Keyは平文保存を避け、Storeではhash化した参照を使用する。
- Response / Logへ出るsecret、apiKey、token、password、credential系値をMaskする。
- WorkerPoolにTimeoutを設定する。
- 外部HTTP / LLM AdapterにTimeoutとResponse上限を設定する。
- 不正JSONは4xxで拒否する。
- Payload Sizeを制限する。
- CORS Originをallowlistで制御する。
- HTTPS必須化とHSTSを設定可能にする。
- Skill API Keyを公開Tenant Keyと分離する。
- Evidence SearchでPaid Searchを現行無効とする。

## 4. Account / Billing Boundary

Astera CoreはAccount発行・Checkout・Subscription・Payment・Billing Webhookを公開しない。これらは外部のAccount / App / Billing境界で認証・冪等性・決済検証を行う。

## 5. Local No-Auth

`ASTERA_LOCAL_NO_AUTH=1`はLoopback開発・Smoke専用。

- Productionで使用しない
- Public bindへNo-Authを持ち出さない
- Smoke終了後のRuntime設定へ継承しない

## 6. Evidence / Internal Service

- Internal Service Secretは十分長い値またはSecret Fileで管理する。
- Evidence Provider failureを成功へ変換しない。
- Evidence未設定時は明示Unavailableにする。
- 有料Providerを無断実行しない。
- External source dataをSecretとしてLogへ丸ごと複製しない。

## 7. Logging

- Secret Mask後のEventだけを外部Log sinkへ送る。
- 未送信EventだけをTemporary Outboxへ保持する。
- 成功済みEventを二重保存しない。
- Health successの大量Noiseを通常Access Logへ残さない。
- Error / Auth failure / abnormal closeは監査対象とする。

## 8. Production前に確認すること

- HTTPS終端
- CORS allowlist
- `ASTERA_LOCAL_NO_AUTH=0`
- Production専用`ASTERA_KEY_PEPPER`
- Skill/Public Key分離
- Internal Secret管理
- Rate / Payload / Timeout実Runtime確認
- Backup / Restore
- TGserver / Outbox挙動
- Dependency / Node runtime version
- Required Test / CI Evidence

詳細は`docs/PRODUCTION_CHECKLIST.md`を参照する。

## 9. 状態の扱い

Security Codeが存在することと、本番で有効であることは別である。設定・Test・CI・Deploy・Runtime readbackを個別Evidenceとして確認する。
