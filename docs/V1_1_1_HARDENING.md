# Astera v8 v1.1.1 Hardening Notes

## 目的

レビューで指摘された「条件付き合格」状態から、v1.1.1では商用化前の穴を優先して潰す。

## 実装修正

1. Stripe webhookイベントIDによる冪等性を追加。
2. `processed_events` をStoreへ追加し、重複イベントは再適用しない。
3. `customer.subscription.deleted` は subscription id から tenant を逆引きし、plan/statusを更新する。
4. CORSを allowlist 化し、未許可Originは403にする。
5. `ASTERA_REQUIRE_HTTPS=1` で非HTTPSリクエストを426にする。
6. `ASTERA_ENABLE_HSTS=1` でHSTSヘッダを返す。
7. `ASTERA_*` 環境変数を正式名として追加し、旧 `KAGURA_*` は後方互換にする。
8. Astera v8 正式名称、タグライン、思想文をREADME/docs/UI/package/起動バナーへ反映。

## 追加テスト対象

- 未認証 `/process` は401
- 1MB超過payloadは413
- 未許可CORS Originは403
- Stripe webhook重複イベントは duplicate=true
- Stripe webhook複数v1署名のうち1つが一致すれば許可
- Storeのprocessed_eventsが重複適用を防ぐ

## まだ本番前に残る項目

- 本番Stripe実機検証
- logrotate/systemd/journald設定
- バックアップ/リストア手順の実地検証
- PostgreSQL移行判断
- 利用規約/プライバシーポリシー
- 管理画面
- APIキー再発行/無効化UI
