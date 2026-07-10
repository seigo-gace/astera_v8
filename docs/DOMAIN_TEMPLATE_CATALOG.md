# Astera v8 Domain Template Catalog

Status: draft implementation input

## Purpose

This document defines the domain templates used before running the V8 five-pillar engine.

Astera should not pass every raw instruction, output template, or explanatory block directly into the five pillars. Instead, it should first normalize the request, detect the use case, select one or more domain templates, and then pass only the relevant judgment material into the five-pillar engine.

```text
User Input
  -> Input Normalizer
  -> Domain Router
  -> Domain Template Lens
  -> V8 Five Pillars
  -> Domain Safety / Evidence Gate
  -> 8-Section Output
```

## Core Principle

The five pillars remain stable:

```text
Fact
Risk
Multi
Inquiry
Compare
```

Domain templates change what each pillar looks for.

The template is not the final answer. It is a lens that tells V8 what judgment materials to collect before the main AI produces the final response.

## Universal Intake Packet

Every request should first be reduced into this packet.

```yaml
core_request: what the user is actually asking
true_objective: likely deeper goal
audience: who the answer is for
domain_candidates: possible domains
urgency: low | normal | high | emergency
stakes: low | medium | high
jurisdiction_or_market: country, state, industry, platform, channel, if relevant
time_sensitivity: stable | current_info_needed
known_facts: facts explicitly provided by the user
assumptions: assumptions needed to proceed
constraints: budget, deadline, staff, tech, policy, legal, brand, risk tolerance
evidence_available: user-provided evidence, files, URLs, data, logs, screenshots
missing_context: questions that materially change the answer
do_not_analyze_as_request: pasted templates, examples, meta instructions, old outputs
```

## Universal Safety Gates

Apply these regardless of domain.

- Do not treat pasted templates or examples as the user's actual goal unless the user says so.
- Separate facts, user claims, assumptions, and model inferences.
- If current law, pricing, product behavior, model capability, market conditions, or public facts matter, require external verification before asserting.
- For legal, medical, financial, safety, security, employment, or regulatory topics, add an expert-review warning and avoid professional advice framing.
- Preserve evidence for `03 Fact Check` and `04 Risk Detection`.
- If evidence is absent, generate an evidence gap instead of inventing support.
- When multiple domains apply, run a primary template plus secondary safety overlays.

## Template Format

Each domain template uses this shape.

```yaml
id:
name:
router_signals:
fact_lens:
risk_lens:
multi_lens:
inquiry_lens:
compare_lens:
evidence_to_collect:
safety_gate:
handoff_to_8_sections:
```

---

## 00 General Judgment

```yaml
id: general_judgment
name: General Judgment / Default
router_signals:
  - broad request
  - no specialized domain dominates
fact_lens:
  - explicit user goal
  - audience
  - success conditions
  - constraints
  - evidence vs assumption
risk_lens:
  - misunderstanding
  - missing context
  - overclaiming
  - wrong format
  - actionability failure
multi_lens:
  - user
  - recipient
  - operator
  - critic
  - future maintainer
inquiry_lens:
  - what outcome is desired
  - who decides success
  - what must be avoided
compare_lens:
  - fast answer
  - careful answer
  - staged answer
evidence_to_collect:
  - user-provided facts
  - constraints
  - examples
safety_gate:
  - if a specialist domain appears, attach the relevant overlay
handoff_to_8_sections:
  - emphasize purpose, missing context, and recommendation
```

## 01 Business / Executive Strategy

Use for management decisions, business model changes, launch decisions, pricing strategy, partnerships, pivots, hiring plans, and board-level tradeoffs.

```yaml
id: business_strategy
name: Business / Executive Strategy
router_signals:
  - strategy
  - management decision
  - revenue
  - market entry
  - pricing
  - partnership
  - business model
fact_lens:
  - business objective
  - current revenue, margin, cash, runway
  - target segment
  - market size and timing
  - competitor position
  - internal capabilities
  - decision owner and deadline
risk_lens:
  - cash flow risk
  - strategic drift
  - execution capacity
  - brand or trust damage
  - opportunity cost
  - irreversible commitment
multi_lens:
  - customer
  - competitor
  - investor
  - operator
  - frontline team
  - regulator if relevant
inquiry_lens:
  - what metric defines success
  - what is the budget and runway
  - what is the downside limit
  - what is the exit condition
compare_lens:
  - option A: aggressive growth
  - option B: defensive stabilization
  - option C: staged experiment
  - compare by ROI, risk, reversibility, speed, strategic fit
evidence_to_collect:
  - financial data
  - customer data
  - competitor evidence
  - market research
  - capacity plan
safety_gate:
  - if investment, debt, securities, or tax implications appear, attach finance/legal overlays
handoff_to_8_sections:
  - make recommendation conditional on metrics and exit criteria
```

Reference anchors: Balanced Scorecard perspectives and strategy metrics; Porter's Five Forces for industry structure; SWOT for internal/external strategic factors.

## 02 Finance / Investment / Capital Allocation

Use for budget decisions, investment evaluation, fundraising, cost reduction, pricing economics, forecasts, and capital allocation.

```yaml
id: finance_capital
name: Finance / Investment / Capital Allocation
router_signals:
  - investment
  - ROI
  - budget
  - funding
  - valuation
  - cash flow
  - cost reduction
  - portfolio
fact_lens:
  - amount
  - time horizon
  - cash flow assumptions
  - revenue and cost drivers
  - risk tolerance
  - liquidity needs
  - tax/accounting constraints
risk_lens:
  - inaccurate assumptions
  - liquidity risk
  - leverage risk
  - regulatory or tax risk
  - concentration risk
  - downside tail risk
multi_lens:
  - owner
  - investor
  - lender
  - CFO
  - tax/legal advisor
  - downside-case reviewer
inquiry_lens:
  - what data is actual vs forecast
  - what scenario breaks the plan
  - what capital cannot be lost
  - what approval is needed
compare_lens:
  - base case
  - upside case
  - downside case
  - do nothing
  - staged commitment
evidence_to_collect:
  - historical numbers
  - forecast model
  - unit economics
  - assumptions table
  - sensitivity analysis
safety_gate:
  - do not provide personalized financial, tax, securities, or investment advice
  - require current market/regulatory verification when relevant
handoff_to_8_sections:
  - state assumptions, uncertainty, downside, and decision threshold
```

## 03 Legal / Compliance / Contract

Use for legal questions, contracts, disputes, employment rules, intellectual property, privacy law, consumer protection, and compliance interpretation.

```yaml
id: legal_compliance
name: Legal / Compliance / Contract
router_signals:
  - law
  - contract
  - lawsuit
  - liability
  - compliance
  - employment
  - copyright
  - privacy regulation
fact_lens:
  - jurisdiction
  - parties
  - timeline
  - documents
  - exact wording
  - evidence
  - deadlines
  - current procedural status
risk_lens:
  - unauthorized legal advice
  - wrong jurisdiction
  - missing facts
  - limitation periods
  - privilege/confidentiality
  - escalation or retaliation risk
multi_lens:
  - user
  - opposing party
  - neutral decision maker
  - regulator
  - lawyer
  - business operator
inquiry_lens:
  - where did this happen
  - what documents exist
  - what deadline applies
  - what outcome is desired
  - what has already been communicated
compare_lens:
  - self-help information
  - collect facts first
  - negotiate
  - consult attorney
  - formal escalation
evidence_to_collect:
  - contracts
  - written communications
  - dates
  - applicable jurisdiction
  - official legal sources if current law matters
safety_gate:
  - do not give definitive legal conclusions
  - use issue/rule/application/conclusion structure only as analysis aid
  - recommend qualified counsel for high-stakes or jurisdiction-specific decisions
handoff_to_8_sections:
  - separate legal information from legal advice and list facts counsel needs
```

Reference anchor: IRAC/CRAC legal reasoning structures separate issue, rule, application/analysis, and conclusion.

## 04 Medical / Health / Clinical

Use for health symptoms, treatment choices, clinical research, medical products, public health, and care navigation.

```yaml
id: medical_health
name: Medical / Health / Clinical
router_signals:
  - symptom
  - diagnosis
  - treatment
  - medication
  - doctor
  - emergency
  - clinical study
  - vaccine
fact_lens:
  - patient/population
  - symptoms and duration
  - age, pregnancy, comorbidities if provided
  - intervention
  - comparison
  - outcomes
  - evidence certainty
risk_lens:
  - emergency red flags
  - unsafe self-treatment
  - medication interaction
  - delayed care
  - low-certainty evidence
  - overdiagnosis
multi_lens:
  - patient
  - clinician
  - caregiver
  - public health
  - benefit-risk reviewer
inquiry_lens:
  - what are red-flag symptoms
  - what treatment is already being used
  - what outcome matters most
  - what evidence quality exists
compare_lens:
  - seek urgent care
  - schedule clinician visit
  - monitor with safety criteria
  - discuss options with clinician
evidence_to_collect:
  - PICO elements
  - guideline source
  - systematic review evidence
  - benefit-risk factors
  - patient preference if provided
safety_gate:
  - do not diagnose
  - emergency symptoms require urgent-care direction
  - current medical guidance must be verified from reliable sources
handoff_to_8_sections:
  - emphasize uncertainty, red flags, and clinician review
```

Reference anchors: PICO structures clinical questions; GRADE assesses certainty of evidence; FDA benefit-risk frameworks communicate evidence, uncertainty, and reasoning.

## 05 Marketing / Growth / Brand

Use for campaigns, positioning, conversion, advertising, copy, brand, content strategy, channel selection, and customer acquisition.

```yaml
id: marketing_growth
name: Marketing / Growth / Brand
router_signals:
  - marketing
  - campaign
  - copy
  - positioning
  - conversion
  - funnel
  - ad
  - brand
fact_lens:
  - product
  - target segment
  - customer pain
  - offer
  - channel
  - price
  - proof
  - conversion goal
risk_lens:
  - misleading claims
  - brand mismatch
  - platform policy violation
  - privacy/consent risk
  - backlash
  - weak differentiation
multi_lens:
  - customer
  - buyer
  - skeptical prospect
  - competitor
  - brand owner
  - platform reviewer
inquiry_lens:
  - who exactly is targeted
  - what promise is provable
  - what action should happen
  - what constraint does the channel impose
compare_lens:
  - message A/B/C
  - channel options
  - short-term conversion vs long-term brand
  - broad reach vs high intent
evidence_to_collect:
  - customer research
  - conversion data
  - competitive claims
  - platform ad policies
  - testimonials/proof
safety_gate:
  - flag unverified claims
  - attach legal/compliance overlay for regulated products
handoff_to_8_sections:
  - preserve target, promise, proof, channel, and test plan
```

Reference anchor: STP separates segmentation, targeting, and positioning.

## 06 Product / UX / Roadmap

Use for product requirements, roadmap decisions, feature prioritization, user experience, onboarding, pricing packaging, and product discovery.

```yaml
id: product_ux
name: Product / UX / Roadmap
router_signals:
  - product
  - feature
  - roadmap
  - UX
  - onboarding
  - prioritization
  - backlog
fact_lens:
  - user segment
  - job to be done
  - pain point
  - current behavior
  - success metric
  - usage data
  - constraints
risk_lens:
  - building the wrong feature
  - complexity creep
  - accessibility issue
  - adoption friction
  - support burden
  - metric gaming
multi_lens:
  - user
  - buyer
  - support
  - engineering
  - sales
  - accessibility reviewer
inquiry_lens:
  - what user problem is proven
  - what metric should move
  - what is the smallest test
  - what must be reversible
compare_lens:
  - RICE-style reach, impact, confidence, effort
  - must-have vs nice-to-have
  - build vs buy vs defer
evidence_to_collect:
  - user interviews
  - analytics
  - support tickets
  - competitive examples
  - effort estimates
safety_gate:
  - do not treat stakeholder preference as user evidence
handoff_to_8_sections:
  - make recommendation tied to metric and validation plan
```

Reference anchor: Product prioritization frameworks such as RICE evaluate reach, impact, confidence, and effort.

## 07 Engineering / Architecture / Implementation

Use for software design, architecture choices, implementation plans, migrations, APIs, databases, infrastructure, and technical tradeoffs.

```yaml
id: engineering_architecture
name: Engineering / Architecture / Implementation
router_signals:
  - architecture
  - API
  - database
  - migration
  - implementation
  - performance
  - scalability
  - code
fact_lens:
  - current system
  - requirements
  - constraints
  - dependencies
  - runtime
  - data model
  - nonfunctional requirements
risk_lens:
  - data loss
  - downtime
  - security regression
  - operational complexity
  - vendor lock-in
  - irreversible migration
multi_lens:
  - developer
  - operator
  - user
  - security
  - future maintainer
  - cost owner
inquiry_lens:
  - what must remain compatible
  - what rollback exists
  - what tests prove it
  - what constraints are hard
compare_lens:
  - current path
  - incremental refactor
  - replacement
  - buy/service option
  - compare by maintainability, risk, cost, reversibility
evidence_to_collect:
  - code references
  - logs
  - metrics
  - architecture docs
  - test output
  - ADR context
safety_gate:
  - require verification before claiming implementation status
  - preserve rollback and test requirements
handoff_to_8_sections:
  - include chosen approach, rejected alternatives, tests, and rollback
```

Reference anchors: ADRs capture context, decision, alternatives, and consequences; SLO/error budgets connect reliability goals to release decisions.

## 08 Cybersecurity / Privacy / Trust

Use for authentication, authorization, secrets, threat modeling, privacy, incident response, logging, data retention, and abuse prevention.

```yaml
id: cybersecurity_privacy
name: Cybersecurity / Privacy / Trust
router_signals:
  - security
  - auth
  - token
  - secret
  - breach
  - privacy
  - PII
  - encryption
  - vulnerability
fact_lens:
  - assets
  - trust boundaries
  - data flows
  - actors
  - permissions
  - secrets
  - retention
  - incident timeline
risk_lens:
  - spoofing
  - tampering
  - repudiation
  - information disclosure
  - denial of service
  - elevation of privilege
  - privacy harm
multi_lens:
  - attacker
  - user
  - operator
  - compliance
  - incident responder
  - data subject
inquiry_lens:
  - what asset is protected
  - what attacker capability is assumed
  - what logs exist
  - what must be reported
  - what mitigation is feasible now
compare_lens:
  - prevent
  - detect
  - respond
  - recover
  - accept risk with controls
evidence_to_collect:
  - architecture diagram
  - logs
  - access policy
  - data inventory
  - incident indicators
  - control evidence
safety_gate:
  - avoid providing exploit instructions
  - use defensive framing
  - require secret rotation if exposed
handoff_to_8_sections:
  - emphasize threat, evidence, mitigation, residual risk, and monitoring
```

Reference anchors: OWASP threat modeling and STRIDE; NIST Cybersecurity Framework functions.

## 09 AI / ML / LLM Governance

Use for AI product decisions, model selection, prompt systems, evaluation, safety, bias, privacy, model deployment, and AI operations.

```yaml
id: ai_ml_governance
name: AI / ML / LLM Governance
router_signals:
  - AI
  - LLM
  - model
  - prompt
  - evaluation
  - hallucination
  - bias
  - guardrail
fact_lens:
  - use case
  - model/provider
  - input/output data
  - users affected
  - evaluation set
  - quality bar
  - deployment context
risk_lens:
  - hallucination
  - bias/discrimination
  - privacy leakage
  - unsafe automation
  - prompt injection
  - overreliance
  - audit gap
multi_lens:
  - end user
  - operator
  - affected subject
  - compliance
  - evaluator
  - adversary
inquiry_lens:
  - what decision does the AI influence
  - what harm is possible
  - what evaluation proves readiness
  - what human review exists
compare_lens:
  - no AI
  - assistive AI
  - automated AI with review
  - automated AI without review
  - compare by harm, accuracy, cost, auditability
evidence_to_collect:
  - eval results
  - model cards/docs
  - red-team findings
  - monitoring plan
  - data handling policy
safety_gate:
  - apply risk management across govern, map, measure, manage
  - require evidence before claiming safety or accuracy
handoff_to_8_sections:
  - include use-case risk, eval evidence, human fallback, and monitoring
```

Reference anchor: NIST AI RMF organizes AI risk work around Govern, Map, Measure, and Manage.

## 10 Project / Program / Operations

Use for delivery plans, project risk, staffing, timelines, process design, operational improvement, and execution management.

```yaml
id: project_operations
name: Project / Program / Operations
router_signals:
  - project
  - deadline
  - operations
  - process
  - delivery
  - staffing
  - launch plan
fact_lens:
  - scope
  - deliverables
  - timeline
  - owners
  - dependencies
  - resources
  - acceptance criteria
risk_lens:
  - scope creep
  - dependency delay
  - unclear ownership
  - quality failure
  - capacity overload
  - missing rollback
multi_lens:
  - sponsor
  - project owner
  - implementer
  - reviewer
  - customer
  - operations
inquiry_lens:
  - what is in/out of scope
  - who owns each decision
  - what is the critical path
  - what is the contingency plan
compare_lens:
  - full scope
  - MVP
  - phased rollout
  - defer/cancel
  - compare by risk, cost, time, quality
evidence_to_collect:
  - plan
  - dependency list
  - resource estimate
  - risk register
  - acceptance tests
safety_gate:
  - require explicit owner and due date for recommended next action
handoff_to_8_sections:
  - include decision, owner, next action, and risk response
```

Reference anchor: Project risk management identifies, analyzes, and responds to project risks.

## 11 HR / Organization / People

Use for hiring, performance, team design, compensation, conflict, policy, culture, and leadership communication.

```yaml
id: hr_organization
name: HR / Organization / People
router_signals:
  - hiring
  - employee
  - performance
  - compensation
  - manager
  - conflict
  - team
  - HR policy
fact_lens:
  - role
  - people affected
  - documented facts
  - policy
  - timeline
  - performance evidence
  - legal jurisdiction if relevant
risk_lens:
  - unfairness
  - discrimination
  - retaliation
  - confidentiality
  - morale damage
  - employment law risk
multi_lens:
  - employee
  - manager
  - HR
  - team
  - legal/compliance
  - customer if relevant
inquiry_lens:
  - what facts are documented
  - what policy applies
  - what outcome is desired
  - what must remain confidential
compare_lens:
  - informal conversation
  - documented plan
  - HR escalation
  - legal review
  - no action with monitoring
evidence_to_collect:
  - policy docs
  - written records
  - performance data
  - prior communications
safety_gate:
  - attach legal overlay for employment law, discipline, termination, discrimination, or harassment
handoff_to_8_sections:
  - emphasize fairness, documentation, confidentiality, and escalation criteria
```

## 12 Sales / Customer Success / Negotiation

Use for deals, proposals, objections, renewals, customer complaints, negotiation, account plans, and support escalations.

```yaml
id: sales_customer_success
name: Sales / Customer Success / Negotiation
router_signals:
  - sales
  - customer
  - proposal
  - negotiation
  - renewal
  - objection
  - complaint
  - churn
fact_lens:
  - buyer
  - decision process
  - pain
  - budget
  - timeline
  - alternatives
  - proof
  - contract constraints
risk_lens:
  - overpromising
  - bad-fit customer
  - discount trap
  - legal/contract risk
  - churn risk
  - trust damage
multi_lens:
  - champion
  - economic buyer
  - end user
  - procurement
  - competitor
  - customer success
inquiry_lens:
  - what is the buying trigger
  - who can say no
  - what proof is needed
  - what concession is acceptable
compare_lens:
  - value-based proposal
  - pilot
  - discount
  - walk away
  - executive escalation
evidence_to_collect:
  - CRM notes
  - customer objections
  - usage data
  - commercial terms
  - case studies
safety_gate:
  - flag commitments that product, legal, or support cannot honor
handoff_to_8_sections:
  - include buyer motive, risk, objection handling, and next step
```

## 13 Research / Academic / Evidence Review

Use for literature review, research design, hypothesis evaluation, claims, citations, academic writing, and evidence synthesis.

```yaml
id: research_evidence
name: Research / Academic / Evidence Review
router_signals:
  - research
  - paper
  - study
  - evidence
  - literature
  - hypothesis
  - citation
fact_lens:
  - research question
  - population/context
  - method
  - data
  - claims
  - limitations
  - source quality
risk_lens:
  - cherry-picking
  - weak evidence
  - correlation vs causation
  - outdated source
  - citation fabrication
  - overgeneralization
multi_lens:
  - author
  - reviewer
  - practitioner
  - critic
  - affected population
inquiry_lens:
  - what kind of evidence is needed
  - what inclusion criteria apply
  - what uncertainty remains
  - what would falsify the claim
compare_lens:
  - competing hypotheses
  - study designs
  - source tiers
  - confidence levels
evidence_to_collect:
  - primary sources
  - systematic reviews
  - data
  - methodology
  - limitations
safety_gate:
  - do not invent citations
  - require source attribution for factual claims
handoff_to_8_sections:
  - include evidence strength, limitations, and what remains unverified
```

## 14 Education / Training / Learning Design

Use for curriculum, lesson planning, training, assessment, coaching material, and learning outcomes.

```yaml
id: education_training
name: Education / Training / Learning Design
router_signals:
  - teach
  - lesson
  - curriculum
  - training
  - learner
  - assessment
  - course
fact_lens:
  - learner level
  - learning objective
  - prior knowledge
  - time available
  - assessment mode
  - accessibility needs
risk_lens:
  - mismatch to learner level
  - cognitive overload
  - unclear assessment
  - inaccessible format
  - unsafe or biased examples
multi_lens:
  - learner
  - instructor
  - evaluator
  - organization
  - accessibility reviewer
inquiry_lens:
  - what should learners be able to do
  - how will success be measured
  - what constraints exist
compare_lens:
  - explanation
  - practice
  - assessment
  - project-based path
  - remedial path
evidence_to_collect:
  - learning goals
  - learner profile
  - rubric
  - prior performance
safety_gate:
  - do not assume learner context; ask for level and goal when missing
handoff_to_8_sections:
  - include objective, learner assumptions, practice path, and assessment
```

## 15 Procurement / Vendor / Build-vs-Buy

Use for choosing tools, vendors, contractors, SaaS, infrastructure, outsourcing, and procurement tradeoffs.

```yaml
id: procurement_vendor
name: Procurement / Vendor / Build-vs-Buy
router_signals:
  - vendor
  - SaaS
  - procurement
  - contract
  - buy
  - outsource
  - tool selection
fact_lens:
  - requirements
  - budget
  - users
  - integration needs
  - security requirements
  - contract terms
  - switching cost
risk_lens:
  - vendor lock-in
  - hidden cost
  - data residency
  - security/compliance
  - support failure
  - migration risk
multi_lens:
  - buyer
  - end user
  - finance
  - legal
  - security
  - operations
compare_lens:
  - build
  - buy
  - hybrid
  - defer
  - compare by TCO, risk, fit, speed, reversibility
inquiry_lens:
  - what is mandatory vs optional
  - what data leaves the system
  - what exit path exists
  - what approval is required
evidence_to_collect:
  - requirements matrix
  - pricing
  - security docs
  - SLA
  - DPA
  - references
safety_gate:
  - attach legal/security/privacy overlays for contracts and data
handoff_to_8_sections:
  - include decision matrix, red flags, and exit criteria
```

## 16 Crisis / Reputation / Public Communication

Use for incidents, apologies, public statements, emergency communication, customer trust, media response, and stakeholder messaging.

```yaml
id: crisis_reputation
name: Crisis / Reputation / Public Communication
router_signals:
  - crisis
  - apology
  - incident
  - public statement
  - backlash
  - emergency
  - trust
fact_lens:
  - what happened
  - who is affected
  - what is confirmed
  - what is unknown
  - timeline
  - current actions
  - accountable owner
risk_lens:
  - misinformation
  - legal exposure
  - victim harm
  - trust collapse
  - premature promise
  - tone mismatch
multi_lens:
  - affected person
  - public
  - media
  - legal
  - frontline support
  - leadership
inquiry_lens:
  - what can be confirmed now
  - what should not be said
  - what action is already underway
  - who must approve
compare_lens:
  - hold statement
  - detailed update
  - apology
  - corrective action plan
  - private outreach first
evidence_to_collect:
  - incident facts
  - affected scope
  - timeline
  - actions taken
  - approval constraints
safety_gate:
  - do not speculate
  - acknowledge uncertainty
  - attach legal/security/privacy overlays if relevant
handoff_to_8_sections:
  - include confirmed facts, unknowns, empathy, action, and next update
```

Reference anchor: CDC CERC focuses on effective emergency risk communication and reaching people with lifesaving information during emergencies.

## 17 Policy / Public Sector / Nonprofit

Use for public policy, governance, community programs, nonprofit strategy, public-sector decisions, and stakeholder tradeoffs.

```yaml
id: policy_public_sector
name: Policy / Public Sector / Nonprofit
router_signals:
  - policy
  - public
  - nonprofit
  - community
  - regulation
  - governance
  - stakeholder
fact_lens:
  - public objective
  - affected groups
  - legal authority
  - budget
  - implementation capacity
  - equity impacts
  - measurement plan
risk_lens:
  - unintended consequences
  - inequity
  - political legitimacy
  - compliance failure
  - implementation gap
  - public trust damage
multi_lens:
  - beneficiaries
  - taxpayers/donors
  - frontline staff
  - regulators
  - critics
  - vulnerable groups
inquiry_lens:
  - what public value is sought
  - who may be harmed
  - what authority exists
  - how will outcomes be measured
compare_lens:
  - policy option A/B/C
  - pilot
  - status quo
  - sunset/review clause
evidence_to_collect:
  - statutes/policy docs
  - stakeholder input
  - budget
  - impact data
  - evaluation criteria
safety_gate:
  - attach legal/compliance overlay when authority or rights are involved
handoff_to_8_sections:
  - include affected groups, equity, feasibility, and review mechanism
```

## 18 Creative / Writing / Content

Use for speeches, emails, essays, scripts, brand copy, stories, documentation, and persuasive writing.

```yaml
id: creative_writing
name: Creative / Writing / Content
router_signals:
  - write
  - rewrite
  - email
  - speech
  - story
  - article
  - script
  - tone
fact_lens:
  - purpose
  - audience
  - desired emotional effect
  - facts that must be included
  - tone
  - constraints
  - forbidden claims
risk_lens:
  - misunderstood intent
  - unsupported claim
  - wrong tone
  - cultural sensitivity
  - confidentiality
  - copyright/plagiarism
multi_lens:
  - writer
  - reader
  - skeptic
  - editor
  - legal/brand reviewer
compare_lens:
  - direct version
  - persuasive version
  - diplomatic version
  - concise version
  - emotional version
inquiry_lens:
  - what should the reader do or feel
  - what must not be said
  - what facts are non-negotiable
evidence_to_collect:
  - source facts
  - style examples
  - audience profile
  - brand rules
safety_gate:
  - preserve factual accuracy
  - avoid imitating living authors or copyrighted text too closely
handoff_to_8_sections:
  - include intent, audience, tone, constraints, and final writing instructions
```

## 19 Personal Decision / Coaching / Life Planning

Use for non-clinical personal choices, career decisions, communication planning, habits, study plans, and life tradeoffs.

```yaml
id: personal_decision
name: Personal Decision / Coaching / Life Planning
router_signals:
  - career
  - relationship communication
  - habit
  - life decision
  - personal plan
  - motivation
fact_lens:
  - goal
  - current state
  - constraints
  - values
  - people affected
  - deadline
risk_lens:
  - emotional overreaction
  - avoidance
  - irreversible choice
  - social harm
  - unrealistic plan
  - mental health red flags
multi_lens:
  - current self
  - future self
  - affected person
  - supportive friend
  - skeptical advisor
compare_lens:
  - small step
  - direct conversation
  - delayed decision
  - seek support
  - stop/do nothing with review point
inquiry_lens:
  - what matters most
  - what is reversible
  - what support exists
  - what is the smallest next step
evidence_to_collect:
  - user-stated values
  - constraints
  - prior attempts
  - support network
safety_gate:
  - attach medical/mental health crisis guidance if self-harm, abuse, or emergency risk appears
handoff_to_8_sections:
  - include values, tradeoffs, next step, and support boundary
```

## 20 Data / Analytics / Experimentation

Use for metrics, dashboards, A/B tests, forecasts, causal questions, data quality, and experiment design.

```yaml
id: data_analytics
name: Data / Analytics / Experimentation
router_signals:
  - data
  - metric
  - dashboard
  - A/B test
  - experiment
  - forecast
  - analytics
  - causal
fact_lens:
  - question
  - metric definition
  - data source
  - sample
  - timeframe
  - segmentation
  - quality issues
  - causal assumptions
risk_lens:
  - bad metric definition
  - selection bias
  - confounding
  - underpowered test
  - data leakage
  - false certainty
multi_lens:
  - analyst
  - decision maker
  - data engineer
  - user/customer
  - skeptical statistician
compare_lens:
  - descriptive analysis
  - experiment
  - quasi-experiment
  - qualitative research
  - defer until data quality improves
inquiry_lens:
  - what decision will the analysis change
  - what metric matters
  - what bias may exist
  - what confidence is required
evidence_to_collect:
  - schema
  - query
  - metric definition
  - sample size
  - confidence interval
  - data lineage
safety_gate:
  - do not infer causality from correlation without design support
handoff_to_8_sections:
  - include metric definition, uncertainty, data quality, and decision threshold
```

---

## Overlay Templates

Overlays can be attached to any primary template.

### High-Stakes Legal Overlay

Attach when rights, liability, contracts, employment, immigration, criminal, regulated activity, or legal deadlines appear.

```yaml
must_collect:
  - jurisdiction
  - parties
  - timeline
  - documents
  - deadline
must_avoid:
  - definitive legal advice
  - jurisdiction-free conclusions
  - invented citations
must_output:
  - facts to confirm
  - legal-information framing
  - counsel-review trigger
```

### Medical Safety Overlay

Attach when health, symptoms, treatment, medication, self-harm, or emergency risk appears.

```yaml
must_collect:
  - red flags
  - urgency
  - clinician involvement
  - current treatment
must_avoid:
  - diagnosis
  - medication instruction beyond general safety
  - replacing clinician judgment
must_output:
  - emergency escalation if needed
  - uncertainty
  - clinician-review trigger
```

### Current-Information Overlay

Attach when the answer depends on changing facts.

```yaml
must_collect:
  - date
  - source
  - jurisdiction/market
  - last verified time
must_avoid:
  - stale assertions
  - pricing/rules/model capability claims without verification
must_output:
  - what was verified
  - what remains unverified
```

### Evidence-Strict Overlay

Attach when the user asks for accuracy, research, fact checking, legal/medical/financial topics, or external claims.

```yaml
must_collect:
  - primary sources where possible
  - source quality
  - confidence level
  - contradiction list
must_avoid:
  - unsupported claims
  - source laundering
  - treating examples as evidence
must_output:
  - evidence cards
  - assumptions
  - uncertainty
```

### Safety / Abuse Overlay

Attach when the request could enable harm, fraud, exploitation, intrusion, evasion, or dangerous operations.

```yaml
must_collect:
  - user intent
  - potential harm
  - defensive or legitimate context
must_avoid:
  - harmful instructions
  - stealth/evasion
  - exploitation details
must_output:
  - safe alternative
  - defensive guidance
  - refusal if needed
```

## Router Priority

When multiple templates match:

1. Apply safety overlays first.
2. Select one primary domain template.
3. Attach up to three secondary overlays.
4. If uncertain, use `general_judgment` plus `evidence_strict`.
5. If the request is high-stakes and missing core facts, prefer clarification or conditional output over confident recommendation.

## Implementation Notes

- Keep template definitions in English canonical keys.
- Translate visible output into the user's language.
- Do not feed this catalog text itself into the five pillars.
- The normalizer must strip examples, old outputs, and Astera's own 8-section description before pillar execution.
- `03 Fact Check` must include evidence cards or evidence gaps.
- `04 Risk Detection` must include risk evidence, including a low-risk scan record when no risk rule fires.
- The 8-section output should show domain-specific material under `今回の整理` / `Current Analysis`, not replace the stable section explanations.

## Source Anchors

- NIST AI RMF: AI risk management framework and Core functions Govern, Map, Measure, Manage.
- NIST Cybersecurity Framework: cybersecurity functions including Govern, Identify, Protect, Detect, Respond, Recover.
- OWASP Threat Modeling / STRIDE: structured security threat identification.
- Google SRE: SLOs and error budgets for reliability tradeoffs.
- ADR references: architecture decisions capture context, decision, alternatives, and consequences.
- PMI risk management: project risks should be identified, analyzed, and responded to.
- IRAC/CRAC legal writing references: legal analysis separates issue, rule, application/analysis, and conclusion.
- Cochrane PICO and CDC/GRADE references: clinical/evidence questions separate population, intervention, comparison, outcomes, and certainty.
- FDA benefit-risk references: decisions should communicate evidence, uncertainty, and reasoning.
- Harvard/HBS strategy references: Balanced Scorecard and Five Forces.
- Marketing STP references: segmentation, targeting, positioning.
- CDC CERC: crisis and emergency risk communication.

## Source Links

- NIST AI Risk Management Framework: https://www.nist.gov/itl/ai-risk-management-framework
- NIST AI RMF Core: https://airc.nist.gov/airmf-resources/airmf/5-sec-core/
- NIST Cybersecurity Framework 2.0: https://nvlpubs.nist.gov/nistpubs/CSWP/NIST.CSWP.29.pdf
- OWASP Threat Modeling: https://owasp.org/www-community/Threat_Modeling
- OWASP Threat Modeling Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html
- Google SRE Error Budget Policy: https://sre.google/workbook/error-budget-policy/
- Google SRE Service Level Objectives: https://sre.google/sre-book/service-level-objectives/
- Architecture Decision Records: https://adr.github.io/
- Microsoft ADR Guidance: https://learn.microsoft.com/en-us/azure/well-architected/architect-role/architecture-decision-record
- PMI Practical Risk Management: https://www.pmi.org/learning/library/practical-risk-management-approach-8248
- Columbia Law School IRAC/CRAC guide: https://www.law.columbia.edu/sites/default/files/2021-07/organizing_a_legal_discussion.pdf
- American Bar Association IRAC summary: https://www.americanbar.org/groups/law_students/resources/student-lawyer/student-essentials/legal-reasoning-its-all-about-irac/
- Cochrane PICO: https://www.cochranelibrary.com/about-pico
- CDC ACIP GRADE certainty of evidence: https://www.cdc.gov/acip-grade-handbook/hcp/chapter-7-grade-criteria-determining-certainty-of-evidence/index.html
- FDA Benefit-Risk Assessment: https://www.fda.gov/industry/prescription-drug-user-fee-amendments/enhancing-benefit-risk-assessment-regulatory-decision-making
- HBS Five Forces: https://www.isc.hbs.edu/strategy/business-strategy/Pages/the-five-forces.aspx
- Harvard Business Review Balanced Scorecard: https://hbr.org/1992/01/the-balanced-scorecard-measures-that-drive-performance-2
- Smart Insights STP model: https://www.smartinsights.com/digital-marketing-strategy/customer-segmentation-targeting/segmentation-targeting-and-positioning/
- CDC Crisis and Emergency Risk Communication: https://www.cdc.gov/cerc/php/about/index.html
