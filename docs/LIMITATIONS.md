# Astera v8 — Product Boundaries and Limitations

Updated: 2026-09-26

This document describes **product-level limitations and responsibility boundaries of the completed Astera v8 design**.

Implementation defects, migration debt, unfinished wiring and audit findings are not maintained here. They are tracked in the project audit record outside the public product documentation.

Canonical architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md)

---

## 1. Final decision limitation

Astera v8 produces judgment material, evidence state and deterministic evaluation results. It does not guarantee that the final Human / Main AI / Calling System decision is correct.

```text
Main8 material ≠ final decision
Accepted Evidence ≠ final business decision
Evaluator PASSED ≠ deployment / merge / publication authorization
```

Final decision authority remains external.

---

## 2. External evidence limitation

Evidence Search cannot guarantee that required external information always exists, is reachable, is current, or is published by an authoritative source.

Possible truthful outcomes include:

- supporting evidence
- counter evidence
- conflicting evidence
- insufficient evidence
- no evidence found
- retrieval/provider failure

Astera must preserve unresolved state instead of fabricating missing evidence.

A Provider returning data does not by itself make that data accepted Evidence.

---

## 3. Source authority limitation

Authority depends on the Claim, domain, jurisdiction, time scope and requested evidence conditions.

A source that is authoritative for one Claim may be unsuitable for another.

Astera therefore cannot replace domain-specific legal, medical, tax, investment, safety or other licensed professional judgment merely by retrieving a source.

---

## 4. Freshness limitation

Current-information Claims depend on external source freshness and Provider reachability.

The General / Current route reduces stale-information risk but cannot guarantee that every real-world change is immediately observable.

Claims whose freshness requirements are not satisfied must remain unresolved or rejected by the Evidence adoption gate.

---

## 5. Language / parser limitation

Japanese semantic analysis is an external parsing boundary.

Parser failure, timeout, protocol failure or unsupported input must remain distinguishable from:

```text
user premise deficiency
Evidence insufficiency
Task dependency failure
Generic evaluation failure
```

Astera must not ask the user to restate already supplied information merely because an external Parser failed.

---

## 6. Optional LLM limitation

Optional LLM adapters are external generation boundaries, not Astera truth authorities.

External LLM output cannot override:

- Evidence validity
- Claim confirmation
- Requirement / Constraint
- Hard Blocking
- Final Decision Authority

LLM provider availability, price, latency and output quality remain external dependencies.

---

## 7. Task execution limitation

Bounded parallel execution improves throughput while preserving dependency order, but does not make every workload infinitely parallelizable.

Execution is intentionally constrained by:

- Task dependency graph
- Wave order
- concurrency limits
- queue capacity
- cancellation
- per-boundary deadlines

When capacity is exceeded, explicit rejection is preferable to uncontrolled resource growth.

---

## 8. Evidence Search limitation

Evidence Search owns retrieval and adoption, but does not:

- generate Main8
- own Generic Evaluation metrics
- fabricate missing evidence
- execute payment / credit / refund
- use AI query generation or AI reranking in the deterministic free-search contract

Search success and Evidence adoption are separate states.

---

## 9. Evaluation / Verification limitation

Generic Evaluation v2 evaluates only the supplied Subject under the selected Profile, Measurements and verified Evidence.

It does not:

- modify the Subject
- fix code automatically
- commit or push
- deploy
- publish
- charge a customer
- decide a final business action

`PASSED` means the evaluation contract passed, not that every downstream release condition passed.

---

## 10. Legacy compatibility limitation

Legacy v1 evaluator compatibility and Generic v2 are different contracts.

Legacy behavior, profiles or tests must not be treated as proof that the same feature exists in Generic v2.

The historical directory name `quality-completion-evaluator` does not redefine the current v2 responsibility.

---

## 11. Network / deployment limitation

The production design keeps Core, Evaluator and Evidence Search on private/internal service boundaries.

Public exposure, TLS termination, reverse proxy policy, firewall policy, monitoring, backup and secret injection remain deployment responsibilities.

A successful local health request proves service health only; it does not replace explicit ingress/firewall verification.

---

## 12. Logging limitation

TGserver / structured logging is an operational evidence boundary, not a truth authority.

Successful log delivery does not prove:

- Evidence validity
- evaluation success
- deployment success
- final decision correctness

Logging failure also must not silently mutate a valid Claim or Judgment.

---

## 13. Verification limitation

Source presence, Test presence, Container status and HTTP success are not interchangeable with completion proof.

```text
SOURCE_EXISTS ≠ PASS
TEST_FILE_EXISTS ≠ PASS
CONTAINER_RUNNING ≠ READY
HTTP_200 ≠ EVIDENCE_VALID
OLD_SHA_PASS ≠ CURRENT_SHA_PASS
NOT_RUN ≠ PASS
```

Completion evidence must refer to the exact candidate SHA and the required real boundaries for that release.

---

## 14. Documentation rule

Product documentation describes the completed Product Contract and stable responsibility boundaries.

Development audit findings, unfinished wiring, migration debt and implementation inconsistencies are tracked separately from this public limitation document.

When the Product Contract itself changes, update together as applicable:

- `ARCHITECTURE.md`
- affected module document
- `API_REFERENCE.md`
- README / STRUCTURE summary
- tests / contracts / manifests
