# Astera v8 Documentation Index

Status: 現行実装同期
対象Version: `1.1.1`

## 初めて使う人

1. `README.md`: Asteraの役割と入口
2. `docs/QUICK_START.md`: 5分で起動・入力・出力確認
3. `docs/USER_GUIDE.md`: 8段を主役AIへ渡す実用手順
4. `docs/GLOSSARY.md`: 用語
5. `docs/FAQ.md`: よくある疑問

## 開発者

- `STRUCTURE.md`: 構成・責務・依存方向の正本
- `docs/ARCHITECTURE.md`: Runtime内部構造
- `docs/API_REFERENCE.md`: HTTP契約
- `docs/LENS_GENRE_INDEX.md`: 38 Lensと5 Overlay
- `docs/DOMAIN_TEMPLATE_CATALOG.md`: Lens実装参照先
- `src/quality-completion-evaluator/README.md`: 品質・完成度判定
- `src/quality-completion-evaluator/contracts/`: Evaluator Schema

## 運用者

- `docs/DEPLOYMENT_VPS.md`: Docker Compose導入
- `docs/PRODUCTION_CHECKLIST.md`: 本番Gate
- `docs/SECURITY_NOTES.md`: Security
- `docs/TROUBLESHOOTING.md`: 障害切り分け
- `docs/LIMITATIONS.md`: 保証外・未実装・運用制約

## 広報・公開説明

- `docs/BRAND_PHILOSOPHY.md`
- `docs/PRESS_KIT.md`
- `docs/LP_COPY.md`
- `docs/README_PUBLIC.md`
- `docs/MANIFEST.md`

## 全体・履歴

- `docs/FULL_DOCUMENT.md`: 現行仕様の全体説明
- `docs/CHANGELOG.md`: Astera全体の変更履歴
- `RELEASE_MANIFEST.txt`: 配布対象Path

## 正本の優先順位

1. `STRUCTURE.md`
2. 実装・Schema・Test
3. `docs/API_REFERENCE.md`
4. `docs/LENS_GENRE_INDEX.md`
5. 説明文書・広報文書

説明と実装が衝突した場合は、説明文だけで仕様を確定せず、正本とTestを修正対象として扱います。
