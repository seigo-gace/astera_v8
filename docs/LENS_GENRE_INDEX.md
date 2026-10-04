# Astera v8 — 共通Domain Lens Genre Index

Updated: 2026-10-04  
Document ID: `astera-lens-genre-index`  
Taxonomy Version: `1.0.0`

This document defines the current `G01`–`G38` Domain Lens IDs used by **Judgment Material Generation**.

Canonical implementation:

```text
src/all-domain-lens-catalog.js
src/domain-template-router.js
src/domain-identity-aliases.js
src/lens-plan.js
```

Architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md)  
Universal target design: [`UNIVERSAL_JUDGMENT_MATERIAL_ARCHITECTURE.md`](UNIVERSAL_JUDGMENT_MATERIAL_ARCHITECTURE.md)  
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

## 2. Critical product boundary: G01-G38 is not the product scope

The 38 Lens taxonomy is a **domain-material routing aid**. It must not become a whitelist of supported questions, document types, professions or judgment scenarios.

Astera must accept arbitrary judgment-seeking input regardless of whether it is:

- a clean report or noisy free-form message;
- a design document, business document, legal text, scientific paper, plan, memo, audit record, personal question or another form;
- Japanese or English;
- short or long;
- single-purpose or multi-purpose;
- Human-authored or AI-authored.

Correct semantic order:

```text
Source Graph / Semantic Atoms / Case Graph
  ↓
Request / Claim
  ↓
G01-G38 Lens routing
  ↓
Domain-specific required judgment material
  ↓
Evidence requirement / Risk / Inquiry / Comparison dimensions
  ↓
Main8 material sufficiency
```

A correct Lens classification is **not** proof that the final Main8 is useful or complete.

The final quality question is:

> Does the output contain the material actually required to judge this specific question?

This is tested separately from Lens classification accuracy.

---

## 3. Current router behavior

Current router id:

```text
all_domain_lens_router_v2
```

Behavior from `src/domain-template-router.js` and `src/domain-identity-aliases.js`:

- Input is normalized deterministically.
- Empty/invalid input returns `ASTERA_LENS_INPUT_REQUIRED` without inventing a domain.
- Primary classification uses controlled-term/text scoring and may abstain when signal is too weak.
- A valid explicit canonical ID `G01`–`G38` is itself a controlled identity signal. Forms such as `G10`, `【G10】` and `[G10]` enter the same controlled-term routing path; they do not create a bypass router.
- Invalid lookalikes such as `G00`, `G39` and `G99` are not promoted to canonical Lens IDs.
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

An explicit valid `Gxx` identity normally resolves through `CONTROLLED_TERM_MATCH`.

Do not create an `other`/`unknown` Lens merely to avoid abstention.

---

## 4. Primary Lens一覧

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

## 5. Domain-material sufficiency responsibility

The target redesign requires each selected Lens to contribute **material requirements**, not just a label.

Representative categories include:

- domain-specific fact dimensions;
- relevant counter/falsification conditions;
- risk dimensions;
- comparison dimensions;
- authority/source classes;
- freshness / effective-date requirements;
- jurisdiction / population / environment / version scope;
- specialist evidence expectations;
- safety-critical uncertainty.

These are composable with the universal operation-material ontology.

Example:

```text
Request operation = compare
Lens = G11 finance
```

may require generic comparison slots plus finance-specific period/accounting-basis/denominator/risk-assumption material.

This is not an instruction to hard-code prose templates per Genre. The material contract is structured and source/evidence backed.

### Additive specialist breadth

`src/lens-plan.js` may supplement a selected Primary Lens with `PRIMARY_BREADTH` material when the representative canonical profile does not by itself cover the specialist pre-decision dimensions needed for the wider Genre.

This supplement is additive only. It may contribute Fact, Risk, Multi, Inquiry, Compare, Evidence or Safety material, but it:

- does not replace the canonical Primary Lens;
- does not change the `G01`–`G38` IDs or taxonomy version;
- does not create a 39th Genre;
- does not select or rank candidates;
- does not create a final decision or automatic recommendation.

The current Universal Judgment gate separately verifies that the resulting public Main8 contains enough domain material; Lens classification alone is insufficient proof.

---

## 6. Cross-domain input

One input may legitimately contain Requests/Claims from several Genres.

Target behavior:

- attach Lens context to the relevant Request/Claim;
- preserve one Primary Lens where the router contract requires it, plus secondary/overlay context;
- do not collapse cross-domain content into a generic primary-purpose string;
- do not invent a 39th `other` Lens simply because the case spans multiple domains.

Material sufficiency is evaluated by the union of relevant Request/Claim Lens requirements, not by a single global label alone.

---

## 7. Overlay Lens

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

## 8. Current output shape

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

## 9. Evidence Search connection

Judgment Material Generation may include the selected Domain Lens in an Evidence Search request.

Evidence Search then decides Provider/query execution and Information Quality under its own responsibility.

```text
Lens routing
→ domain-specific material requirement
→ Evidence Requirement
→ Evidence Search
→ Evidence quality/adoption
```

The Lens does not authorize an Evidence Candidate by itself.

---

## 10. Evaluator-generation boundary

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

## 11. Safety, public-output and decision boundary

Lens material may strengthen:

```text
Fact requirements
Risk
Inquiry
Comparison dimensions
Evidence requirements
Safety gates
```

Public Main8 projection is request-sensitive. Specialist Risk or Compare material may exist in the internal LensPlan without automatically appearing in every generic task. It is projected to public Main8 when the Task/request actually calls for those materials, such as explicit risk/failure-condition requirements, comparison-axis requirements or a real comparison task.

It must not create:

```text
automatic recommendation
candidate winner
candidate ranking
final decision
fabricated evidence
```

---

## 12. Verification requirement

The redesign requires separate verification for:

1. Lens routing quality;
2. domain-material requirement coverage;
3. final Main8 material sufficiency.

A test that only checks `primary.id === Gxx` cannot prove judgment-material quality.

Current regression includes explicit canonical-ID routing for `G01`–`G38` in Japanese and English, additive breadth coverage for weak representative Genre profiles, and Universal Judgment semantic/material verification across the full 38-Genre pair set.

GitHub-self-executable regression must continue to include Japanese and English, multiple lengths/styles and G01-G38 coverage with semantic/material-slot gold annotations rather than exact answer-template matching.

---

## 13. Update rules

1. Keep `G01`–`G38` IDs stable unless an explicit taxonomy migration is approved.
2. Update `src/all-domain-lens-catalog.js`, `src/domain-template-router.js`, `src/domain-identity-aliases.js`, `src/lens-plan.js`, related tests and this document together as applicable when current routing/material coverage changes.
3. Keep Overlay definitions synchronized with router code.
4. Do not create an `other`/`unknown` Lens to hide weak classification; the router may abstain.
5. Do not claim Generic v2 Lens enforcement from Legacy v1 tests.
6. Do not duplicate the full per-Lens implementation arrays in README.
7. Do not treat G01-G38 as a supported-document whitelist or Request parser.
8. Do not treat correct Genre classification as proof of Main8 completion.
9. Do not treat internal specialist Risk/Compare material as permission to expose it in public Main8 when the Task did not request it.
