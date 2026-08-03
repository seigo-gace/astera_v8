# Astera v8 Documentation Manifest

Updated: 2026-08-03

## Public core

```text
docs/README_PUBLIC.md
docs/BRAND_PHILOSOPHY.md
docs/PRESS_KIT.md
docs/LP_COPY.md
docs/FULL_DOCUMENT.md
docs/USER_GUIDE.md
docs/FAQ.md
docs/GLOSSARY.md
docs/LIMITATIONS.md
```

## Technical references

```text
README.md
STRUCTURE.md
docs/DOCUMENTATION_INDEX.md
docs/ARCHITECTURE.md
docs/API_REFERENCE.md
docs/LENS_GENRE_INDEX.md
docs/DOMAIN_TEMPLATE_CATALOG.md
docs/HYPERION_PCE_INTEGRATION.md
docs/SECURITY_NOTES.md
docs/DEPLOYMENT_VPS.md
docs/PRODUCTION_CHECKLIST.md
docs/TROUBLESHOOTING.md
```

## Audit and history

```text
docs/DOCUMENTATION_AUDIT_2026-08-03.md
docs/CHANGELOG.md
RELEASE_MANIFEST.txt
archive/
```

## Current public feature summary

- Non-AI rule-based Runtime
- 38 Domain Lens
- 5 Safety / Evidence Overlay
- Fact / Risk / Multi / Inquiry / Compare
- Human Reader
- Dialectic candidate comparison
- 01〜08 Judgment Material
- Optional LLM Adapter
- Independent Quality Completion Evaluator
- TGserver Logging Boundary

## Responsibility summary

### Core

判断材料生成、Domain分類、検査、比較、8段出力。

### External

App UI、Account、認証、Square、Credit、Webhook Gateway、KB保存、財務DB。

### Legacy compatibility

Tenant、Stripe、旧`KAGURA_*`、内部`kagura-*`名称。現行Codeに残るが、Coreの公開機能説明へ混在させない。

## Validation

```bash
npm test
bash scripts/smoke.sh
npm run verify
```

さらに、現行文書（`archive/`を除く）へ次の旧表現が残っていないか確認します。

- AsteraをAI本体とする表現
- AI専用とする表現
- Stripeを現行Commerce正本とする表現
- Skill PRIVATE APIを一般向け主要機能とする表現
- 旧KAGURA製品名をPublic名として使う表現
- 未実装・未検証を完成扱いする表現
