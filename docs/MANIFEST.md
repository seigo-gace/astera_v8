# Astera v8 Public Documentation Manifest

Status: 現行実装同期
対象Version: `1.1.1`

## Public Core

```text
docs/BRAND_PHILOSOPHY.md
docs/PRESS_KIT.md
docs/LP_COPY.md
docs/README_PUBLIC.md
docs/FULL_DOCUMENT.md
docs/QUICK_START.md
docs/USER_GUIDE.md
docs/FAQ.md
docs/GLOSSARY.md
docs/LIMITATIONS.md
```

## Technical References

```text
STRUCTURE.md
docs/DOCUMENTATION_INDEX.md
docs/ARCHITECTURE.md
docs/API_REFERENCE.md
docs/LENS_GENRE_INDEX.md
docs/DOMAIN_TEMPLATE_CATALOG.md
docs/SECURITY_NOTES.md
docs/DEPLOYMENT_VPS.md
docs/PRODUCTION_CHECKLIST.md
docs/TROUBLESHOOTING.md
docs/CHANGELOG.md
```

## 現行機能要約

- 38専門ジャンルLens
- 5 Overlay
- 5本柱
- 01〜08の判断材料
- QualityCompletionEvaluator
- 一般Tenant API
- 所有者Skill PRIVATE API
- TGserver Log配送

## 検証

Test件数は固定記載しません。次を実行して現在のRepository状態を検証します。

```bash
npm run verify
```

文書Pathと配布対象は`RELEASE_MANIFEST.txt`で照合します。
