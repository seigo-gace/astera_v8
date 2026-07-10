# Astera v8 — STRUCTURE（構成図・絶対）

> LibralCore 第六原則: 本Projectの実装・配置はこの構成図に従う。

## 責務

Astera v8は問いの意味判定・認知前処理・推論を担当する。ログの永続保存、検索、KB登録は担当しない。

- ログ永続正本: TGserver経由のTelegram
- ログ検索索引: TGserver配下のMeilisearch
- ログ送信失敗時の一時状態: `/home/admin1/logs/astera-v8/outbox`
- テナント・使用量・Stripe webhook冪等性: `/data/astera.db`（アプリケーション状態。ログ正本ではない）
- KB連携: 未実装。生ログ・推論結果の自動投入は禁止

## ディレクトリ構造

```text
astera_v8/
├── STRUCTURE.md               # 本ファイル（構成図・絶対）
├── README.md                  # Project入口
├── RELEASE_MANIFEST.txt       # 配布対象一覧
├── start.js                   # Dockerコンテナのcomposition root
├── package.json
├── Dockerfile
├── docker-compose.yml         # 本番常駐の唯一の起動方式
├── .env / .env.example
├── .gitignore / .dockerignore
├── src/
│   ├── server.js              # HTTP境界・routing
│   ├── kagura-engine.js       # 認知処理の統合
│   ├── domain-template-router.js # 入力正規化・用途テンプレート自動判定
│   ├── worker-pool.js         # Worker lifecycle
│   ├── logger.js              # 構造化イベント生成・配送順序
│   ├── logging/
│   │   ├── tgs-client.js      # TGserver HTTP配送・再試行
│   │   └── outbox.js          # 未送信イベントの一時状態
│   ├── safe-json.js           # secret除去・安全なJSON処理
│   ├── mood-detector.js
│   ├── hyperion-human-reader.js
│   ├── auth/                  # tenant認証
│   ├── billing/               # 課金・使用量
│   ├── guard/                 # rate limit
│   ├── llm/
│   │   ├── llm-client.js      # provider chain
│   │   ├── adapter-base.js    # adapter契約
│   │   ├── adapters.js        # provider factory
│   │   ├── http-client.js     # timeout・response上限
│   │   └── providers/         # 1 provider = 1 Module
│   ├── pillars/               # 認知処理Worker群
│   ├── store/                 # アプリケーション状態
│   └── public/                # 最小Web UI
├── test/                      # Node標準test
├── scripts/                   # 短時間の検証用。常駐禁止
├── deploy/
│   └── nginx/                 # Docker前段のHTTPS reverse proxy例
├── docs/                      # 仕様・API・運用文書
└── archive/                   # 廃止資材の退避先（削除禁止）
```

## 依存方向

```text
start
  → server
      → auth / guard / billing / store
      → kagura-engine
          → worker-pool → pillars
          → llm adapters
          → logger → logging/tgs-client → TGserver
                   → logging/outbox → /home/admin1/logs/astera-v8/outbox
```

- `server`より下位のModuleは`server`をimportしない。
- `kagura-engine`より下位のModuleは`kagura-engine`をimportしない。
- `logger`はTGserverのHTTP ingest契約だけに依存し、TGserver内部Moduleをimportしない。
- TGserverはAsteraをimportせず、意味判定を行わない。

## Module責務

| Module | 単一責務 |
|---|---|
| `server` | HTTP受付・認証順序・response |
| `kagura-engine` | 認知処理の順序統合 |
| `domain-template-router` | 入力正規化・用途テンプレート自動判定 |
| `worker-pool` | Workerの割当・timeout・再生成 |
| `pillars/*` | 各認知観点の決定論的処理 |
| `llm/llm-client` | provider chainとfallback順序 |
| `llm/adapters` | provider名からadapterを生成するfactory |
| `llm/http-client` | 外部HTTPのtimeout・response上限 |
| `llm/providers/*` | 各provider固有のrequest/response変換 |
| `logger` | secret除去済みイベントの生成と配送順序の統合 |
| `logging/tgs-client` | TGserver HTTP配送・timeout・再試行 |
| `logging/outbox` | 未送信イベントの一時保存・復旧・期限削除 |
| `store` | tenant・usage・webhook状態 |
| `billing/*` | Stripe境界・subscription反映 |

## HTTPアクセスログ契約

- 正常終了した `GET /healthz` は定期監視ノイズのため、TGserverへ送信しない。
- `/healthz` の失敗応答・client切断は異常検知の対象として送信する。
- その他のHTTPアクセスは従来どおり構造化イベントとして送信する。

## ログ一時キャッシュ契約

ホスト上の `/home/admin1/logs/astera-v8/outbox` はTGserver配送の一時状態だけに使用する。

- 書込条件: TGserver送信開始前に、secret除去済みイベントを1件1ファイルで置く。
- 再送条件: 初回送信失敗時の規定回数再試行、およびプロセス再起動時。
- 削除条件: TGserverが2xxを返した直後。
- 保持期限: 7日（`ASTERA_LOG_CACHE_TTL_MS`で変更可能）。期限超過ファイルは起動時に削除する。
- 禁止: 成功済みログの複製、長期監査ログ、Telegram原本の複製、KB、仕様書。
- Project直下へ`logs/`や`astera-logs/`を作らない。

## 運用境界

- 本番常駐はDocker / Docker Composeのみ。
- `node start.js`と検証scriptは短時間検証に限る。
- systemd / pm2 / nohup / screen / tmuxによるアプリ直接常駐は禁止。
- 本番起動・再起動・切替は管理者の明示承認後に行う。
- 不要資材は削除せず`archive/YYYY-MM-DD/`へ退避する。
