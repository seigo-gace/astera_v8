# Universal Judgment Material — Research Evidence Register

Updated: 2026-10-03  
Status: Research/design evidence for current redesign  
Target architecture: [`UNIVERSAL_JUDGMENT_MATERIAL_ARCHITECTURE.md`](UNIVERSAL_JUDGMENT_MATERIAL_ARCHITECTURE.md)

This document records external theory, standards and open-source components evaluated for the Astera v8 universal judgment-material redesign. It is not implementation proof and it does not authorize a new runtime dependency by itself.

---

## 1. Research question

The redesign must answer:

> How can a deterministic/non-AI core preserve arbitrary Japanese/English input, recover multiple requests/objectives/conditions/claims without semantic collapse, determine what material is actually needed for judgment across G01-G38, retrieve evidence without cross-request contamination, generate meaningful Main8 material, and do so with a GitHub-self-executable quality/performance loop and a sub-second-oriented runtime architecture?

The research is therefore grouped by architectural problem, not by product/document type.

---

## 2. Long-document structure and segmentation

### Sources

- Buchmann et al., **Document Structure in Long Document Transformers**, EACL 2024  
  https://aclanthology.org/2024.eacl-long.64/
- Ghinassi et al., **Recent Trends in Linear Text Segmentation: A Survey**, EMNLP Findings 2024  
  https://aclanthology.org/2024.findings-emnlp.174/
- Retkowski & Waibel, **From Text Segmentation to Smart Chaptering**, EACL 2024  
  https://aclanthology.org/2024.eacl-long.25/
- Duarte et al., **LumberChunker**, EMNLP Findings 2024  
  https://aclanthology.org/2024.findings-emnlp.377/
- Shi et al., **SEGMENT+**, EMNLP 2024  
  https://aclanthology.org/2024.emnlp-main.926/

### What transfers to Astera

- structural hierarchy is useful before semantic compression;
- fixed character/token chunks cannot be semantic authority;
- boundaries should use headings/lists/paragraphs/sentences/clauses and semantic shifts;
- long-input processing should preserve local source spans and hierarchy;
- relevant-block selection can reduce later work, but must not silently delete decision-relevant material.

### What does not transfer directly

LLM-dependent segmentation is not accepted as an Astera Core dependency. Model-based systems are research evidence that variable semantic boundaries matter, not an implementation mandate.

---

## 3. Complex-question / claim decomposition

### Sources

- Chen et al., **Complex Claim Verification with Evidence Retrieved in the Wild**, NAACL 2024  
  https://aclanthology.org/2024.naacl-long.196/
- Ammann et al., **Question Decomposition for Retrieval-Augmented Generation**, ACL 2025  
  https://aclanthology.org/2025.acl-srw.32/
- Li et al., **Topology-of-Question-Decomposition**, COLING 2025  
  https://aclanthology.org/2025.coling-main.191/
- Zhu et al., **ChainRAG: Lost-in-Retrieval**, ACL 2025  
  https://aclanthology.org/2025.acl-long.1089/
- Sun et al., **PEARL**, EACL 2024  
  https://aclanthology.org/2024.eacl-long.29/

### What transfers

- one complex question often needs a graph/topology of subquestions;
- decomposition should preserve key entities and source context;
- retrieval should be invoked only where needed;
- claim decomposition and evidence retrieval should remain separate stages;
- later subquestions may depend on prior factual resolution.

### Astera design consequence

```text
Input
→ Judgment Requests
→ Claims
→ Evidence sub-questions
```

These are three different levels. Evidence sub-questions do not increase public Request count.

---

## 4. Argumentation and opposing material

### Sources

- Dung, **On the Acceptability of Arguments and its Fundamental Role in Nonmonotonic Reasoning**, Artificial Intelligence 1995  
  https://doi.org/10.1016/0004-3702(94)00041-X
- Modgil & Prakken, **The ASPIC+ framework for structured argumentation: a tutorial**, 2014  
  https://doi.org/10.1080/19462166.2013.869766
- ARIES benchmark, ArgMining 2024  
  https://aclanthology.org/2024.argmining-1.1/
- PerspectiveArg2024  
  https://aclanthology.org/2024.argmining-1.14/
- CU-MAM, ACL 2025  
  https://aclanthology.org/2025.acl-long.969/
- **Mining Complex Patterns of Argumentative Reasoning**, ACL 2025  
  https://aclanthology.org/2025.acl-long.368/

### What transfers

Astera does not need to calculate a winning argument. It can reuse the structural distinction between support and attacks.

Target relations include:

```text
supports
rebut                  # conflicts with conclusion
undercut                # challenges inference/connection
undermine               # challenges premise
qualifies
exception_to
alternative_to
```

This gives Section 05 a deterministic reason for including an opposing item. Generic negative boilerplate is not an argument relation.

### What is explicitly not adopted

Astera does not use argument acceptability semantics to make the final decision or pick a winner. External final decision authority remains fixed.

---

## 5. Requirements, deontic rules, conditions and exceptions

### Sources / standards

- Mavin et al., **Easy Approach to Requirements Syntax (EARS)**, RE 2009  
  https://doi.org/10.1109/RE.2009.9
- OMG **Requirements Interchange Format (ReqIF) 1.2**  
  https://www.omg.org/spec/ReqIF/1.2
- OASIS **LegalRuleML Core 1.0**  
  https://docs.oasis-open.org/legalruleml/legalruleml-core-spec/v1.0/
- OMG **Semantics of Business Vocabulary and Rules (SBVR)**  
  https://www.omg.org/spec/SBVR/1.2
- Koreeda & Manning, **ContractNLI**, EMNLP Findings 2021  
  https://aclanthology.org/2021.findings-emnlp.164/
- Sancheti et al., **What to Read in a Contract?**, EMNLP 2023  
  https://aclanthology.org/2023.emnlp-main.909/
- Goal-model extraction from natural-language requirements, Journal of Systems and Software 2024  
  https://doi.org/10.1016/j.jss.2024.111981
- Test-case information extraction from natural-language requirements, Journal of Systems and Software 2024  
  https://doi.org/10.1016/j.jss.2024.112005
- AI Act obligation extraction / knowledge-graph workflow, Computer Law & Security Review 2025  
  https://doi.org/10.1016/j.clsr.2025.106181

### What transfers

The universal semantic ontology must distinguish at least:

```text
OBLIGATION
PROHIBITION
PERMISSION
CONDITION
EXCEPTION
PRESERVE
DEADLINE
SCOPE
DEPENDENCY
ACCEPTANCE_CRITERION
```

EARS contributes explicit trigger/state/unwanted/optional patterns. LegalRuleML contributes the Obligation/Permission/Prohibition distinction. ContractNLI shows why span evidence and exception scope matter.

### Important boundary

Astera does not rewrite arbitrary input into EARS or ReqIF. These standards provide extraction/validation concepts. Original wording and source spans remain authoritative.

---

## 6. Decision/problem structuring without taking decision authority

### Sources

- OMG **Decision Model and Notation (DMN)**  
  https://www.omg.org/dmn/
- Marttunen, Lienert & Belton, **Structuring problems for Multi-Criteria Decision Analysis in practice**, EJOR 2017  
  https://doi.org/10.1016/j.ejor.2017.04.041
- Cinelli et al., **A comprehensive taxonomy for MCDA support**, Omega 2020  
  https://doi.org/10.1016/j.omega.2020.102261
- Durbach & Stewart, **Modeling uncertainty in multi-criteria decision analysis**, EJOR 2012  
  https://doi.org/10.1016/j.ejor.2012.04.038
- Basili / van Solingen et al., **Goal Question Metric (GQM)**  
  https://doi.org/10.1002/0471028959.sof142

### What transfers

DMN separates decisions, input data and knowledge requirements. Astera uses the analogous idea to ask what information is required by a judgment question without executing a normative decision table.

MCDA literature supports explicit problem structuring, alternatives, criteria and uncertainty before selection. Astera uses criteria/material structure but does not assign a winner or utility score.

GQM contributes a useful top-down pattern:

```text
Goal
→ Questions required to establish the Goal
→ Observable/measureable material required to answer those Questions
```

Astera adapts this as an optional `objective → inquiry → material-slot` derivation, especially for vague business/engineering goals.

### What is not adopted

- automatic MCDA ranking;
- AHP/TOPSIS or weighted winner selection as a default;
- DMN execution as final decision authority.

---

## 7. Evidence retrieval, sufficiency and provenance

### Sources

- AVeriTeC / ClaimDecomp in Chen et al. 2024  
  https://aclanthology.org/2024.naacl-long.196/
- Sriram et al., **Contrastive Learning to Improve Retrieval for Real-World Fact Checking**, FEVER 2024  
  https://aclanthology.org/2024.fever-1.28/
- Malon, **Multi-hop Evidence Pursuit Meets the Web**, FEVER 2024  
  https://aclanthology.org/2024.fever-1.2/
- Upravitelev et al., **Semantic Filtering for Efficient Claim Verification**, FEVER 2025  
  https://aclanthology.org/2025.fever-1.17/
- W3C **PROV-O** provenance ontology  
  https://www.w3.org/TR/prov-o/

### What transfers

- evidence belongs to exact Claims/Requests;
- complex Claims may require bounded prerequisite/subquestion topology;
- a small sufficient evidence set is preferable to indiscriminate retrieval;
- retrieval score/similarity can be reused to avoid redundant expensive passes where safe;
- source derivation/transformation should be explicit.

PROV-O inspires lightweight fields such as:

```text
source_entity
source_uri
retrieved_at
derived_from
generated_by
transformation
bound_claim_ids
bound_request_ids
```

Astera does not need an RDF/OWL runtime to preserve these concepts.

---

## 8. Graph/data validation

### Sources

- W3C **SHACL**, graph-shape validation  
  https://www.w3.org/TR/shacl/
- JSON Schema 2020-12 family as a general JSON contract reference  
  https://json-schema.org/specification

### What transfers

Astera's Source/Atom/Case/Evidence graphs should be validated against explicit structural invariants before projection.

Examples:

- every semantic atom has a valid source span;
- every Request has at least one objective/outcome or an explicit unresolved reason;
- local constraints point to valid owners;
- relation endpoints exist;
- dependency graph is acyclic where required;
- evidence bindings point to existing Claims;
- one public Request cannot be created solely from an internal retrieval node.

A lightweight zero-dependency validator is acceptable if it enforces the same explicit shapes. SHACL/RDF itself is not required.

---

## 9. Document ingestion and structure-preserving adapters

Arbitrary **content** does not mean the Core must directly embed every file-format parser. Document ingestion is an adapter boundary.

### Evaluated candidates

#### Docling

- Project: https://github.com/docling-project/docling
- Research: https://research.ibm.com/publications/docling-an-efficient-open-source-toolkit-for-ai-driven-document-conversion

Strengths:

- broad PDF/Office/HTML/image/etc support;
- unified richly structured document representation;
- hierarchy/tables/layout support;
- offline/self-hosted path.

Tradeoffs:

- Python and optional AI/layout models;
- not appropriate as mandatory sub-100ms Core hot-path dependency.

Decision: **benchmark as an upstream/offline Document AST adapter**, especially for layout-rich PDF/Office ingestion. Do not make it semantic authority for Request count.

#### Pandoc AST

- https://pandoc.org/filters.html

Strengths:

- stable document AST for many text/markup/office formats;
- headings/blocks/inlines preserved;
- JSON AST can be consumed by any language.

Decision: **strong deterministic adapter candidate for formats Pandoc reads well**. Not a PDF-layout parser.

#### Apache Tika

- https://tika.apache.org/docs/4.0.x/formats.html

Strengths:

- very broad content-type detection, text and metadata extraction.

Tradeoffs:

- Java service/process and weaker semantic layout representation for some formats.

Decision: fallback/coverage candidate at ingestion boundary, not semantic Core.

#### officeParser (Node.js)

- https://github.com/harshankur/officeParser

Strengths:

- Node-native; current releases advertise rich AST for many Office/document formats and require Node 22.x.

Decision: candidate for benchmark against Pandoc/Docling for the Node-native ingestion path. Maturity, exact output fidelity, security and license/version compatibility must be verified before adoption.

### Adapter contract

All adapters normalize into `astera.source-document.v1` / Source Graph inputs and preserve:

- hierarchy;
- original textual spans or stable source anchors;
- table/list roles;
- page/slide/sheet coordinates when available;
- source file identity;
- extraction method/version.

Semantic interpretation happens after this adapter boundary.

---

## 10. Language and syntactic support

### Evaluated references

- Universal Dependencies  
  https://universaldependencies.org/
- English dependency relations  
  https://universaldependencies.org/en/dep/
- Japanese GSD  
  https://universaldependencies.org/treebanks/ja_gsd/
- spaCy rule/dependency matchers  
  https://spacy.io/usage/rule-based-matching/
- Stanza  
  https://stanfordnlp.github.io/stanza/
- GiNZA  
  https://github.com/megagonlabs/ginza

### Decision

Universal Dependencies is useful as a **cross-language syntactic vocabulary/reference**, but Astera does not require every language adapter to run the same neural dependency parser.

- Japanese keeps the existing Deterministic Japanese Parser MCP as a primary semantic source.
- English can start with deterministic lexical/clause/deontic rules and optionally benchmark a dependency parser.
- GiNZA/Stanza/spaCy are benchmark/reference candidates, not approved mandatory runtime dependencies.
- neural/GPU-dependent pipelines must prove latency/quality value before entering the hot path.

---

## 11. Runtime / V8 / Node research

### Sources

- Node.js Worker Threads  
  https://nodejs.org/api/worker_threads.html
- Worker `performance.eventLoopUtilization()`  
  https://nodejs.org/api/worker_threads.html
- Node `diagnostics_channel`  
  https://nodejs.org/api/diagnostics_channel.html
- Node `perf_hooks`  
  https://nodejs.org/api/perf_hooks.html
- Piscina  
  https://github.com/piscinajs/piscina
- Graphlib  
  https://github.com/dagrejs/graphlib
- Temporal TypeScript SDK  
  https://github.com/temporalio/sdk-typescript
- OpenTelemetry trace concepts/semantic conventions  
  https://opentelemetry.io/docs/specs/otel/trace/api/

### Confirmed design decisions

- V8/Node is not itself a latency optimization.
- Worker Threads are for CPU-heavy JS; normal HTTP Parser/Evidence waits remain async I/O.
- current custom Worker Pool must be measured before replacement;
- Piscina is a benchmark candidate for queue/cancellation/timing design;
- ready-queue DAG scheduling can be implemented internally; Graphlib is a candidate/reference, not an automatic dependency;
- Temporal is too heavy to become a mandatory per-request hot-path orchestrator, though durable workflow ideas can support long-running/recovery paths;
- runtime tracing should use low-overhead Node-native instrumentation first; OpenTelemetry-compatible semantics are useful for later interoperability.

Required measurements include:

```text
queue_wait_ms
run_ms
serialization_ms
worker_spawn_ms
worker_elu
main_event_loop_elu
external_wait_ms
cache_hit
input_bytes
request_count
task_count
claim_count
```

---

## 12. Verification science

### Property-based / metamorphic testing

- fast-check official: https://fast-check.dev/
- GitHub: https://github.com/dubzzz/fast-check

Property-based testing is a strong fit for invariants that cannot be proven with two hand-written examples.

Candidate properties:

- harmless punctuation changes do not change Request count/ownership;
- inserting unrelated background context does not delete existing Requests;
- reordered independent paragraphs preserve equivalent Case Graph relations;
- negating an obligation must change its deontic atom instead of silently retaining the old one;
- adding an exception attaches an exception relation rather than creating a phantom Request;
- JA/EN equivalent fixture pairs preserve semantic graph signatures;
- no generated input can produce an invalid source span;
- public material never contains forbidden internal tokens.

Decision: `fast-check` is a high-value **dev-dependency candidate** because the project is already Node 22. Adoption requires repository/dependency approval in the implementation phase; the architecture does not assume it is already installed.

### Semantic gold instead of exact wording

Gold fixtures should assert structures/material slots rather than full response strings. This allows wording improvements without weakening semantic gates.

### Holdout/unseen tests

A finite corpus cannot mathematically prove all possible input. Completion therefore requires:

- fixed gold corpus;
- unseen holdout corpus;
- property-based generation;
- metamorphic transformations;
- 38-genre matrix;
- JA/EN parity;
- long-input stress;
- live exact-runtime proof.

---

## 13. Component decision table

| Candidate / theory | Target use | Hot path? | Current decision |
|---|---|---:|---|
| Document structure / segmentation research | Source Graph boundaries | yes, deterministic form | adopt concept |
| AVeriTeC / question decomposition | Claim/evidence topology | yes, deterministic form | adopt concept |
| Dung / ASPIC+ | support/rebut/undercut/undermine relations | yes, simplified relations | adopt concept, no winner semantics |
| EARS | trigger/state/exception requirement patterns | yes, language adapter rules | adopt concepts |
| LegalRuleML deontic vocabulary | obligation/permission/prohibition | yes, ontology concepts | adopt concepts |
| DMN | decision/input/knowledge requirement structure | yes, adapted | adopt concepts, no decision execution |
| MCDA problem structuring | alternatives/criteria/uncertainty | yes, material structuring | adopt concepts, no auto ranking |
| GQM | objective→question→measurable material | targeted | adopt as material derivation pattern |
| PROV-O | provenance vocabulary | yes, lightweight fields | adopt concepts, no RDF requirement |
| SHACL | graph invariant validation model | yes, lightweight equivalent | adopt concept |
| Docling | layout-rich document AST | upstream | benchmark candidate |
| Pandoc AST | structure-preserving document adapter | upstream | strong candidate |
| Apache Tika | broad text/metadata fallback | upstream | benchmark candidate |
| officeParser | Node-native document AST | upstream | benchmark candidate |
| spaCy/Stanza/GiNZA | dependency/syntax analysis | adapter | benchmark/reference only |
| Universal Dependencies | cross-language syntax vocabulary | adapter | reference vocabulary |
| Piscina | CPU Worker pool | yes if proven | benchmark candidate |
| Graphlib | DAG algorithms | yes if needed | reference/candidate |
| Temporal | durable workflow | no per-request | reject from hot path |
| OpenTelemetry semantics | trace interoperability | optional | use semantic model; Node-native first |
| fast-check | property-based regression | CI/dev only | high-value candidate |

---

## 14. Research conclusion

No single open-source parser/framework solves Astera's product contract.

The strongest architecture is a composition of proven ideas:

```text
structure-preserving document representation
+ source-backed semantic atoms
+ Request/Task/Claim separation
+ argument/deontic/constraint relations
+ decision-material requirement graph
+ provenance-bound evidence topology
+ work-conserving DAG execution
+ semantic/material-sufficiency validation
+ property/metamorphic/holdout verification
```

The most important rule remains: external theory and OSS may supply algorithms and components, but no component is allowed to redefine Astera's final responsibility — truthful decision-ready Main8 material with external final decision authority.
