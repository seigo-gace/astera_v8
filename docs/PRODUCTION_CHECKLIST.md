# Astera v8 — Production Checklist

## A. Responsibility

- [ ] Astera v8 CoreとApp / Account / Commerce / Gateway / KBの責務を分離した
- [ ] Account、Square、Credit、個人情報DBをRuntimeへ持ち込んでいない
- [ ] Legacy Tenant / Stripe経路の移行計画とRollbackを用意した
- [ ] Public docsがLegacy Codeを現行Core機能として宣伝していない

## B. Verification

- [ ] 対象Commit SHAを記録した
- [ ] `npm test`が成功した
- [ ] `bash scripts/smoke.sh`が成功した
- [ ] `npm run verify`が成功した
- [ ] GitHub Actionsが対象SHAで成功した
- [ ] `KB-HB-016` Registry mismatchを解消し、再検証した
- [ ] 01〜08の順序と内容をStory inputで確認した
- [ ] clarification pathを確認した
- [ ] Optional LLMなしでもCoreが動作した

## C. Security

- [ ] HTTPS終端を設定した
- [ ] CORSを許可Originへ限定した
- [ ] Secretを本番専用値へ変更した
- [ ] BrowserへServer Secretを埋め込んでいない
- [ ] Input本文、個人情報、決済情報をLogへ送っていない
- [ ] TGserver配送前のSecret removalを確認した
- [ ] OutboxのRetry / TTL / success deletionを確認した
- [ ] Backup / Restoreを実行確認した

## D. Deployment

- [ ] Docker Composeで起動した
- [ ] `docker compose config`が成功した
- [ ] `/healthz`が成功した
- [ ] Runtime Portを直接公開していない
- [ ] Reverse Proxy / Cloudflareのtimeoutとbody limitを設定した
- [ ] Monitoringを接続した
- [ ] Rollback先のCommit / Image / Configを確認した

## E. External systems

- [ ] Astera AppのAccount Contractを確認した
- [ ] Square / Credit反映をCommerce側で確認した
- [ ] Webhook Gatewayの受信・検証・再送を確認した
- [ ] TGserverのProject / Topicを確認した
- [ ] ASTERA-KBへ自動保存しないことを確認した
- [ ] External LLM / Search / Translationは実Credential環境で個別検証した

## F. Documentation

- [ ] README、Public Pack、Architecture、API、Limitationsを同期した
- [ ] Notion議事録・設計正本へCommit SHAと検証結果を記録した
- [ ] 未実装・未検証・FutureをImplementedへ混ぜていない
- [ ] 料金・Credit・法務をApp側正本へ一本化した
- [ ] `archive/`を現行仕様として参照していない
