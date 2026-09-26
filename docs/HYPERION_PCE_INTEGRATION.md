# Astera v8 — Human Reader and Dialectic Integration

Updated: 2026-09-26

This document explains two **Judgment Material Generation support capabilities**:

- `src/hyperion-human-reader.js`
- `src/pillars/dialectic-worker.js`

They are not independent core modules and they do not own final decision authority.

Canonical module detail: [`modules/JUDGMENT_MATERIAL_GENERATION.md`](modules/JUDGMENT_MATERIAL_GENERATION.md)

---

## 1. Human Reader

Human Reader is non-AI rule logic that derives presentation/attention signals from the current request context.

Its purpose is to make potentially important human-facing conditions visible without changing truth state.

Examples of signal categories handled by the implementation/history include urgency, anger/confusion/fatigue-like input signals, precision demand and scope pressure.

### Allowed effect

- presentation emphasis
- attention priority
- risk material contribution
- carry-forward guidance

### Forbidden effect

Human Reader must not mutate:

```text
Claim truth
Evidence validity
Requirement
Constraint
Source authority
Candidate winner
Final decision
```

Human Reader is not psychological or medical diagnosis.

---

## 2. Dialectic / perspective expansion

Dialectic support exists to prevent a single narrative from becoming the only view before comparison.

It may produce perspective/candidate material such as:

```text
mainline
bad_hand
opposition
third_way
human_fit
```

These labels are **analysis material**, not automatically ranked alternatives.

`bad_hand` is primarily failure/risk material; its existence does not mean it is an adoption candidate.

---

## 3. Current flow

```text
Canonical Task / Claim Records
      │
      ├─ Fact
      ├─ Risk
      ├─ Inquiry
      └─ Multi / perspective material
             │
             ├─ Human Reader presentation signals
             └─ Dialectic / expanded perspectives
                       │
                       ▼
                    Compare
                       │
             comparison material only
                       │
                       ▼
                     Main8
```

**Compare does not rank or choose a winner.**

Current Main8 comparison contract explicitly keeps:

```text
selected_candidate = null
candidate_ranking  = []
rejected_candidates = []
```

---

## 4. Independence rule

One perspective or Lane output must not silently become another Lane's truth input.

```text
Mainline narrative ≠ Fact truth
Risk narrative ≠ Compare winner
Human-fit perspective ≠ Recommendation
Opposition perspective ≠ automatic rejection of mainline
```

All final material must remain traceable to canonical Task / Claim / Evidence state.

---

## 5. Current files

Primary:

```text
src/hyperion-human-reader.js
src/pillars/dialectic-worker.js
src/pillars/multi-worker.js
src/pillars/inquiry-worker.js
src/pillars/compare-worker.js
src/v4-canonical/lanes.js
src/canonical-astera-engine-base.js
```

Relevant tests include:

```text
test/human-reader-effect-boundary.test.js
test/material-only-public-projection.test.js
test/decision-authority-boundary.test.js
```

---

## 6. What this is not

- Multi-agent competition
- Multiple LLM voting
- AI-based emotional diagnosis
- Candidate ranking engine
- Recommendation engine
- Final decision engine
- Separate Astera core module

---

## 7. Main8 relation

Human Reader / Dialectic support may contribute to material that appears in:

```text
04 危機察知
05 反対視点
06 比較案
08 主役AI／利用者への再指示
```

They must not convert:

```text
07 根拠成立状態
```

into a recommendation or override Evidence/Claim state.
