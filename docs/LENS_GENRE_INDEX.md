# Astera v8 — 共通Domain Lens Genre Index

Updated: 2026-09-26  
Document ID: `astera-lens-genre-index`  
Taxonomy Version: `1.0.0`

This document defines the current `G01`–`G38` Domain Lens IDs used by **Judgment Material Generation**.

Canonical implementation:

```text
src/all-domain-lens-catalog.js
src/domain-template-router.js
```

Architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md)  
Lens guide: [`DOMAIN_TEMPLATE_CATALOG.md`](DOMAIN_TEMPLATE_CATALOG.md)

---

## 1. Responsibility boundary

### Judgment Material Generation

Uses the Lens router to determine what domain-specific material should be examined for Task/Claim processing.

### Evidence Search

May consume Lens/domain/overlay metadata as search and Information Quality context. Evidence Search remains the owner of Provider execution and evidence adoption.

### Generic Evaluation v2

Generic v2 is Profile / Measurements / Evidence based and does **not** automatically execute the Legacy evaluator Domain Lens resolver as a generic-v2 invariant.

### Legacy Evaluation v1

Legacy v1 still contains `domain-lens-resolver.js` and corresponding tests. Those remain compatibility behavior and must not be used as proof of Generic v2 Lens enforcement.

---

## 2. Current router behavior

Current router id:

```text
all_domain_lens_router_v2
```

Behavior from `src/domain-template-router.js`:

- Input is normalized deterministically.
- Empty/invalid input returns `ASTERA_LENS_INPUT_REQUIRED` without inventing a domain.
- Primary classification uses controlled-term/text scoring and may abstain when signal is too weak.
- Weak/fallback classification sets `taxonomy_review_required=true`.
- Secondary Lens candidates are limited to at most 3.
- Overlay candidates are limited to at most 5.
- Overlay does not replace the Primary Lens.
- Safety-oriented deterministic fallback exists for specific medical/public-safety/defense/philosophy signals.

Current classification basis values include:

```text
CONTROLLED_TERM_MATCH
TEXT_SCORE_MATCH
HYPOTHESIS_LAST_RESORT
ABSTAIN_LOW_SIGNAL
SAFETY_OVERLAY_CANONICAL_HINT
PUBLIC_SAFETY_CANONICAL_HINT
DEFENSE_CANONICAL_HINT
PHILOSOPHY_ETHICS_HINT
```

Do not create an `other`/`unknown` Lens merely to avoid abstention.

---

## 3. Primary Lens一覧

| ID | 専門ジャンル | Lens Anchor Path |
|---|---|---|
| G01 | 一般知識・百科・情報資源 | `G01/G01-L03/G01-L03-M01/G01-L03-M01-S03` |
| G02 | 哲学・倫理・宗教・思想 | `G02/G02-L03/G02-L03-M02/G02-L03-M02-S06` |
| G03 | 心理・認知・行動科学 | `G03/G03-L02/G03-L02-M01/G03-L02-M01-S03` |
| G04 | 歴史・考古・系譜 | `G04/G04-L04/G04-L04-M03/G04-L04-M03-S05` |
| G05 | 地理・地図・人口・地域 | `G05/G05-L03/G05-L03-M02/G05-L03-M02-S04` |
| G06 | 社会・人権・福祉・家族 | `G06/G06-L02/G06-L02-M01/G06-L02-M01-S01` |
| G07 | 政治・行政・公共政策・国際関係 | `G07/G07-L03/G07-L03-M03/G07-L03-M03-S04` |
| G08 | 法律・司法・規制 | `G08/G08-L04/G08-L04-M02/G08-L04-M02-S02` |
| G09 | 経済・開発・貿易 | `G09/G09-L02/G09-L02-M03/G09-L02-M03-S05` |
| G10 | Business・経営・Marketing・Entrepreneurship | `G10/G10-L02/G10-L02-M03/G10-L02-M03-S03` |
| G11 | 金融・会計・税務・保険 | `G11/G11-L01/G11-L01-M01/G11-L01-M01-S04` |
| G12 | 労働・職業・人材・Skill | `G12/G12-L03/G12-L03-M02/G12-L03-M02-S02` |
| G13 | 教育・学習・資格 | `G13/G13-L04/G13-L04-M01/G13-L04-M01-S04` |
| G14 | 言語・言語学・辞書・翻訳 | `G14/G14-L01/G14-L01-M02/G14-L01-M02-S02` |
| G15 | 文学・出版・図書館・Archive | `G15/G15-L01/G15-L01-M01/G15-L01-M01-S02` |
| G16 | 芸術・文化・音楽・Media | `G16/G16-L02/G16-L02-M01/G16-L02-M01-S02` |
| G17 | Sports・Recreation・観光・Game | `G17/G17-L01/G17-L01-M01/G17-L01-M01-S02` |
| G18 | 数学・統計・Logic | `G18/G18-L04/G18-L04-M01/G18-L04-M01-S02` |
| G19 | 物理・天文・宇宙 | `G19/G19-L03/G19-L03-M03/G19-L03-M03-S03` |
| G20 | 化学・物質・材料 | `G20/G20-L01/G20-L01-M01/G20-L01-M01-S04` |
| G21 | 地球・環境・気候・災害 | `G21/G21-L03/G21-L03-M01/G21-L03-M01-S01` |
| G22 | 生物・生命科学・生態 | `G22/G22-L04/G22-L04-M02/G22-L04-M02-S03` |
| G23 | 医学・健康・薬学・医療 | `G23/G23-L01/G23-L01-M03/G23-L01-M03-S03` |
| G24 | 農業・林業・水産・食品・獣医 | `G24/G24-L04/G24-L04-M02/G24-L04-M02-S03` |
| G25 | 工学・製造・産業技術 | `G25/G25-L04/G25-L04-M02/G25-L04-M02-S05` |
| G26 | 建築・建設・土木・BIM・都市 | `G26/G26-L04/G26-L04-M03/G26-L04-M03-S02` |
| G27 | Energy・資源・Utility | `G27/G27-L01/G27-L01-M02/G27-L01-M02-S01` |
| G28 | 交通・物流・Mobility | `G28/G28-L03/G28-L03-M01/G28-L03-M01-S04` |
| G29 | IT・Computer・System・Application開発 | `G29/G29-L03/G29-L03-M03/G29-L03-M03-S04` |
| G30 | AI・Data Science・Robot | `G30/G30-L03/G30-L03-M01/G30-L03-M01-S01` |
| G31 | Cybersecurity・Privacy・暗号 | `G31/G31-L02/G31-L02-M03/G31-L02-M03-S05` |
| G32 | 標準・特許・知的財産・Compliance・計量 | `G32/G32-L01/G32-L01-M01/G32-L01-M01-S04` |
| G33 | 商品・Commerce・Consumer・製品安全 | `G33/G33-L04/G33-L04-M01/G33-L04-M01-S05` |
| G34 | 公共安全・犯罪・Forensics・Emergency | `G34/G34-L02/G34-L02-M02/G34-L02-M02-S05` |
| G35 | 防衛・軍事・海事・国家安全保障 | `G35/G35-L01/G35-L01-M02/G35-L01-M02-S06` |
| G36 | 通信・Telecom・Internet・Broadcast | `G36/G36-L02/G36-L02-M03/G36-L02-M03-S02` |
| G37 | 科学研究・Innovation・Knowledge Production | `G37/G37-L04/G37-L04-M01/G37-L04-M01-S01` |
| G38 | 家庭・生活・Personal・Hobby | `G38/G38-L04/G38-L04-M01/G38-L04-M01-S05` |

Primary Lens総数: **38**

The detailed terms and per-Lens Fact/Risk/Multi/Inquiry/Compare/Evidence/Safety arrays are owned by `src/all-domain-lens-catalog.js`; this document does not duplicate those arrays.

---

## 4. Overlay Lens

Current router defines:

| ID | Purpose |
|---|---|
| `high_stakes_legal` | 高Riskの法的条件を追加確認 |
| `medical_safety` | 緊急性・受診遅延・危険な自己治療等を追加確認 |
| `current_information` | 現在価格・法改正・最新仕様等の鮮度条件を追加 |
| `evidence_strict` | 一次Source・Source品質・矛盾等を強化確認 |
| `safety_abuse` | Harm/Evasion/Exploitation/Fraud等のSafety観点を追加 |

Exact signals/risk/evidence/safety arrays are defined in `src/domain-template-router.js`.

---

## 5. Current output shape

Representative Judgment Material router result:

```json
{
  "router": "all_domain_lens_router_v2",
  "taxonomy_version": "1.0.0",
  "classification_basis": "CONTROLLED_TERM_MATCH",
  "confidence": 0.9,
  "taxonomy_review_required": false,
  "primary": {
    "id": "G29",
    "name": "IT・Computer・System・Application開発"
  },
  "secondary": [],
  "overlays": []
}
```

Exact output fields remain defined by current router code.

---

## 6. Evidence Search connection

Judgment Material Generation may include the selected Domain Lens in an Evidence Search request.

Evidence Search then decides Provider/query execution and Information Quality under its own responsibility.

```text
Lens routing
→ Evidence Requirement
→ Evidence Search
→ Evidence quality/adoption
```

The Lens does not authorize an Evidence Candidate by itself.

---

## 7. Evaluator-generation boundary

### Generic v2

Current generic contract:

```text
astera.evaluation.request.v2
```

Generic v2 currently loads its v2 evaluation Profile and evaluates Measurements/Evidence. It does not automatically run `domain-lens-resolver.js` as a generic-v2 stage.

### Legacy v1

Historical/compatibility code still accepts Domain Lens-related input and has Lens tests.

Files:

```text
src/quality-completion-evaluator/domain-lens-resolver.js
src/quality-completion-evaluator/tests/integration/domain-lens.test.js
src/quality-completion-evaluator/tests/integration/domain-lens-real-examples.test.js
```

When reading old documents/tests, label this explicitly as **Legacy v1 evaluator behavior**.

---

## 8. Safety and decision boundary

Lens material may strengthen:

```text
Risk
Inquiry
Comparison dimensions
Evidence requirements
Safety gates
```

It must not create:

```text
automatic recommendation
candidate winner
final decision
fabricated evidence
```

---

## 9. Update rules

1. Keep `G01`–`G38` IDs stable unless an explicit taxonomy migration is approved.
2. Update `src/all-domain-lens-catalog.js`, `src/domain-template-router.js`, related tests and this document together when current routing changes.
3. Keep Overlay definitions synchronized with router code.
4. Do not create an `other`/`unknown` Lens to hide weak classification; the router may abstain.
5. Do not claim Generic v2 Lens enforcement from Legacy v1 tests.
6. Do not duplicate the full per-Lens implementation arrays in README.
