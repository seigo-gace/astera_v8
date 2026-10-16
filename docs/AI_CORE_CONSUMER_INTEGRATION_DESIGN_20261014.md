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


## 7. Server-constrained resource efficiency — design extension (2026-10-14)

**Requirement from Master:** Preserve or improve all Astera capabilities and semantic accuracy while maximizing effective RAM and CPU efficiency on the *actual shared Host*. "Minimal" means no duplicate buffering, repeated computation, unnecessary model loads or redundant ownership — not removal of Lens, Tasks, evidence routes, traces, Main8 slots or correctness checks. All numerical savings are **hypotheses pending measurements**, never verified performance claims.

### 7.1 Resource inventory, not imaginary free RAM
The adopted AI Core Host policy currently states a shared AI cgroup ceiling of **MemoryHigh 34 GiB / MemoryMax 36 GiB / CPU 6 cores**, with ordinarily **0–2 resident models** and a temporary maximum of 3 during controlled handoff. These are AI Core policy/evidence context, **not guaranteed available memory or CPUs for Astera**. The Host also runs core services, other projects, Docker and page cache. Do not assign Astera all "unused" AI cgroup RAM or multiply per-service caps to infer actual headroom.

Before setting Astera resource caps collect at the same time: actual Host memory available, cgroup ancestor/child `memory.current`, `memory.peak`, `memory.high/max`, swap, OOM events and `memory.stat`; CPU `cpu.max`, `cpu.stat` throttling, PSI some/full; per-service RSS/heap/external/ArrayBuffer, worker count and request concurrency; AI Core model resident/lease/loading state; actual p50/p95/p99 and peak across concurrent ASTERA/DebugAI workloads. Distinguish cumulative counters from **measured deltas** and avoid confusing process RSS with unique host memory. No current Astera v8 peak memory measurement was obtained in this design CU; thresholds and target percentages remain UNKNOWN.

### 7.2 Actual Astera hot-path map and proposed ownership
`Input → lossless Source Graph → Language Adapter / Parser → Request & Atom Graph → Task DAG / Lens / Requirement → Search Plan → Evidence Search (specialist/general) → source-bound adopted Evidence & UNKNOWN → Five Lanes → Main8 → Evaluator (independent)`.

Every stage has a single material owner; downstream receives **IDs and read-only references** for canonical source spans, Request, Claim, Requirement and Evidence, rather than repeatedly copying raw input strings, whole graphs, fully expanded JSON and renderer narratives. Keep original input immutable and address spans with offset/length + source digest; normalized text stays separate from the original; preserve the exact ability to reconstruct relevant text. In-memory structural sharing is a candidate, **not an authorization to drop necessary provenance or persist global raw user content**.

Memory-risk audit targets:
- Source Graph and parser: full raw input, normalized variant, sentence/clause copies, regex match arrays and graph JSON serialization; choose span references and bounded temporary arrays, retain correctness for UTF-8/Unicode offset handling and concurrent requests.
- Request/Task canonical plans: repeated question/context/request texts, copies of all Lens/Requirement slots and large intermediary graph projections. Distinguish **references and semantic units**, and never collapse three Requests into one to reduce heap.
- Evidence Search: two provider result buffers, candidate/response excerpts, query expansion/retry, dedupe maps and provenance ledgers. Stream/bound the acquisition, apply per-Claim source scope and dedupe by stable candidate/lineage keys; **do not omit required specialist/general coverage** or treat dedupe as proof of validity.
- Five Lanes/Main8: avoid eager multiple renderer variants, massive duplicated full Request narratives and JSON material copied to each lane; compute reusable source-backed facts once and produce compact per-section views. Preserve distinct Fact/Risk/Multi/Inquiry/Compare semantics and Section 07 unresolved status.
- Logging/traces: stage timestamps, numeric counters, IDs and hashes by default; bounded diagnostic capture with sampled metadata rather than storing complete user text/provider responses in every log. Audit trace must remain sufficient to reproduce failure and follow provenance via authorized secure record access.

### 7.3 CPU-efficiency and scheduling
Reuse `docs/UNIVERSAL_JUDGMENT_MATERIAL_ARCHITECTURE.md` §10 Ready-Queue DAG target and its resource classes; do **not** create a second competing scheduler. Make it work-conserving: launch ready independent stages immediately after dependencies settle, with **separate** bounded concurrency for CPU_JS, PARSER_HTTP, EVIDENCE_HTTP, PROVIDER_HTTP and LIGHT_PROJECTION. I/O waits never occupy CPU worker threads. A CPU-intensive JS phase may use the existing worker pool only if serialization/transfer overhead is demonstrably lower than direct execution.

Avoid recomputing deterministic Parser/Lens/Query/Requirement projections for identical version/config/source digests. Use bounded, versioned, scoped caches only where invariants match; coalesce duplicate in-flight deterministic operations **within the same compatible security scope**, but never silently share untrusted results, mutable instances or fresh external evidence between unrelated callers. An eviction policy needs entry byte estimate, TTL or generation, bounded maximum, pressure eviction and cancellation cleanup. Cache hits cannot bypass Evidence freshness, Request-specific applicability or adoption gates.

A single global lock must not cover network waits, worker startup or provider retry. Separate admission budgets for active CPU work, outstanding outbound I/O, queued requests, in-flight response bytes and number of source graph nodes. Prefer bounded backpressure / request-specific degradation **via explicit unresolved/failure states**, not silent semantic truncation or false PASS.

### 7.4 Shared AI Core coordination and resource lifecycle
For any **explicitly authorized future AI-assisted Astera operation**, send a bounded request to AI Core's generic authenticated gate; AI Core alone owns model RAM, allocation, standby/eviction, routing lease and model-level active inference. Astera owns the *semantic* deadline, validation, cancellation and request-specific retry budget. Propagate cancellation to AI Core and release buffers/streams. Treat `QUEUE_TIMEOUT` and model-cold-start as separate from inference errors; never multiply a full 90-second per-call budget across chained stages when the overall user deadline has expired.

Admission across concurrent products must account for dynamic AI Core resident/lease pressure and Astera's own independent heap/CPU budgets. **Do not use spare memory to spawn a duplicate model**, introduce per-Astera model manager, or infer CPU available from idle threads. Loading any resident model solely for deterministic Main8 is forbidden. Reuse the same model instance where qualified; never reuse another product's private prompt, KV cache, output or context without validated isolation.

### 7.5 Design alternatives and selection (quality-preserving)
| Alternative | Benefit | Failure mode / cost | Decision |
|---|---|---|---|
| Source-span structural sharing + bounded intermediates | Reduce raw-text and graph duplication without losing semantics | Offset bugs / retained-parent leak | **Preferred**, compare exact semantic regression and live heap |
| Ready-Queue DAG + class budgets | Occupy CPU only when ready and overlap unrelated I/O | Queue fairness / cancellation race | **Preferred**, reuse existing scheduler architecture |
| Deterministic versioned cache/in-flight coalescing | Save repeated CPU | Stale scope, secrecy breach, inflated memory | **Conditional** within isolation and memory budget |
| Streaming provider data + compact evidence lineage | Bound peak acquisition RAM | Incomplete citations / missing candidates | **Conditional** with full coverage audit |
| Worker pool for every Task/HTTP call | Appears parallel | IPC/serialization/extra heap/threads | **Reject**; workers only when measured CPU benefit |
| More resident model copies / fixed larger cgroup | May reduce cold latency | Crowds out shared Host and DebugAI | **Reject** in Astera consumer |
| Drop Lens, Fact/Risk, second search route or Section 07 | Less work | Violates product purpose | **Prohibited** |
| General text compression/summary before Source Graph | Lower bytes | Irrecoverable loss of exceptions/claims | **Prohibited** as semantic authority |

### 7.6 Evaluation methodology and hard acceptance
Use a **single fixed corpus and traffic profile** for baseline vs change on the same exact Host image/cgroup limits; include 1k/5k/10k mixed Japanese/English, 38 Lens×3 distinct tasks, nested exceptions/negation, adversarial/noisy input, real signed search provider flows, provider timeout and cross-product concurrency. Separate microbenchmarks from end-to-end and separate mock provider correctness from live provenance.

Record: input bytes; source atoms and Request counts; work completed per second; CPU time (user/system), CPU throttling/PSI delta, event-loop lag/utilization, worker spawn/IPC time; heapUsed/heapTotal/external/ArrayBuffer and peak RSS/cgroup memory delta; peak evidence candidate bytes; queue waits, per-stage wall time, end-to-end latency p50/p95/p99, cancellation latency; counts of cache hit/miss/evictions, provenance gaps and retry calls. Compare cold/warm/contended cases and total throughput per unit CPU and peak RAM **without assuming speedups**.

**Non-negotiable semantic acceptance:** no regression in Request count, original spans, condition/exception scope, Claim/Requirement binding, independent specialist/general routes, Evidence FINAL_VALID adoption rules, five lanes, G01–G38 domain material, correct Main8 8 sections, external final decision authority, truth/UNKNOWN integrity or error taxonomy. A memory reduction that loses information is FAIL. Reject a supposed optimization when it only moves memory from a process into parent cgroup/cache, increases total CPU/latency unacceptably, or makes DebugAI/AI Core fail its own concurrent workload.

**Evidence levels:** DESIGN_PROPOSED (this document) → exact Source/static allocation audit → isolated positive/negative tests & benchmarks → source-exact CI → bounded actual Host multi-service measurements → final product-quality/live search validation. No numerical optimization ratio or safety gain is claimed before the final measurement. Avoid arbitrary universal percentages; measured budgets and capacity thresholds are configuration/policy, not constants embedded in algorithms.

### 7.7 Implementation order after design adoption — not performed in this CU
1. Measure and map the **actual** current v8 allocation/CPU and lock/await behavior at named code call-sites, confirm design baseline against PR #40; record the bytes and stage critical path.
2. Implement lowest-risk source references and bounded temporary buffers; preserve full material equality/semantic equivalence and original source spans.
3. Implement resource-class budgets and work-conserving scheduling by extending the existing DAG implementation, then safe deterministic caches only where tests prove correctness and net benefit.
4. Independently qualify AI Core's generic gate/runtime and consumer isolation; add an optional adapter **only if an actual product operation requires AI**.
5. Compare baseline vs improvement under the same Host concurrency, plus full 38 Lens live Evidence quality. Roll back targeted changes when quality or resource safety regresses.

This extension is **DESIGN ONLY**. No Host data was sampled here, no benchmark run, no optimization implemented, no new model/port/service/paid API deployed. The existing PR #40 code writer remains independent.
