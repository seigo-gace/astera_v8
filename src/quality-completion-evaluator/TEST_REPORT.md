# 検証報告書

## 検証日

2026-07-11

## 実行環境

- Node.js: v22.16.0  
- Module要求: Node.js 20以上  
- 外部npm依存: なし

## 実行結果

| 検証 | 結果 |
| :---- | :---- |
| 全JavaScript構文確認 | 合格 |
| 全JSON Parse | 合格 |
| Shell構文確認 | 合格 |
| Unit Test | 合格 |
| Boundary Test | 合格 |
| Integration Test | 合格 |
| Regression Test | 合格 |
| CLI STDIN評価 | 合格 |
| 95/95境界値 | 合格 |
| 94.99/100不合格 | 合格 |
| Blocking優先 | 合格 |
| 必須章欠落時の95点未達 | 合格 |
| Secret検出Blocking | 合格 |
| 必須Requirement未達Blocking | 合格 |
| 実装済み宣言の証拠不足Blocking | 合格 |
| Content Hash不一致 | 合格 |
| Local Git Commit/Path/Hash実在検証 | 合格 |
| KB HTTP Adapter | 合格 |
| Idempotency重複防止 | 合格 |
| 同一入力の採点再現性 | 合格 |
| 一時ASTERA Rootへの配置 | 合格 |
| 配置後の全再検証 | 合格 |
| npm package dry-run | 合格 |

## Test総数

18 tests

18 passed

0 failed

## Sample結果

{

  "status": "KB_ELIGIBLE",

  "scores": {

    "quality": 100,

    "completion": 100,

    "minimum": 100

  },

  "blocking_count": 0

}

## Docker

DockerfileとCompose例は同梱し、Node Module本体とは分離している。検証環境にDocker Engineが存在しなかったため、Container Build実行のみ未実施。ASTERA本体への正式配置方法であるNode Module配置・Import・CLIはすべて実行検証済み。  

## 現行 `astera_v8` 構造向け再検証 — 2026-07-12

- 配置先を `src/quality-completion-evaluator` へ変更
- README / DEPLOY / 総合設計書の旧 `modules/` 参照を修正
- `scripts-install.sh` の配置先とASTERA Root検証を修正
- 全JavaScript構文確認: 合格
- 全JSON Parse: 合格
- Shell構文確認: 合格
- Test: 18 passed / 0 failed
- Smoke: `KB_ELIGIBLE` / quality 100 / completion 100
- Docker Build: 実行環境にDocker Engineがないため未実施
