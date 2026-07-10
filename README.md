# Astera v8 — AIコグニションランタイム

## 概要

Astera v8は、問いを多角的に分析し、実行可能な結論へ導くAIコグニションランタイムです。
真実、危機、多角的な視点、反対意見、比較といった5つの視点から情報を整理し、意思決定をサポートします。
単一の答えを急ぐのではなく、複雑な問題を体系的に解き明かし、次の行動へと繋げるための基盤として機能します。

## 主な機能

*   **V8並列処理**: Node.jsのWorker threadsを活用し、高速な並列処理を実現。
*   **5つの視点**: Fact (事実), Risk (危機), Multi (多角的), Inquiry (問い), Compare (比較) のフレームワークで分析。
*   **自動Domain Router / Template Lens**: ユーザーの入力内容から最適な分析テンプレートを自動選択。
*   **8セクション出力**: 以下の8つのセクションで、深く、安全で、目的に合った回答を生成します。
    1.  **01 本当の目的**: 表面的な依頼の裏にある真の目標を整理。
    2.  **02 前提不足**: 答えを作るために不足している情報や条件を特定。
    3.  **03 事実確認**: 情報の事実、推測、未確認情報を明確に区別し、必要に応じてエビデンスを提示。
    4.  **04 危機察知**: 実行によって生じうるリスクや潜在的な問題を事前に検出。
    5.  **05 反対視点**: 異なる立場からの意見や批判的な視点を取り入れ、多角的な検討を促す。
    6.  **06 比較案**: 複数の選択肢を提示し、それぞれのメリット・デメリットを比較。
    7.  **07 推奨判断**: 総合的な分析に基づき、現時点で最も合理的な判断を提示。
    8.  **08 主役AIへの再指示**: 上記の分析結果を基に、より精度の高いAI指示文を生成。
*   **多言語対応**: 内部処理は英語Canonicalで安定性を確保し、表示はユーザーの言語に自動追従。
*   **Human Reader**: ユーザーの感情や意図（急ぎ、怒り、混乱など）を検出し、分析に反映。
*   **堅牢な運用**: APIキー、テナント分離、レート制限、Stripe連携、ログ集約など、本番環境に必要な機能を標準搭載。
*   **npm依存ゼロ**: 外部ライブラリへの依存を最小限に抑え、シンプルで安定した動作。

## 導入と起動 (Docker Compose)

本番環境での稼働はDocker Composeを推奨します。

```bash
docker compose up -d --build
```

### ブラウザアクセス

Astera v8は以下のURLでアクセス可能です。

```text
http://127.0.0.1:7373
```

## テスト

開発中のテストには以下のコマンドを使用します。

```bash
npm test
bash scripts/smoke.sh
npm run verify
```

## API利用例

### ユーザー登録 (APIキー取得)

```bash
curl -X POST http://127.0.0.1:7373/signup
```

### 処理実行 (質問と応答)

APIキー`kg_xxx`は`/signup`エンドポイントで取得したものを利用してください。

```bash
curl -X POST http://127.0.0.1:7373/process \
  -H "Content-Type: application/json" \
  -H "X-API-Key: kg_xxx" \
  -d '{
    "question":"Astera v8をどう活用すべき？",
    "llm":{"chain":["null"]},
    "moodAnswers":{"deepThink":true}
  }'
```

## 主要な設定 (環境変数)

Astera v8では`ASTERA_*`の環境変数が使用されます。旧`KAGURA_*`も後方互換として読み込まれます。

*   `ASTERA_HOST`, `ASTERA_PORT`: サービス稼働ホストとポート
*   `ASTERA_DB`: データベースファイル（SQLite）
*   `ASTERA_API_KEY`: APIキー設定
*   `ASTERA_CORS_ORIGINS`, `ASTERA_REQUIRE_HTTPS`, `ASTERA_ENABLE_HSTS`: セキュリティ関連設定
*   `ASTERA_TGS_ENABLED`, `ASTERA_TGS_URL`, `ASTERA_TGS_PROJECT_ID`: TGserverログ集約設定
*   `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`: Stripe連携設定

## ログ集約 (TGserver)

HTTPアクセス、認証失敗、推論結果、Stripeイベントなど、主要なランタイムイベントは構造化JSONとしてTGserverへ自動集約されます。APIキーやStripeシークレットなどの秘密情報はマスクされ、未送信イベントは一時的にローカルに保持されます。

## その他の重要ドキュメント

*   `STRUCTURE.md`: Astera v8のディレクトリ構造とコンポーネント間の依存関係
*   `docs/BRAND_PHILOSOPHY.md`: ブランド理念
*   `docs/DOMAIN_TEMPLATE_CATALOG.md`: ドメインごとのテンプレートカタログ
*   `docs/FULL_DOCUMENT.md`: 詳細な仕様書
*   `docs/ARCHITECTURE.md`: アーキテクチャ設計
*   `docs/API_REFERENCE.md`: APIリファレンス
*   `docs/PRODUCTION_CHECKLIST.md`: 本番運用チェックリスト
*   `docs/SECURITY_NOTES.md`: セキュリティに関する注意点
*   `docs/DEPLOYMENT_VPS.md`: VPSへのデプロイ手順
