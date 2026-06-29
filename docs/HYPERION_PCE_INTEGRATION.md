# Astera v8 v1.1.1 統合仕様

## 1. 結論

旧KAGURA v1.1.0 Hyperion Max は、旧KAGURA v1.0.1 の「起動可能なSaaS基盤」に、V8-Hyperion / PCE 構想の中核である「人を読む」と「複数案を競わせる」を統合した最大火力版である。

## 2. 統合した心臓

### 2.1 人を読む Hyperion Human Reader

追加ファイル:

```text
src/hyperion-human-reader.js
```

検出する状態:

```text
urgency       急ぎ・時間圧
anger         怒り・不満
fatigue       疲労
confusion     混乱
precision     正確性要求
scope_pressure 全部・完璧・最大火力要求
build_mode    コード・DL・起動・テスト要求
```

出力:

```json
{
  "mode": "high_pressure | supportive | audit | builder | stable",
  "load": 0,
  "signals": [],
  "likely_needs": [],
  "response_policy": [],
  "drift_watch": []
}
```

### 2.2 多重案競争 PCE-DCE

追加ファイル:

```text
src/pillars/dialectic-worker.js
```

生成する候補:

```text
主案          mainline
悪手案        bad_hand
反対案        opposition
第三案        third_way
人読み最適案  human_fit
```

悪手案は採用するためではなく、事故パターンを保存し改善素材にするために残す。

## 3. 処理フロー

```text
質問
 ▼
Inquiry preflight + Human Reader
 ├─ 情報不足なら問い返し
 └─ 続行
     ▼
Fact / Risk / Inquiry を並列実行
     ▼
Multi を逐次実行
     ▼
Dialectic Worker が5候補を生成・採点
     ▼
Compare Worker が通常減点 + 候補ランキングを統合
     ▼
認知マップ + Hyperionランキング + LLMプロンプト
```

## 4. 実装上の変更点

| ファイル | 変更 |
|---|---|
| `src/hyperion-human-reader.js` | 人読み状態検出を追加 |
| `src/pillars/dialectic-worker.js` | 主案・悪手・反対案・第三案・人読み最適案を生成 |
| `src/pillars/pool-runner.js` | `dialectic` workerを許可 |
| `src/pillars/inquiry-worker.js` | `human_reading` を出力 |
| `src/pillars/compare-worker.js` | `selected_candidate` と `candidate_ranking` を統合 |
| `src/kagura-engine.js` | Hyperion/PCE-DCEフローを統合 |
| `src/public/index.html` | Hyperion候補と人読みを表示 |
| `test/engine.test.js` | Hyperion統合テスト追加 |
| `test/security.test.js` | 人読みテスト追加 |

## 5. v1.0.1との違い

| 観点 | v1.0.1 | v1.1.0 Hyperion Max |
|---|---|---|
| 5本柱 | あり | あり |
| 人読み | 機嫌中心 | 状態信号・必要対応・ズレ監視まで拡張 |
| 多重案 | なし | 主案/悪手/反対/第三案/人読み最適案 |
| Compare | 単一認知マップ採点 | 候補ランキング統合 |
| プロンプト | 5本柱中心 | 5本柱 + Hyperionランキング |
| 思想再現 | KAGURA MVP | KAGURA + V8-Hyperion/PCE統合 |

## 6. 注意

この版は最大火力統合版だが、LLMを何度も呼び出して複数回答を生成する完全PCEではない。v1.1.0では、ルールベースで候補を生成・採点し、最終LLM呼び出しは1回に抑える。これにより、コストと速度を守りながら、Hyperion思想を実装へ落としている。

将来のv1.2以降で、各候補を個別LLMに投げて本格的な多重回答競争に拡張できる。
