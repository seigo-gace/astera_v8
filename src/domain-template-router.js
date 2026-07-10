'use strict';

function rx(pattern) {
  return new RegExp(pattern, 'i');
}

const TEMPLATES = [
  {
    id: 'general_judgment',
    name: 'General Judgment / Default',
    signals: [rx('相談|判断|どうすれば|help|advice|decide|general')],
    fact_lens: ['goal', 'audience', 'success conditions', 'constraints', 'evidence vs assumptions'],
    risk_lens: ['misunderstanding', 'missing context', 'overclaiming', 'wrong format', 'actionability failure'],
    multi_lens: ['user', 'recipient', 'operator', 'critic', 'future maintainer'],
    inquiry_lens: ['desired outcome', 'success owner', 'failures to avoid'],
    compare_lens: ['fast answer', 'careful answer', 'staged answer'],
    evidence_to_collect: ['user-provided facts', 'constraints', 'examples'],
    safety_gate: ['attach a specialist overlay if a high-stakes domain appears']
  },
  {
    id: 'business_strategy',
    name: 'Business / Executive Strategy',
    signals: [rx('経営|事業|戦略|売上|利益|市場|価格|提携|ピボット|business|strategy|revenue|pricing|market')],
    fact_lens: ['business objective', 'revenue/margin/cash/runway', 'target segment', 'market timing', 'competitors', 'internal capability'],
    risk_lens: ['cash flow risk', 'strategic drift', 'execution capacity', 'trust damage', 'opportunity cost', 'irreversible commitment'],
    multi_lens: ['customer', 'competitor', 'investor', 'operator', 'frontline team', 'regulator'],
    inquiry_lens: ['success metric', 'budget/runway', 'downside limit', 'exit condition'],
    compare_lens: ['aggressive growth', 'defensive stabilization', 'staged experiment', 'ROI/risk/reversibility/speed'],
    evidence_to_collect: ['financial data', 'customer data', 'competitor evidence', 'market research', 'capacity plan'],
    safety_gate: ['attach finance or legal overlay if securities, debt, tax, or regulated claims appear']
  },
  {
    id: 'finance_capital',
    name: 'Finance / Investment / Capital Allocation',
    signals: [rx('投資|資金|予算|ROI|資本|融資|評価額|キャッシュ|finance|investment|budget|valuation|cash.?flow')],
    fact_lens: ['amount', 'time horizon', 'cash flow assumptions', 'cost/revenue drivers', 'risk tolerance', 'liquidity needs'],
    risk_lens: ['assumption error', 'liquidity risk', 'leverage risk', 'tax/regulatory risk', 'concentration risk', 'tail risk'],
    multi_lens: ['owner', 'investor', 'lender', 'CFO', 'tax/legal advisor', 'downside reviewer'],
    inquiry_lens: ['actual vs forecast', 'break scenario', 'capital that cannot be lost', 'approval needed'],
    compare_lens: ['base case', 'upside case', 'downside case', 'do nothing', 'staged commitment'],
    evidence_to_collect: ['historical numbers', 'forecast model', 'unit economics', 'assumption table', 'sensitivity analysis'],
    safety_gate: ['do not provide personalized financial, tax, securities, or investment advice']
  },
  {
    id: 'legal_compliance',
    name: 'Legal / Compliance / Contract',
    signals: [rx('法律|契約|訴訟|責任|規約|違法|著作権|商標|労務|個人情報保護法|law|legal|contract|liability|compliance|copyright|privacy')],
    fact_lens: ['jurisdiction', 'parties', 'timeline', 'documents', 'exact wording', 'evidence', 'deadlines'],
    risk_lens: ['unauthorized legal advice', 'wrong jurisdiction', 'missing facts', 'limitation periods', 'confidentiality', 'escalation risk'],
    multi_lens: ['user', 'opposing party', 'neutral decision maker', 'regulator', 'lawyer', 'business operator'],
    inquiry_lens: ['where it happened', 'documents available', 'deadlines', 'desired outcome', 'prior communications'],
    compare_lens: ['self-help information', 'collect facts first', 'negotiate', 'consult attorney', 'formal escalation'],
    evidence_to_collect: ['contracts', 'written communications', 'dates', 'jurisdiction', 'official legal sources'],
    safety_gate: ['do not give definitive legal conclusions', 'recommend qualified counsel for high-stakes decisions']
  },
  {
    id: 'medical_health',
    name: 'Medical / Health / Clinical',
    signals: [rx('医療|病気|症状|診断|治療|薬|医師|病院|健康|medical|health|symptom|diagnosis|treatment|medication')],
    fact_lens: ['patient/population', 'symptoms/duration', 'intervention', 'comparison', 'outcomes', 'evidence certainty'],
    risk_lens: ['emergency red flags', 'unsafe self-treatment', 'medication interaction', 'delayed care', 'low-certainty evidence'],
    multi_lens: ['patient', 'clinician', 'caregiver', 'public health', 'benefit-risk reviewer'],
    inquiry_lens: ['red flags', 'current treatment', 'outcome that matters', 'evidence quality'],
    compare_lens: ['urgent care', 'clinician visit', 'monitor with safety criteria', 'discuss options with clinician'],
    evidence_to_collect: ['PICO elements', 'guideline source', 'systematic review evidence', 'benefit-risk factors'],
    safety_gate: ['do not diagnose', 'emergency symptoms require urgent-care direction']
  },
  {
    id: 'marketing_growth',
    name: 'Marketing / Growth / Brand',
    signals: [rx('マーケ|広告|集客|訴求|LP|コピー|ブランド|CV|コンバージョン|marketing|campaign|copy|positioning|conversion|brand')],
    fact_lens: ['product', 'target segment', 'customer pain', 'offer', 'channel', 'price', 'proof', 'conversion goal'],
    risk_lens: ['misleading claims', 'brand mismatch', 'platform policy violation', 'privacy/consent risk', 'backlash', 'weak differentiation'],
    multi_lens: ['customer', 'buyer', 'skeptical prospect', 'competitor', 'brand owner', 'platform reviewer'],
    inquiry_lens: ['exact target', 'provable promise', 'desired action', 'channel constraints'],
    compare_lens: ['message A/B/C', 'channel options', 'short-term conversion vs long-term brand', 'broad reach vs high intent'],
    evidence_to_collect: ['customer research', 'conversion data', 'competitive claims', 'platform policies', 'testimonials/proof'],
    safety_gate: ['flag unverified claims', 'attach legal/compliance overlay for regulated products']
  },
  {
    id: 'product_ux',
    name: 'Product / UX / Roadmap',
    signals: [rx('プロダクト|機能|ロードマップ|UX|UI|オンボーディング|優先順位|product|feature|roadmap|prioritization|backlog')],
    fact_lens: ['user segment', 'job to be done', 'pain point', 'current behavior', 'success metric', 'usage data'],
    risk_lens: ['wrong feature', 'complexity creep', 'accessibility issue', 'adoption friction', 'support burden', 'metric gaming'],
    multi_lens: ['user', 'buyer', 'support', 'engineering', 'sales', 'accessibility reviewer'],
    inquiry_lens: ['proven user problem', 'metric to move', 'smallest test', 'reversibility'],
    compare_lens: ['reach/impact/confidence/effort', 'must-have vs nice-to-have', 'build vs buy vs defer'],
    evidence_to_collect: ['user interviews', 'analytics', 'support tickets', 'competitive examples', 'effort estimates'],
    safety_gate: ['do not treat stakeholder preference as user evidence']
  },
  {
    id: 'engineering_architecture',
    name: 'Engineering / Architecture / Implementation',
    signals: [rx('実装|設計|API|DB|データベース|移行|性能|スケール|アーキテクチャ|code|architecture|database|migration|implementation|performance')],
    fact_lens: ['current system', 'requirements', 'constraints', 'dependencies', 'runtime', 'data model', 'nonfunctional requirements'],
    risk_lens: ['data loss', 'downtime', 'security regression', 'operational complexity', 'vendor lock-in', 'irreversible migration'],
    multi_lens: ['developer', 'operator', 'user', 'security', 'future maintainer', 'cost owner'],
    inquiry_lens: ['compatibility', 'rollback', 'tests', 'hard constraints'],
    compare_lens: ['current path', 'incremental refactor', 'replacement', 'buy/service option', 'maintainability/risk/cost/reversibility'],
    evidence_to_collect: ['code references', 'logs', 'metrics', 'architecture docs', 'test output', 'ADR context'],
    safety_gate: ['require verification before claiming implementation status', 'preserve rollback and tests']
  },
  {
    id: 'cybersecurity_privacy',
    name: 'Cybersecurity / Privacy / Trust',
    signals: [rx('セキュリティ|認証|認可|秘密|token|トークン|漏洩|脆弱|暗号|privacy|security|auth|secret|breach|vulnerability')],
    fact_lens: ['assets', 'trust boundaries', 'data flows', 'actors', 'permissions', 'secrets', 'retention'],
    risk_lens: ['spoofing', 'tampering', 'repudiation', 'information disclosure', 'denial of service', 'elevation of privilege', 'privacy harm'],
    multi_lens: ['attacker', 'user', 'operator', 'compliance', 'incident responder', 'data subject'],
    inquiry_lens: ['asset protected', 'attacker capability', 'logs', 'reporting duty', 'feasible mitigation'],
    compare_lens: ['prevent', 'detect', 'respond', 'recover', 'accept risk with controls'],
    evidence_to_collect: ['architecture diagram', 'logs', 'access policy', 'data inventory', 'incident indicators', 'control evidence'],
    safety_gate: ['avoid exploit instructions', 'use defensive framing', 'rotate exposed secrets']
  },
  {
    id: 'ai_ml_governance',
    name: 'AI / ML / LLM Governance',
    signals: [rx('AI|LLM|モデル|プロンプト|評価|幻覚|hallucination|bias|guardrail|機械学習|生成AI')],
    fact_lens: ['use case', 'model/provider', 'input/output data', 'users affected', 'evaluation set', 'quality bar', 'deployment context'],
    risk_lens: ['hallucination', 'bias/discrimination', 'privacy leakage', 'unsafe automation', 'prompt injection', 'overreliance', 'audit gap'],
    multi_lens: ['end user', 'operator', 'affected subject', 'compliance', 'evaluator', 'adversary'],
    inquiry_lens: ['decision AI influences', 'possible harm', 'readiness evaluation', 'human review'],
    compare_lens: ['no AI', 'assistive AI', 'automated AI with review', 'automated AI without review'],
    evidence_to_collect: ['eval results', 'model docs', 'red-team findings', 'monitoring plan', 'data handling policy'],
    safety_gate: ['apply govern/map/measure/manage risk management', 'require evidence before claiming safety or accuracy']
  },
  {
    id: 'project_operations',
    name: 'Project / Program / Operations',
    signals: [rx('プロジェクト|工程|運用|納期|担当|進行|デリバリ|project|deadline|operations|delivery|staffing')],
    fact_lens: ['scope', 'deliverables', 'timeline', 'owners', 'dependencies', 'resources', 'acceptance criteria'],
    risk_lens: ['scope creep', 'dependency delay', 'unclear ownership', 'quality failure', 'capacity overload', 'missing rollback'],
    multi_lens: ['sponsor', 'project owner', 'implementer', 'reviewer', 'customer', 'operations'],
    inquiry_lens: ['in/out of scope', 'decision owner', 'critical path', 'contingency plan'],
    compare_lens: ['full scope', 'MVP', 'phased rollout', 'defer/cancel'],
    evidence_to_collect: ['plan', 'dependency list', 'resource estimate', 'risk register', 'acceptance tests'],
    safety_gate: ['require explicit owner and due date for recommended next action']
  },
  {
    id: 'hr_organization',
    name: 'HR / Organization / People',
    signals: [rx('採用|人事|評価|報酬|マネージャー|チーム|退職|労務|HR|hiring|employee|performance|compensation|manager')],
    fact_lens: ['role', 'people affected', 'documented facts', 'policy', 'timeline', 'performance evidence', 'jurisdiction'],
    risk_lens: ['unfairness', 'discrimination', 'retaliation', 'confidentiality', 'morale damage', 'employment law risk'],
    multi_lens: ['employee', 'manager', 'HR', 'team', 'legal/compliance', 'customer'],
    inquiry_lens: ['documented facts', 'policy', 'desired outcome', 'confidentiality boundary'],
    compare_lens: ['informal conversation', 'documented plan', 'HR escalation', 'legal review', 'monitoring'],
    evidence_to_collect: ['policy docs', 'written records', 'performance data', 'prior communications'],
    safety_gate: ['attach legal overlay for discipline, termination, discrimination, harassment, or employment law']
  },
  {
    id: 'sales_customer_success',
    name: 'Sales / Customer Success / Negotiation',
    signals: [rx('営業|商談|提案|交渉|更新|解約|顧客|クレーム|sales|proposal|negotiation|renewal|churn|customer')],
    fact_lens: ['buyer', 'decision process', 'pain', 'budget', 'timeline', 'alternatives', 'proof', 'contract constraints'],
    risk_lens: ['overpromising', 'bad-fit customer', 'discount trap', 'contract risk', 'churn risk', 'trust damage'],
    multi_lens: ['champion', 'economic buyer', 'end user', 'procurement', 'competitor', 'customer success'],
    inquiry_lens: ['buying trigger', 'who can say no', 'proof needed', 'acceptable concession'],
    compare_lens: ['value-based proposal', 'pilot', 'discount', 'walk away', 'executive escalation'],
    evidence_to_collect: ['CRM notes', 'customer objections', 'usage data', 'commercial terms', 'case studies'],
    safety_gate: ['flag commitments that product, legal, or support cannot honor']
  },
  {
    id: 'research_evidence',
    name: 'Research / Academic / Evidence Review',
    signals: [rx('研究|論文|調査|根拠|文献|仮説|引用|research|paper|study|evidence|literature|citation')],
    fact_lens: ['research question', 'population/context', 'method', 'data', 'claims', 'limitations', 'source quality'],
    risk_lens: ['cherry-picking', 'weak evidence', 'correlation vs causation', 'outdated source', 'citation fabrication', 'overgeneralization'],
    multi_lens: ['author', 'reviewer', 'practitioner', 'critic', 'affected population'],
    inquiry_lens: ['evidence needed', 'inclusion criteria', 'uncertainty', 'falsification condition'],
    compare_lens: ['competing hypotheses', 'study designs', 'source tiers', 'confidence levels'],
    evidence_to_collect: ['primary sources', 'systematic reviews', 'data', 'methodology', 'limitations'],
    safety_gate: ['do not invent citations', 'require source attribution for factual claims']
  },
  {
    id: 'education_training',
    name: 'Education / Training / Learning Design',
    signals: [rx('教育|研修|授業|教材|学習|カリキュラム|評価|teach|lesson|curriculum|training|learner|course')],
    fact_lens: ['learner level', 'learning objective', 'prior knowledge', 'time available', 'assessment mode', 'accessibility needs'],
    risk_lens: ['level mismatch', 'cognitive overload', 'unclear assessment', 'inaccessible format', 'biased examples'],
    multi_lens: ['learner', 'instructor', 'evaluator', 'organization', 'accessibility reviewer'],
    inquiry_lens: ['learner outcome', 'measurement', 'constraints'],
    compare_lens: ['explanation', 'practice', 'assessment', 'project-based path', 'remedial path'],
    evidence_to_collect: ['learning goals', 'learner profile', 'rubric', 'prior performance'],
    safety_gate: ['ask for level and goal when missing']
  },
  {
    id: 'procurement_vendor',
    name: 'Procurement / Vendor / Build-vs-Buy',
    signals: [rx('ベンダー|SaaS|調達|外注|委託|ツール選定|build.?vs.?buy|vendor|procurement|outsource')],
    fact_lens: ['requirements', 'budget', 'users', 'integration needs', 'security requirements', 'contract terms', 'switching cost'],
    risk_lens: ['vendor lock-in', 'hidden cost', 'data residency', 'security/compliance', 'support failure', 'migration risk'],
    multi_lens: ['buyer', 'end user', 'finance', 'legal', 'security', 'operations'],
    inquiry_lens: ['mandatory vs optional', 'data leaving system', 'exit path', 'approval required'],
    compare_lens: ['build', 'buy', 'hybrid', 'defer', 'TCO/risk/fit/speed/reversibility'],
    evidence_to_collect: ['requirements matrix', 'pricing', 'security docs', 'SLA', 'DPA', 'references'],
    safety_gate: ['attach legal/security/privacy overlays for contracts and data']
  },
  {
    id: 'crisis_reputation',
    name: 'Crisis / Reputation / Public Communication',
    signals: [rx('炎上|謝罪|危機|事故|声明|広報|緊急|評判|crisis|apology|incident|public statement|backlash|reputation')],
    fact_lens: ['what happened', 'who is affected', 'confirmed facts', 'unknowns', 'timeline', 'current actions', 'owner'],
    risk_lens: ['misinformation', 'legal exposure', 'victim harm', 'trust collapse', 'premature promise', 'tone mismatch'],
    multi_lens: ['affected person', 'public', 'media', 'legal', 'frontline support', 'leadership'],
    inquiry_lens: ['confirmed now', 'what not to say', 'action underway', 'approval owner'],
    compare_lens: ['hold statement', 'detailed update', 'apology', 'corrective plan', 'private outreach first'],
    evidence_to_collect: ['incident facts', 'affected scope', 'timeline', 'actions taken', 'approval constraints'],
    safety_gate: ['do not speculate', 'acknowledge uncertainty', 'attach legal/security/privacy overlays if relevant']
  },
  {
    id: 'policy_public_sector',
    name: 'Policy / Public Sector / Nonprofit',
    signals: [rx('政策|公共|行政|NPO|非営利|規制|ガバナンス|policy|public|nonprofit|community|regulation')],
    fact_lens: ['public objective', 'affected groups', 'legal authority', 'budget', 'implementation capacity', 'equity impacts'],
    risk_lens: ['unintended consequences', 'inequity', 'legitimacy risk', 'compliance failure', 'implementation gap', 'public trust damage'],
    multi_lens: ['beneficiaries', 'taxpayers/donors', 'frontline staff', 'regulators', 'critics', 'vulnerable groups'],
    inquiry_lens: ['public value', 'who may be harmed', 'authority', 'outcome measurement'],
    compare_lens: ['policy option A/B/C', 'pilot', 'status quo', 'sunset/review clause'],
    evidence_to_collect: ['statutes/policy docs', 'stakeholder input', 'budget', 'impact data', 'evaluation criteria'],
    safety_gate: ['attach legal/compliance overlay when authority or rights are involved']
  },
  {
    id: 'creative_writing',
    name: 'Creative / Writing / Content',
    signals: [rx('文章|メール|スピーチ|記事|脚本|トーン|書いて|rewrite|write|email|speech|story|article|script|tone')],
    fact_lens: ['purpose', 'audience', 'desired effect', 'required facts', 'tone', 'constraints', 'forbidden claims'],
    risk_lens: ['misunderstood intent', 'unsupported claim', 'wrong tone', 'cultural sensitivity', 'confidentiality', 'copyright/plagiarism'],
    multi_lens: ['writer', 'reader', 'skeptic', 'editor', 'legal/brand reviewer'],
    inquiry_lens: ['reader action/feeling', 'what must not be said', 'non-negotiable facts'],
    compare_lens: ['direct version', 'persuasive version', 'diplomatic version', 'concise version', 'emotional version'],
    evidence_to_collect: ['source facts', 'style examples', 'audience profile', 'brand rules'],
    safety_gate: ['preserve factual accuracy', 'avoid close imitation of copyrighted style']
  },
  {
    id: 'personal_decision',
    name: 'Personal Decision / Coaching / Life Planning',
    signals: [rx('キャリア|人生|習慣|悩み|進路|転職|personal|career|habit|life decision|motivation')],
    fact_lens: ['goal', 'current state', 'constraints', 'values', 'people affected', 'deadline'],
    risk_lens: ['emotional overreaction', 'avoidance', 'irreversible choice', 'social harm', 'unrealistic plan', 'mental health red flags'],
    multi_lens: ['current self', 'future self', 'affected person', 'supportive friend', 'skeptical advisor'],
    inquiry_lens: ['what matters most', 'reversibility', 'support available', 'smallest next step'],
    compare_lens: ['small step', 'direct conversation', 'delayed decision', 'seek support', 'monitoring'],
    evidence_to_collect: ['user-stated values', 'constraints', 'prior attempts', 'support network'],
    safety_gate: ['attach medical/mental health crisis guidance if self-harm, abuse, or emergency risk appears']
  },
  {
    id: 'data_analytics',
    name: 'Data / Analytics / Experimentation',
    signals: [rx('データ|分析|指標|KPI|ABテスト|実験|予測|因果|data|metric|dashboard|experiment|forecast|analytics|causal')],
    fact_lens: ['question', 'metric definition', 'data source', 'sample', 'timeframe', 'segmentation', 'quality issues', 'causal assumptions'],
    risk_lens: ['bad metric definition', 'selection bias', 'confounding', 'underpowered test', 'data leakage', 'false certainty'],
    multi_lens: ['analyst', 'decision maker', 'data engineer', 'user/customer', 'skeptical statistician'],
    inquiry_lens: ['decision changed by analysis', 'metric that matters', 'bias risk', 'confidence required'],
    compare_lens: ['descriptive analysis', 'experiment', 'quasi-experiment', 'qualitative research', 'improve data quality first'],
    evidence_to_collect: ['schema', 'query', 'metric definition', 'sample size', 'confidence interval', 'data lineage'],
    safety_gate: ['do not infer causality from correlation without design support']
  }
];

const OVERLAYS = [
  {
    id: 'high_stakes_legal',
    name: 'High-Stakes Legal Overlay',
    signals: [rx('訴訟|解雇|逮捕|違法|損害賠償|契約解除|harassment|termination|lawsuit|criminal|liability')],
    risk_lens: ['rights/liability risk', 'jurisdiction-specific conclusion risk', 'deadline risk'],
    evidence_to_collect: ['jurisdiction', 'parties', 'timeline', 'documents', 'deadline'],
    safety_gate: ['avoid definitive legal advice', 'trigger qualified counsel review']
  },
  {
    id: 'medical_safety',
    name: 'Medical Safety Overlay',
    signals: [rx('救急|自殺|自傷|胸痛|呼吸|意識|大量出血|emergency|suicide|self.?harm|chest pain')],
    risk_lens: ['emergency harm', 'delayed care', 'unsafe self-treatment'],
    evidence_to_collect: ['red flags', 'urgency', 'clinician involvement', 'current treatment'],
    safety_gate: ['prioritize emergency escalation when red flags appear']
  },
  {
    id: 'current_information',
    name: 'Current-Information Overlay',
    signals: [rx('最新|現在|今日|昨日|今年|料金|価格|法改正|CEO|president|current|latest|today|price|pricing|law change')],
    risk_lens: ['stale information', 'changed rules/prices/status', 'unverified public fact'],
    evidence_to_collect: ['date', 'source', 'jurisdiction/market', 'last verified time'],
    safety_gate: ['verify current information before asserting']
  },
  {
    id: 'evidence_strict',
    name: 'Evidence-Strict Overlay',
    signals: [rx('根拠|エビデンス|証拠|正確|検証|調査|fact.?check|evidence|source|verify|accurate')],
    risk_lens: ['unsupported claim', 'weak source', 'contradiction', 'source laundering'],
    evidence_to_collect: ['primary sources', 'source quality', 'confidence level', 'contradictions'],
    safety_gate: ['output evidence cards or evidence gaps']
  },
  {
    id: 'safety_abuse',
    name: 'Safety / Abuse Overlay',
    signals: [rx('ハッキング|侵入|詐欺|偽造|回避|マルウェア|攻撃|hack|malware|phishing|exploit|bypass|fraud')],
    risk_lens: ['harm enablement', 'evasion', 'exploitation', 'fraud'],
    evidence_to_collect: ['legitimate context', 'potential harm', 'defensive goal'],
    safety_gate: ['avoid harmful instructions', 'offer defensive alternative']
  }
];

function cleanLine(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function removeAsteraTemplateBlock(text) {
  const source = String(text || '');
  const marker = source.search(/(^|\n)\s*01\s+(本当の目的|True Objective)\s*(\n|$)/i);
  if (marker < 0) return { text: source.trim(), removed: 0 };
  const after = source.slice(marker);
  const looksLikeAsteraTemplate = /08\s+(主役AIへの再指示|Re-instruction to Main AI)/i.test(after)
    && /(回答がどう強くなるか|How This Improves the Answer)/i.test(after);
  if (!looksLikeAsteraTemplate) return { text: source.trim(), removed: 0 };
  const kept = source.slice(0, marker).trim();
  return { text: kept, removed: 1 };
}

function normalizeInput({ question = '', context = '' } = {}) {
  const q = removeAsteraTemplateBlock(question);
  const c = removeAsteraTemplateBlock(context);
  const cleanQuestion = q.text || String(question || '').trim();
  const cleanContext = c.text;
  const core = cleanQuestion || cleanContext || String(question || context || '').trim();
  const analysisText = [core, cleanContext && cleanContext !== core ? `[context]\n${cleanContext}` : '']
    .filter(Boolean)
    .join('\n\n')
    .trim();
  return {
    core_request: core,
    analysis_text: analysisText,
    context_length: String(context || '').length,
    normalized_context_length: cleanContext.length,
    removed_meta_blocks: q.removed + c.removed,
    removed_meta: Boolean(q.removed + c.removed)
  };
}

function scoreTemplate(template, text) {
  const matched = [];
  for (const signal of template.signals || []) {
    const hit = text.match(signal);
    if (hit) matched.push(hit[0]);
  }
  return {
    template,
    score: matched.length,
    matched_signals: [...new Set(matched.map((x) => cleanLine(x).toLowerCase()))]
  };
}

function applyOverlayScores(text) {
  return OVERLAYS
    .map((overlay) => scoreTemplate(overlay, text))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => ({
      id: item.template.id,
      name: item.template.name,
      score: item.score,
      matched_signals: item.matched_signals,
      risk_lens: item.template.risk_lens,
      evidence_to_collect: item.template.evidence_to_collect,
      safety_gate: item.template.safety_gate
    }));
}

function publicTemplate(template, score = 0, matched = []) {
  return {
    id: template.id,
    name: template.name,
    score,
    matched_signals: matched,
    fact_lens: template.fact_lens,
    risk_lens: template.risk_lens,
    multi_lens: template.multi_lens,
    inquiry_lens: template.inquiry_lens,
    compare_lens: template.compare_lens,
    evidence_to_collect: template.evidence_to_collect,
    safety_gate: template.safety_gate
  };
}

function buildLensText(primary, overlays) {
  const lines = [
    '[domain_template_lens]',
    `primary=${primary.id} (${primary.name})`,
    `fact_lens=${primary.fact_lens.join(' / ')}`,
    `risk_lens=${primary.risk_lens.join(' / ')}`,
    `multi_lens=${primary.multi_lens.join(' / ')}`,
    `inquiry_lens=${primary.inquiry_lens.join(' / ')}`,
    `compare_lens=${primary.compare_lens.join(' / ')}`,
    `evidence_to_collect=${primary.evidence_to_collect.join(' / ')}`,
    `safety_gate=${primary.safety_gate.join(' / ')}`
  ];
  if (overlays.length) {
    lines.push(`overlays=${overlays.map((overlay) => overlay.id).join(' / ')}`);
    for (const overlay of overlays) {
      lines.push(`overlay.${overlay.id}.risk_lens=${overlay.risk_lens.join(' / ')}`);
      lines.push(`overlay.${overlay.id}.evidence_to_collect=${overlay.evidence_to_collect.join(' / ')}`);
      lines.push(`overlay.${overlay.id}.safety_gate=${overlay.safety_gate.join(' / ')}`);
    }
  }
  return lines.join('\n');
}

function routeDomainTemplates({ question = '', context = '' } = {}) {
  const normalized = normalizeInput({ question, context });
  const routeText = `${normalized.core_request}\n${normalized.analysis_text}`.trim();
  const scored = TEMPLATES
    .filter((template) => template.id !== 'general_judgment')
    .map((template) => scoreTemplate(template, routeText))
    .sort((a, b) => b.score - a.score);
  const best = scored.find((item) => item.score > 0);
  const primary = best
    ? publicTemplate(best.template, best.score, best.matched_signals)
    : publicTemplate(TEMPLATES[0], 0, []);
  const secondary = scored
    .filter((item) => item.score > 0 && item.template.id !== primary.id)
    .slice(0, 3)
    .map((item) => publicTemplate(item.template, item.score, item.matched_signals));
  const overlays = applyOverlayScores(routeText).slice(0, 4);
  return {
    router: 'auto_domain_template_v1',
    user_selection_required: false,
    primary,
    secondary,
    overlays,
    normalized,
    lens_text: buildLensText(primary, overlays),
    analysis_text: normalized.analysis_text
  };
}

module.exports = {
  routeDomainTemplates,
  TEMPLATES,
  OVERLAYS
};
