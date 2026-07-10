# Astera v8 v1.1.1 完全ドキュメント

## 第1部｜企画

### 1.1 なぜ作るのか

性能で大企業や巨大OSS本体と直接競争しない。Astera v8は「AI自身の入力を、実行環境が並列で賢くする」認知前処理というニッチで一点突破する。

### 1.2 中核アイデア：認知前処理

通常は「質問 → AIに丸投げ → AIが全部処理」になる。Astera v8では「質問 → V8 Workerで下ごしらえ → AIは最終推論に集中」という形に変える。

料理の比喩では、Astera v8はAIの下ごしらえ係。食材である質問を洗い、切り、分類してからLLMへ渡す。

### 1.3 設計思想

- 引き算：全部を負わない。本質だけ残す。
- 一点突破：認知前処理を単一の差別化軸にする。
- 悪手を捨てない：失敗も理由ごと記録する。
- 最初は粗く、使うほど洗練：ルールベースからLLM強化へ段階移行する。
- プロバイダ非依存：OpenAI/Anthropic/Ollama/OpenAI互換/Nullで動く。

## 第2部｜仕様概要

Astera v8は質問を5本柱で処理し、認知マップとAIへ渡すプロンプトを生成する。

1. 真実（Fact）：確認候補・未確認・意見を仕分ける。
2. 危機察知（Risk）：リスクパターンを検出する。
3. 多角度（Multi）：攻め・守り・会心/批判角度から推奨視点を出す。
4. 反対思考（Inquiry）：問いの前提、ニーズ、機嫌を検出する。
5. 比較検証（Compare）：全結果を統合し、原点100からanswer線距離で減点評価する。

## 第3部｜処理順

重要：5本柱すべてを完全同時並列にはしない。

```text
質問
 ▼
Inquiry preflight（機嫌検出・問い返し判定）
 ├─ 問い返す：clarification_neededで停止
 └─ 続行
      ▼
Fact / Risk / Inquiry analysis を並列実行
      ▼
Multi（Fact/Risk/Inquiryを利用）
      ▼
Compare（全結果を統合）
      ▼
認知マップ + AIへ渡すプロンプト + 任意LLM回答
```

## 第4部｜使い方

### 短時間のローカル検証

```bash
node start.js
```

本番常駐はDocker / Docker Composeのみを使用する。

### APIキー発行

```bash
curl -X POST http://127.0.0.1:7373/signup
```

### LLMなし

```bash
curl -X POST http://127.0.0.1:7373/process \
  -H "Content-Type: application/json" \
  -H "X-API-Key: kg_xxx" \
  -d '{"question": "新規事業のニッチを見つけたい。対象は小規模事業者。成功条件は低コストで初月から試せること。"}'
```

### LLM使用

```bash
curl -X POST http://127.0.0.1:7373/process \
  -H "Content-Type: application/json" \
  -H "X-API-Key: kg_xxx" \
  -d '{
    "question": "コスト削減策",
    "llm": {"chain":["anthropic","null"], "apiKey":"sk-xxx"}
  }'
```

### 機嫌を渡す

```bash
curl -X POST http://127.0.0.1:7373/process \
  -H "Content-Type: application/json" \
  -H "X-API-Key: kg_xxx" \
  -d '{
    "question": "次の一手を決めたい。対象は既存ユーザー。成功条件は離脱率を下げること。",
    "moodAnswers": {"good":true, "urgent":false, "deepThink":true}
  }'
```

## 第5部｜プラン

| プラン | 月額 | レート | LLM | 対象 |
|---|---:|---:|---|---|
| Free | 0円 | 5/分 | BYOK | 個人・評価 |
| Pro | 2,000円 | 60/分 | BYOK | スタートアップ |
| Business | 9,800円 | 300/分 | お任せ可 | 中堅事業者 |

## 第6部｜向く場面・向かない場面

向く場面：意思決定支援、事業戦略、AIエージェント前処理、相談系、リスク分析。

向かない場面：単純な事実検索、超低遅延、創作/雑談中心。

## 第7部｜ファイル構成

構成図の唯一の正本はProjectルートの `STRUCTURE.md` とする。本書へ複製せず、配置・依存方向・outbox契約は同ファイルを参照する。

## 第8部｜ロードマップ

- Phase 1：5本柱ルールベース、WorkerPool、認証、BYOK、Stripe基盤。
- Phase 2：各柱をLLM/検索接続で高推論化。
- Phase 3：暗黙知層をInquiryへ追加。
- Phase 4：第2段思考ループ。
- Phase 5：PostgreSQL移行とマルチサーバー対応。

## 第9部｜3行要約

Astera v8は、V8 Worker threadsでAIへの入力を5本柱に分解する認知前処理ランタイムである。
AIを増やすのではなく、AIへ渡す前の問いを賢くすることで質とコストを改善する。
従順に答えるだけでなく、問いを疑い、危機を検出し、比較検証してから最終プロンプトへ落とす。

---

## 第12部｜v1.1.0 Hyperion Max 統合

旧KAGURA v1.1.0では、V8-Hyperion / PCE構想を統合し、5本柱の認知前処理に加えて「人を読む」と「複数案を競わせる」を実装した。

### 12.1 追加された人読み

`src/hyperion-human-reader.js` により、以下の状態を検出する。

- urgency: 急ぎ・時間圧
- anger: 怒り・不満
- fatigue: 疲労
- confusion: 混乱
- precision: 正確性要求
- scope_pressure: 全部・完璧・最大火力要求
- build_mode: コード・DL・起動・テスト要求

この結果は `result.hyperion.human_reading` に入る。

### 12.2 追加された多重案競争

`src/pillars/dialectic-worker.js` により、以下の候補を生成する。

- 主案
- 悪手案
- 反対案
- 第三案
- 人読み最適案

各候補は score と answer_line_distance を持ち、`Compare` が `selected_candidate` と `candidate_ranking` として統合する。

### 12.3 重要な判断

v1.1.0は、各候補ごとに外部LLMを呼ぶ完全PCEではない。最終LLM呼び出しは1回に抑え、コスト・速度・安定性を守る。その代わり、ルールベースのPCE-DCEで主案・悪手・反対案・第三案・人読み最適案を競わせる。
