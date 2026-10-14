# Astera v8 × Generic AI Core — Consumer Boundary & Migration Design (2026-10-14)

Status: **PROPOSED_DESIGN / NOT IMPLEMENTED**. This is an Astera-owned integration design, not a change to AI Core's resource authority, Astera's deterministic product purpose, or the existing runtime. Review against current Source/Host before adoption.

## 1. Product purpose and immutable boundaries
Astera v8 is a **non-AI deterministic judgment-material runtime**: preserve the input's source-backed Requests, constraints, evidence needs, accepted/provisional evidence and uncertainty through the five lanes into decision-ready Main8 for an external Human/Main AI. It does not become a generative AI orchestration product merely because a reusable AI inference service becomes available.

AI Core owns generic model registration/capabilities, authenticated inference entrypoints, shared lifecycle, RAM/CPU admission, resource lease/queue/deadline/cancellation, mechanical handoff and isolation. Astera owns Request/Task/Lens/Claim topology, evidence semantics, deterministic parsing, evidence adoption, final Main8 quality and product-specific task-level timeout policy. **No AI output may become accepted evidence, Claim CONFIRMED, or a final decision by crossing the new interface.**

## 2. Current evidence and integration decision
- Astera Draft PR #40 (branch `test/runtime-flow-clean-1k-5k-10k-20261014`) is an active separate Source/semantic-quality CU. Do not edit that branch from this design CU. Main8 38 Lens × three-English-Task regression and live specialist/general FINAL_VALID evidence remain independent completion gates.
- AI Core design `docs/DYNAMIC_RESIDENCY_HANDOFF_DESIGN.md` §14 is adopted on main; implementation Draft PR #3 is **not deployed/qualified**. Its initial four model gates (18181–18184), dynamic resident count 0–2, temporary 3 during handoff, central Coordinator and preserved 18080 compatibility describe the current Host migration candidate, **not a universal requirement for Astera**.
- Existing Astera v8 production composition (Core 7373, Evaluator 7374, Evidence Search 7376) is deterministic and does not require adding an AI Core dependency to process its normal requests. The older `seigo-gace/asteria` translation/meaning-integrity product is a distinct consumer; do not import its Qwen3/Granite translation pipeline into Astera v8.
- server-core Issue #10 says Astera v8 current-main Host reflection/deploy is NOT_QUALIFIED. Design-source publication is not Host deployment permission.

**Decision:** Add an optional, isolated consumer adapter contract to Astera's design, but do not insert AI inference into deterministic Source/Claim/Evidence/Main8 decision authority. AI Core remains an external shared infrastructure dependency used only by explicitly approved future AI-assisted operations or an independent caller; no default model invocation, no fourth core module.

## 3. Contract for a future optional AI consumer
1. **Explicit opt-in/operation allowlist:** deterministic `/process`, evidence search and generic evaluation must remain AI-independent. A future product-specific caller/adapter must specify its declared operation, model capability (not hard-coded `qwen3`/`granite`), caller identity, request correlation and bounded work budget. Default is disabled.
2. **Request isolation:** carry an opaque `request_id`, `task_id`, origin/caller, deadline and cancellation signal. Preserve original source spans within Astera; do not send unrelated Requests or secrets in shared prompts/caches. An AI Core lease is a compute ownership proof, not an Astera Evidence provenance proof.
3. **Single resource authority:** use authenticated AI Core's model gate and its Coordinator-owned admission/lease. No direct llama.cpp backend fallback that bypasses lease or separate Astera Docker start/stop/idle TTL. No new token, model weight, port, workflow or container under this CU. Existing legacy 18080 remains until AI Core's own exclusive-cutover evidence is verified.
4. **Timeout/deadline:** calculate one upstream deadline and remaining work budget; never stack multiple full timeouts per retry/stage beyond the caller's envelope. Distinguish `QUEUE_TIMEOUT`, `MODEL_UNAVAILABLE`, `RESOURCE_REJECTED`, `REQUEST_CANCELLED`, `STREAM_INCOMPLETE`, `INFERENCE_TIMEOUT` and `INFERENCE_ERROR` as machine states. An error does not become `NO_EVIDENCE` or a negative Claim.
5. **Streaming and capabilities:** negotiate advertised model/capability/stream/JSON/tool requirements; unsupported capability must fail explicitly. Recognize SSE terminal success vs interrupted stream. Model prompt, role sequence, tool use, generated content and quality acceptance remain in the product caller, not in AI Core.
6. **Bounded retry and cleanup:** retry only when idempotent and the remaining deadline permits; cancellation releases leases and closes streams, with no stop/evict action owned by Astera. An optional model handoff uses the existing generic AI Core ticket contract only after its separate source and runtime qualification.
7. **Deterministic truth firewall:** treat generated text as untrusted candidate data. Evidence Search is still the sole adopter of external retrieved evidence; Generic Evaluation v2 still applies its own evidence/measurement contracts. Keep Claim/Requirement bindings and UNKNOWN intact; refuse fabricated supporting citations.

## 4. Verification and adoption gates (none implicitly passed)
A. Static interface audit: identify all present Astera code paths for AI/model inference and prove whether v8 has any direct dependency; contrast with separate `asteria` translation owner. Mark missing evidence UNKNOWN.
B. Contract tests with a fake AI Core gate: auth rejected, unsupported model/capability, lease limit, concurrent independent callers, cold model, queue expiration, client cancellation, incomplete SSE, retry idempotency, stale response and cross-request leakage. **No real models or costs**.
C. Deterministic non-regression: 38 Lens×3-Task, 1k/5k/10k, Main8 fact/risk/opposition/comparison, accepted evidence-to-original Claim/Requirement, missing-evidence honesty. Optional adapter disabled must cause no differences.
D. Independent AI Core runtime qualification: exact-SHA source tests, authenticated four gate route, Coordinator single lease, legacy traffic exclusivity, dynamic 2→3→2 and recovery/rollback measured. This is owned by AI Core, not an Astera gate to fake as PASS.
E. Cross-product integration only if an Astera AI-assisted consumer is actually accepted: same shared inference API serves DebugAI plus the second distinct product, preserving caller isolation and bounded CPU/RAM; measure product output quality, latency p50/p95, cancellation, CPU/RAM/PSI under parallel load. No production effect before authorized Host admission.
F. Preserve independent Astera v8 existing public-contract verification and current Host deploy authorization from server-core #10. Green CI / source design merge never proves external LIVE Evidence FINAL_VALID or product completion.

## 5. Explicit exclusions and review status
This design makes **no change** to existing deterministic Core endpoints, to Source PR #40, to AI Core PR #3, or to either product's deployed Docker services. It does not propose replacing Evidence Search with an LLM, adding model-dependent Lens classification, promoting generative results to evidence, or conflating `asteria` translation with `astera_v8` judgment material generation.

Adoption before implementation requires (i) actual current Astera v8 call-site audit, (ii) a confirmed need for an AI-assisted Astera feature, (iii) AI Core interface/runtime readiness and (iv) exact per-repo Host authorization. Until then the contract is a compatibility design, not a commissioned feature.

## 6. Evidence references
- Astera architecture: `docs/ARCHITECTURE.md`, `docs/UNIVERSAL_JUDGMENT_MATERIAL_ARCHITECTURE.md`; Source [PR #40](https://github.com/seigo-gace/astera_v8/pull/40).
- AI Core adopted design: [DYNAMIC_RESIDENCY_HANDOFF_DESIGN](https://github.com/seigo-gace/ai-core/blob/main/docs/DYNAMIC_RESIDENCY_HANDOFF_DESIGN.md); implementation [PR #3](https://github.com/seigo-gace/ai-core/pull/3), owner [Issue #1](https://github.com/seigo-gace/ai-core/issues/1).
- Shared terminal/admission Current: [server-core Issue #10](https://github.com/G-ACE-inc/server-core/issues/10).
