# Astera v8 — Security Notes

Updated: 2026-09-26

Canonical architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md)

---

## 1. Security model

Astera v8 has three runtime trust domains:

```text
Judgment Material Generation  127.0.0.1:7373
Evaluation / Verification     127.0.0.1:7374
Evidence Search               127.0.0.1:7376
```

Security design preserves both **service isolation** and **data authority isolation**.

A caller being authenticated does not mean caller-supplied internal truth state is trusted.

---

## 2. Public/process trust boundary

`POST /process` uses an external body allowlist.

The public route must not trust caller-supplied:

- prepared Task graph
- Canonical Claim Records
- pre-forged `CONFIRMED` state
- arbitrary internal Evidence packet
- internal execution objects

Internal state is derived by Astera's own deterministic pipeline.

---

## 3. Evidence Search trust boundary

`POST /internal/v1/evidence/search` is an internal signed-service endpoint.

The internal-auth contract validates:

- service identity
- request body hash
- signature integrity
- expiry / TTL
- nonce / replay protection

Evidence Search must still validate Provider results after caller authentication. A valid internal caller cannot turn an invalid Provider result into accepted Evidence.

A retrieved Candidate is not automatically adopted Evidence.

---

## 4. Evaluator trust boundary

Generic `POST /v2/evaluate` uses API-key authentication on the normal route and Skill API authentication on the skill route.

Authentication does not bypass:

- Request schema validation
- Measurement hash / provenance verification
- Evidence Registry integrity
- Evidence Binding integrity
- Required Evidence checks
- Hard Blocking

The evaluator must not fabricate evidence or alter the evaluated Subject.

---

## 5. Secrets

Runtime configuration may include:

- `ASTERA_API_KEY`
- `ASTERA_SKILL_API_KEY`
- internal service secret / secret file
- Evidence durable-spool encryption key
- Japanese Parser API credential
- Optional external LLM keys
- TGserver connectivity/auth material
- Cloudflare / ingress credentials where used

Rules:

- never commit `.env`
- never commit runtime secret files
- never print secret values into README/issues/chat/log examples
- mount secret files read-only where supported
- keep Browser/client code free of server-side secrets
- rotate compromised credentials outside source control

---

## 6. Transport protections

Service-specific protections include or may include:

- strict JSON parsing
- payload-size limits
- API-key authentication
- signed internal-service authentication
- replay/nonce checks for internal requests
- CORS controls
- HTTPS/HSTS enforcement at the approved boundary
- request/header/keep-alive timeouts
- provider/client deadlines
- response/log secret masking
- transport rate limiting
- container no-new-privileges / capability reduction
- Evidence recovery artifact encryption/integrity controls

Exact protection is service-specific; do not infer one service's middleware automatically applies to all three.

---

## 7. Data minimization

Send only data required for the judgment/evaluation/search task.

- remove unrelated names, addresses, phone numbers and credentials
- do not send card/payment secrets
- minimize uploaded/document context to required sections
- replace sensitive identifiers where full identity is unnecessary
- do not log raw request bodies by default
- preserve only operational state required for recovery/audit

Evidence Search recovery data is operational evidence-job state, not a general user-data store.

---

## 8. Runtime network boundary

Production design keeps all three Astera services private/internal:

```text
Core            127.0.0.1:7373
Evaluator       127.0.0.1:7374
Evidence Search 127.0.0.1:7376
```

Rules:

- keep Evidence Search internal route private
- keep Evaluator internal unless a separately authenticated ingress is intentionally designed
- do not expose internal ports directly to the Internet
- terminate HTTPS at the approved reverse proxy/Cloudflare layer when public ingress is required
- verify trusted proxy configuration before relying on forwarded headers
- verify actual listen/firewall/ingress state as part of release proof

A local health request is not a substitute for network exposure verification.

---

## 9. Optional LLM boundary

Optional LLM adapters are external dependency boundaries.

- External LLM output must not override Evidence validity.
- External LLM output must not manufacture `CONFIRMED` Claim state.
- Arbitrary request-level LLM endpoint selection is not part of the public process contract.
- Provider keys remain secret runtime configuration.

---

## 10. Logging boundary

TGserver is an external logging sink, not Evidence authority.

Before delivery:

- secret masking/removal must remain active
- raw confidential content should not be logged unnecessarily
- failed delivery outbox must not become long-term Knowledge storage
- successful log delivery must not be interpreted as successful evaluation/search

---

## 11. Information Quality security boundary

Information Quality is an internal deterministic contract used for Evidence candidate adoption.

Security invariants:

- it is not a public browser endpoint
- it must not bypass Candidate provenance / source-role / freshness / conflict checks
- it must not recursively invoke Generic v2 through Evidence Search
- transport choice must preserve the same trust and integrity boundary
- Generic v2 API authentication does not automatically authorize Evidence Search internal operations

---

## 12. Task execution safety

Task execution control is also a security/reliability boundary.

- concurrency is bounded
- queue capacity is bounded
- overload is rejected explicitly
- cancelled requests do not continue unnecessary work
- dependency failure prevents dependent Task execution
- caller-supplied forged internal Task graphs are not trusted through the public process route

---

## 13. Incident evidence

For a security/runtime incident, preserve at minimum:

- exact Commit SHA
- service name / port
- timestamp
- request ID / evaluation ID / search request ID where applicable
- endpoint
- HTTP status / structured error code
- secret-redacted logs
- minimal reproduction input
- container health/state
- relevant workflow/test result
- whether Evidence/Measurement hashes were involved
- actual bind/listen state and firewall/ingress state when network exposure is relevant

Do not paste secret files or full credentials into the incident report.
