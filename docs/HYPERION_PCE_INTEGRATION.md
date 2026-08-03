# Astera v8 — Human Reader and Dialectic Integration

Updated: 2026-08-03

## 1. Current position

この文書は、旧KAGURA / Hyperion Maxの製品説明ではありません。

現行Astera v8に残る次の2機能を、現在の責務へ整理した技術資料です。

- `src/hyperion-human-reader.js`
- `src/pillars/dialectic-worker.js`

## 2. Human Reader

Human ReaderはAIではなく、入力内の状態Signalを固定Ruleで検出します。

主なSignal:

- urgency
- anger
- fatigue
- confusion
- precision
- scope_pressure
- build_mode

目的:

- 問い返しの優先度を調整する
- 急ぎと精度要求の衝突を露出する
- Scope過大や混乱をRiskとして残す
- 利用者の状態を最終判断の代替にしない

## 3. Dialectic

Dialecticは、ひとつの案へ固定する前に候補を並べます。

| Candidate | Role |
|---|---|
| mainline | 現実的な主案 |
| bad_hand | 事故・失敗Patternを含む悪手 |
| opposition | 主案への反対案 |
| third_way | 二択を崩す第三案 |
| human_fit | 利用者状態と制約へ適合する案 |

悪手案は採用候補ではなく、失敗を検出するための比較材料です。

## 4. Flow

```text
Inquiry preflight
  → Fact / Risk / Inquiry
  → Multi
  → Human Reader
  → Dialectic candidates
  → Compare ranking
  → 01〜08 Judgment Material
```

## 5. What this is not

- 複数AIを同時実行するMulti-Agent Systemではない
- 各候補を別LLMへ投げる仕組みではない
- 感情診断や心理診断ではない
- 利用者の機嫌だけで推奨を決めない
- 将来のLLM多重競争を実装済みと扱わない

## 6. Current files

- `src/hyperion-human-reader.js`
- `src/pillars/dialectic-worker.js`
- `src/pillars/inquiry-worker.js`
- `src/pillars/compare-worker.js`
- `src/pillars/pool-runner.js`
- `src/kagura-engine.js`
- `test/engine.test.js`
- `test/security.test.js`

## 7. Naming

Hyperion / PCEは歴史的な機能由来名として残ります。公開製品名はAstera v8であり、旧KAGURAを現行名称として使用しません。
