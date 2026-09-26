# Astera v8 — Security Notes

Updated: 2026-09-26

Canonical architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md)

---

## 1. Security model

Astera v8 has three runtime trust domains:

```text
Judgment Material Generation  :7373
Evaluation / Verification     :7374
Evidence Search               :7376
```

Security design must preserve both **service isolation** and **data authority isolation**.

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

Current boundary tests verify that forged internal state is ignored/reconstructed rather than accepted as truth.

---

## 3. Evidence Search trust boundary

`POST /internal/v1/evidence/search` is an internal signed-service endpoint.

Current implementation verifies:

- service identity
- request body hash
- HMAC/signature contract
- expiry/TTL
- nonce/replay state

Evidence Search must still validate Provider results after request authentication. A valid internal caller cannot turn an invalid Provider result into accepted Evidence.

Non-`FINAL_VALID` module output must not expose candidates as adopted Evidence.

---

## 4. Evaluator trust boundary

Generic `POST /v2/evaluate` uses API-key authentication on the normal route and Skill API authentication on the skill route.

Authentication does not bypass:

- Request schema validation
- Measurement hash verification
- Evidence Registry integrity
- Evidence Binding integrity
- Required Evidence checks
- Hard Blocking

The evaluator must not fabricate evidence or alter the evaluated Subject.

---

## 5. Secrets

Current runtime configuration may include:

- `ASTERA_API_KEY`
- `ASTERA_SKILL_API_KEY`
- internal service secret / secret file
- Evidence durable-spool encryption key
- Japanese Parser API credential where configured
- Optional external LLM keys
- TGserver connectivity/auth material
- Cloudflare tunnel token file when the optional profile is used

Rules:

- never commit `.env`
- never commit runtime secret files
- never print secret values into README/issues/chat/log examples
- mount secret files read-only where supported
- keep Browser/client code free of server-side secrets

---

## 6. Implemented transport protections

Depending on the service, current code includes:

- strict JSON parsing
- payload-size limits
- API-key authentication
- signed internal-service authentication
- replay/nonce checks for internal requests
- CORS controls
- optional HTTPS/HSTS enforcement
- request/header/keep-alive timeouts
- provider/client deadlines
- response/log secret masking
- transport rate limiting
- read-only/cap-drop/no-new-privileges settings for evaluator Compose service
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

Code defaults and current root Compose values differ.

```text
Core code default / Compose      127.0.0.1:7373 or configured ASTERA_PORT
Evidence Search default/Compose  127.0.0.1:7376
Evaluator code default           127.0.0.1:7374
Evaluator current root Compose   0.0.0.0:7374 + network_mode: host
```

Therefore the current Evaluator Compose service must be treated as **potentially reachable on host interfaces**. A local health check to `127.0.0.1:7374` does not prove loopback-only exposure.

Rules:

- keep Evidence Search internal route private
- verify host firewall/external reachability for Evaluator 7374 explicitly
- do not intentionally expose internal ports directly to the Internet without a separately designed authenticated ingress
- terminate HTTPS at the approved reverse proxy/Cloudflare layer when public ingress is required
- verify trusted proxy configuration before relying on forwarded-proto headers
- do not use documentation assumptions as a substitute for `ss`/firewall/ingress verification

Known network-boundary inconsistency: [`LIMITATIONS.md`](LIMITATIONS.md)

---

## 9. Optional LLM boundary

Optional LLM adapters are external dependency boundaries.

- External LLM output must not override Evidence validity.
- External LLM output must not manufacture `CONFIRMED` Claim state.
- Request-level arbitrary LLM base URL selection remains disabled unless explicitly enabled for authenticated internal use.
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

## 11. Information Quality wiring warning

The active Evidence Search production start currently uses in-process `evaluateInformationQuality()`.

A legacy/stale HTTP client exists for `/internal/v1/information-quality/evaluate`, but the current evaluator server does not expose that route.

Security review must evaluate the **actual active call path**, not assume the inactive client/architecture description is runtime truth.

See [`LIMITATIONS.md`](LIMITATIONS.md).

---

## 12. Incident evidence

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
