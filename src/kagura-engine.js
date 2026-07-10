'use strict';

const WorkerPool = require('./worker-pool');
const Logger = require('./logger');
const LLMClient = require('./llm/llm-client');
const { routeDomainTemplates } = require('./domain-template-router');

class KaguraEngine {
  constructor({ poolSize = 4, logger = new Logger(), llm = new LLMClient() } = {}) {
    this.pool = new WorkerPool(poolSize);
    this.logger = logger;
    this.llm = llm;
  }

  async process(input = {}, tenant = { id: 'unknown' }) {
    const startedAt = Date.now();
    const question = String(input.question || '').trim();
    const context = String(input.context || '').trim();
    const outputLanguage = this.resolveOutputLanguage(input);
    const domain = routeDomainTemplates({ question, context });
    const analysisQuestion = domain.analysis_text || question;
    const displayQuestion = domain.normalized?.core_request || question;
    if (!question) {
      this.logger.write({ tenantId: tenant.id, type: 'clarification_needed', severity: 'warn', text: 'Question body is empty', payload: { reason: 'empty_question' } });
      const questions = ['質問本文を入力してください。'];
      return {
        result: {
          type: 'clarification_needed',
          questions
        },
        material: this.buildClarificationMaterial({ questions, outputLanguage }),
        prompt: ''
      };
    }

    const pre = await this.pool.exec('inquiry', { mode: 'preflight', question, moodAnswers: input.moodAnswers || {} });
    if (pre.clarification_needed) {
      const result = { type: 'clarification_needed', mood: pre.mood, human_reading: pre.human_reading, questions: pre.questions, rule: pre.rule };
      this.logger.write({ tenantId: tenant.id, type: 'clarification_needed', payload: { question, result } });
      return { result, material: this.buildClarificationMaterial({ questions: pre.questions, outputLanguage }), prompt: '' };
    }

    const [facts, risks, inquiry] = await Promise.all([
      this.pool.exec('fact', { question: analysisQuestion, domain }),
      this.pool.exec('risk', { question: analysisQuestion, domain }),
      this.pool.exec('inquiry', { mode: 'analysis', question: analysisQuestion, moodAnswers: input.moodAnswers || {}, domain })
    ]);

    const multi = await this.pool.exec('multi', { question: analysisQuestion, facts, risks, inquiry, domain });

    // Hyperion/PCE統合: 5本柱の上に、主案・悪手・反対案・第三案・人読み最適案を競わせる。
    const dialectic = await this.pool.exec('dialectic', {
      question: analysisQuestion,
      facts,
      risks,
      inquiry,
      multi,
      domain,
      mood: pre.mood,
      human: inquiry.human_reading || pre.human_reading || {}
    });

    const comparison = await this.pool.exec('compare', { question: analysisQuestion, mood: pre.mood, facts, risks, multi, inquiry, dialectic, domain });

    const hyperion = {
      engine: 'Hyperion-Core v2 / PCE-DCE',
      mode: 'max_firepower',
      human_reading: inquiry.human_reading || pre.human_reading || {},
      dialectic
    };

    const result = {
      type: 'cognitive_map',
      mode: 'hyperion_max_firepower',
      source_question: question,
      mood: pre.mood,
      facts,
      risks,
      multi,
      inquiry,
      domain,
      hyperion,
      comparison,
      judgment: this.buildJudgmentFrame({ question: displayQuestion, context, facts, risks, inquiry, dialectic, comparison, outputLanguage, domain })
    };
    const material = this.buildMaterialPacket(result.judgment);
    const prompt = this.buildPrompt(displayQuestion, result);
    const answer = await this.llm.generate(prompt, input.llm || {});

    this.logger.write({
      tenantId: tenant.id,
      type: 'process_completed',
      severity: answer.errors?.length ? 'warn' : 'info',
      text: `Cognitive map completed with ${answer.provider}`,
      payload: { question, result, llm: answer, duration_ms: Date.now() - startedAt }
    });

    return {
      result,
      material,
      prompt,
      answer: {
        provider: answer.provider,
        model: answer.model,
        chain_used: answer.chain_used,
        text: answer.text,
        errors: answer.errors || []
      }
    };
  }

  buildPrompt(question, map) {
    const candidates = map.hyperion?.dialectic?.candidates || [];
    const rankingText = candidates.map((c, i) => `${i + 1}. ${c.label}/${c.angle}: score=${c.score}, answer線距離=${c.answer_line_distance}, thesis=${c.thesis}`).join('\n');
    const human = map.hyperion?.human_reading || {};
    const judgment = map.judgment || {};
    const labels = this.judgmentLabelsFor('en');
    const judgmentText = [
      `${labels['01_purpose']}: ${judgment['01_purpose']?.text || '-'}`,
      `${labels['02_premise']}: ${(judgment['02_premise']?.items || []).join(' / ') || '-'}`,
      `${labels['03_facts']}: ${judgment['03_facts']?.summary || '-'}`,
      `${labels['04_crisis']}: ${judgment['04_crisis']?.summary || '-'}`,
      `${labels['05_opposition']}: ${judgment['05_opposition']?.summary || '-'}`,
      `${labels['06_comparison']}: ${judgment['06_comparison']?.summary || '-'}`,
      `${labels['07_recommendation']}: ${judgment['07_recommendation']?.summary || '-'}`,
      `${labels['08_reinstruction']}: ${(judgment['08_reinstruction']?.items || []).join(' / ') || '-'}`
    ].join('\n');
    return [
      '# Astera v8 Cognitive Preprocessing Prompt',
      '',
      '## Original User Request',
      question,
      '',
      '## Output Language Policy',
      `- Internal reasoning labels and evaluation criteria are canonical English.`,
      `- Final visible answer language: ${judgment.output_language || 'en'}.`,
      '- If the user explicitly requested a language, use that language; otherwise mirror the user request language.',
      '- Translate section titles and explanations naturally, but keep the 01-08 structure stable.',
      '',
      '## User State',
      `- mood: ${map.mood?.code} / ${map.mood?.label} / confidence=${map.mood?.confidence}`,
      `- human_mode: ${human.mode || 'unknown'} / load=${human.load ?? '-'}`,
      `- likely_needs: ${(human.likely_needs || []).join(' / ') || '-'}`,
      `- response_policy: ${(human.response_policy || []).join(' / ') || '-'}`,
      '',
      '## Auto Domain Template',
      `- primary: ${map.domain?.primary?.id || 'general_judgment'} / ${map.domain?.primary?.name || '-'}`,
      `- overlays: ${(map.domain?.overlays || []).map((overlay) => overlay.id).join(' / ') || '-'}`,
      `- user_selection_required: ${Boolean(map.domain?.user_selection_required)}`,
      '',
      '## Five-Pillar Cognitive Map',
      `1. Fact Check: confirmed candidates=${map.facts.confirmed.length} / unconfirmed=${map.facts.unconfirmed.length} / opinions=${map.facts.opinions.length}`,
      `2. Risk Detection: ${map.risks.risk_count} items / level=${map.risks.level}`,
      `3. Multi-Angle View: recommended=${map.multi.recommended}`,
      `4. Opposing View: healthy=${map.inquiry.problem_health.healthy} / ${map.inquiry.problem_health.reason}`,
      `5. Comparison Check: score=${map.comparison.score} / answer_line_distance=${map.comparison.answer_line_distance} / decision=${map.comparison.verdict.decision}`,
      '',
      '## Hyperion/PCE-DCE Candidate Ranking',
      rankingText || '- 候補なし',
      '',
      '## Selected Candidate',
      JSON.stringify(map.comparison.selected_candidate || null, null, 2),
      '',
      '## Judgment Frame',
      judgmentText,
      '',
      '## Detail JSON',
      JSON.stringify(map, null, 2),
      '',
      '## Final Answer Rules',
      '- Mark unverified information as unverified.',
      '- Keep risk evidence and opposing views as decision material.',
      '- Do not adopt the intentionally bad option; use it only to prevent failure.',
      '- If the user state is under pressure, ask fewer questions and make the next action explicit.',
      '- Compare the main option, opposing option, and third option before recommending the most practical path.'
    ].join('\n');
  }

  async destroy() {
    await this.pool.destroy();
  }

  buildJudgmentFrame({ question, context = '', facts = {}, risks = {}, inquiry = {}, dialectic = {}, comparison = {}, outputLanguage = 'en', domain = {} }) {
    const confirmed = Array.isArray(facts.confirmed) ? facts.confirmed : [];
    const unconfirmed = Array.isArray(facts.unconfirmed) ? facts.unconfirmed : [];
    const opinions = Array.isArray(facts.opinions) ? facts.opinions : [];
    const riskItems = Array.isArray(risks.risks) ? risks.risks : [];
    const evidence = this.buildEvidenceCards({ context, facts, question });
    const candidates = Array.isArray(dialectic.candidates) ? dialectic.candidates : [];
    const opposition = candidates.find((candidate) => candidate.id === 'opposition') || null;
    const selected = comparison.selected_candidate || dialectic.selected || null;
    const verdict = comparison.verdict || {};
    const missingQuestions = Array.isArray(inquiry.missing_questions) ? inquiry.missing_questions : [];
    const lang = outputLanguage === 'ja' ? 'ja' : 'en';
    const labels = this.judgmentLabelsFor(lang);
    const canonicalLabels = this.judgmentLabelsFor('en');
    const copy = this.judgmentCopyFor(lang);
    const riskEvidence = this.buildRiskEvidenceCards(riskItems, {
      level: risks.level || 'unknown',
      noMajorRisk: copy.defaults.noMajorRisk
    }, risks.domain_checks || []);

    const reinstruction = [
      copy.reinstruction.keepOrder,
      copy.reinstruction.noUnverifiedFacts,
      copy.reinstruction.keepRisks,
      copy.reinstruction.useDomainTemplate
    ];
    if (verdict.decision === 'hold_and_clarify' && missingQuestions.length) {
      reinstruction.push(...missingQuestions);
    } else {
      reinstruction.push(copy.reinstruction.confirmConditions);
    }

    return {
      format: 'astera_judgment_v2',
      canonical_language: 'en',
      output_language: lang,
      domain_template: {
        router: domain.router || 'auto_domain_template_v1',
        user_selection_required: false,
        primary: domain.primary || null,
        secondary: domain.secondary || [],
        overlays: domain.overlays || [],
        normalized: domain.normalized || null
      },
      order: ['01_purpose', '02_premise', '03_facts', '04_crisis', '05_opposition', '06_comparison', '07_recommendation', '08_reinstruction'],
      '01_purpose': {
        canonical_label: canonicalLabels['01_purpose'],
        label: labels['01_purpose'],
        one_line: copy.sections['01_purpose'].one_line,
        detail: copy.sections['01_purpose'].detail,
        text: question,
        pass_to_main_ai: copy.passItems['01_purpose'],
        strength: copy.sections['01_purpose'].strength
      },
      '02_premise': {
        canonical_label: canonicalLabels['02_premise'],
        label: labels['02_premise'],
        one_line: copy.sections['02_premise'].one_line,
        detail: copy.sections['02_premise'].detail,
        items: [
          inquiry.problem_health?.reason || '目的・対象・成功条件を確認する。',
          domain.primary?.name ? `auto_domain=${domain.primary.name}` : 'auto_domain=General Judgment / Default',
          (domain.overlays || []).length ? `overlays=${domain.overlays.map((overlay) => overlay.name).join(' / ')}` : 'overlaysなし。',
          domain.normalized?.removed_meta ? `meta_removed=${domain.normalized.removed_meta_blocks}` : 'meta_removed=0',
          context ? `context_length=${context.length}` : '追加contextなし。',
          ...(Array.isArray(inquiry.assumptions) ? inquiry.assumptions : [])
        ],
        pass_to_main_ai: copy.passItems['02_premise'],
        strength: copy.sections['02_premise'].strength
      },
      '03_facts': {
        canonical_label: canonicalLabels['03_facts'],
        label: labels['03_facts'],
        one_line: copy.sections['03_facts'].one_line,
        detail: copy.sections['03_facts'].detail,
        summary: evidence.length
          ? evidence.map((item) => `${item.id} ${item.source}: ${item.claim}`).join(' / ')
          : copy.defaults.noEvidence,
        evidence,
        evidence_to_collect: domain.primary?.evidence_to_collect || [],
        evidence_gaps: facts.evidence_gaps || [],
        confirmed,
        unconfirmed,
        opinions,
        pass_to_main_ai: copy.passItems['03_facts'],
        strength: copy.sections['03_facts'].strength
      },
      '04_crisis': {
        canonical_label: canonicalLabels['04_crisis'],
        label: labels['04_crisis'],
        one_line: copy.sections['04_crisis'].one_line,
        detail: copy.sections['04_crisis'].detail,
        summary: riskEvidence.length
          ? riskEvidence.map((item) => `${item.id} ${item.source}: ${item.claim}`).join(' / ')
          : `level=${risks.level || 'unknown'}: ${copy.defaults.noMajorRisk}`,
        evidence: riskEvidence,
        highest: risks.highest || null,
        risks: riskItems,
        domain_checks: risks.domain_checks || [],
        pass_to_main_ai: copy.passItems['04_crisis'],
        strength: copy.sections['04_crisis'].strength
      },
      '05_opposition': {
        canonical_label: canonicalLabels['05_opposition'],
        label: labels['05_opposition'],
        one_line: copy.sections['05_opposition'].one_line,
        detail: copy.sections['05_opposition'].detail,
        summary: opposition?.thesis || copy.defaults.noOpposition,
        candidate: opposition,
        contradictions: comparison.contradictions || [],
        bad_hand_lessons: dialectic.bad_hand_lessons || [],
        domain_perspectives: domain.primary?.multi_lens || [],
        pass_to_main_ai: copy.passItems['05_opposition'],
        strength: copy.sections['05_opposition'].strength
      },
      '06_comparison': {
        canonical_label: canonicalLabels['06_comparison'],
        label: labels['06_comparison'],
        one_line: copy.sections['06_comparison'].one_line,
        detail: copy.sections['06_comparison'].detail,
        summary: `score=${comparison.score ?? '-'} / answer_line_distance=${comparison.answer_line_distance ?? '-'} / decision=${verdict.decision || '-'}`,
        selected_candidate: selected,
        candidate_ranking: comparison.candidate_ranking || [],
        score_breakdown: comparison.score_breakdown || [],
        domain_compare_lens: domain.primary?.compare_lens || [],
        pass_to_main_ai: copy.passItems['06_comparison'],
        strength: copy.sections['06_comparison'].strength
      },
      '07_recommendation': {
        canonical_label: canonicalLabels['07_recommendation'],
        label: labels['07_recommendation'],
        one_line: copy.sections['07_recommendation'].one_line,
        detail: copy.sections['07_recommendation'].detail,
        summary: selected
          ? `${selected.label || selected.id}を${verdict.decision || 'recommend'}として扱う。`
          : copy.defaults.noRecommendation,
        decision: verdict.decision || null,
        angle: verdict.angle || selected?.angle || null,
        reason: verdict.reason || null,
        pass_to_main_ai: copy.passItems['07_recommendation'],
        strength: copy.sections['07_recommendation'].strength
      },
      '08_reinstruction': {
        canonical_label: canonicalLabels['08_reinstruction'],
        label: labels['08_reinstruction'],
        one_line: copy.sections['08_reinstruction'].one_line,
        detail: copy.sections['08_reinstruction'].detail,
        items: reinstruction,
        pass_to_main_ai: copy.passItems['08_reinstruction'],
        final_instruction: reinstruction,
        strength: copy.sections['08_reinstruction'].strength
      }
    };
  }

  buildMaterialText(judgment = {}) {
    const lang = judgment.output_language === 'ja' ? 'ja' : 'en';
    const copy = this.judgmentCopyFor(lang);
    return (judgment.order || []).map((key) => {
      const section = judgment[key] || {};
      const primary = this.primarySectionValue(key, section);
      const passItems = Array.isArray(section.pass_to_main_ai) ? section.pass_to_main_ai.filter(Boolean) : [];
      const evidenceItems = Array.isArray(section.evidence) ? section.evidence : [];
      const parts = [
        section.label || key,
        '',
        copy.headings.oneLine,
        '',
        section.one_line || '-',
        '',
        copy.headings.detail,
        '',
        section.detail || '-',
        '',
        copy.headings.passToMainAi,
        '',
        ...passItems.map((item) => `- ${this.compactLine(item, 260)}`),
        '',
        copy.headings.currentMaterial,
        '',
        this.compactLine(primary, 700)
      ];
      if (evidenceItems.length) {
        parts.push(
          '',
          copy.headings.evidence,
          '',
          ...evidenceItems.map((item) => `- ${item.id} ${item.source}: ${this.compactLine(item.claim, 260)}`)
        );
      }
      parts.push(
        '',
        copy.headings.strength,
        '',
        section.strength || '-'
      );
      return parts.join('\n');
    }).join('\n\n---\n\n');
  }

  buildCompactMaterialText(judgment = {}) {
    const rows = (judgment.order || []).map((key) => {
      const section = judgment[key] || {};
      return [section.label || key, this.primarySectionValue(key, section)];
    });
    return rows.map(([label, value]) => `${label}: ${this.compactLine(value)}`).join('\n');
  }

  primarySectionValue(key, section = {}) {
    if (key === '01_purpose') return section.text || '-';
    if (key === '02_premise') return (section.items || []).join(' / ') || '-';
    if (key === '03_facts') {
      const collect = Array.isArray(section.evidence_to_collect) && section.evidence_to_collect.length
        ? ` / evidence_to_collect=${section.evidence_to_collect.join(' / ')}`
        : '';
      const gaps = Array.isArray(section.evidence_gaps) && section.evidence_gaps.length
        ? ` / evidence_gaps=${section.evidence_gaps.map((gap) => gap.item).join(' / ')}`
        : '';
      return `${section.summary || '-'}${collect}${gaps}`;
    }
    if (key === '04_crisis') {
      const checks = Array.isArray(section.domain_checks) && section.domain_checks.length
        ? ` / domain_checks=${section.domain_checks.map((check) => check.check).join(' / ')}`
        : '';
      return `${section.summary || '-'}${checks}`;
    }
    if (key === '05_opposition') {
      const perspectives = Array.isArray(section.domain_perspectives) && section.domain_perspectives.length
        ? ` / domain_perspectives=${section.domain_perspectives.join(' / ')}`
        : '';
      return `${section.summary || '-'}${perspectives}`;
    }
    if (key === '06_comparison') {
      const lens = Array.isArray(section.domain_compare_lens) && section.domain_compare_lens.length
        ? ` / domain_compare=${section.domain_compare_lens.join(' / ')}`
        : '';
      return `${section.summary || '-'}${lens}`;
    }
    if (key === '08_reinstruction') return (section.items || []).join(' / ') || '-';
    return section.summary || '-';
  }

  compactLine(value, limit = 420) {
    const text = String(value || '-').replace(/\s+/g, ' ').trim();
    if (text.length <= limit) return text;
    return `${text.slice(0, Math.max(0, limit - 1))}…`;
  }

  buildEvidenceCards({ context = '', facts = {}, question = '' } = {}) {
    const cards = [];
    const seen = new Set();
    const add = ({ source = 'input', claim = '', confidence = 0.65 }) => {
      const clean = this.compactLine(claim, 180);
      if (!clean || clean === '-' || seen.has(`${source}:${clean}`)) return;
      seen.add(`${source}:${clean}`);
      cards.push({ id: `ev_${String(cards.length + 1).padStart(3, '0')}`, source, claim: clean, confidence });
    };

    let currentFile = 'context';
    const important = /(Docker|docker compose|TGserver|\/process|healthz|judgment|判断|context|text\/plain|outbox|SQLite|Stripe|API|V8|5段|8段|test|assert|STRUCTURE|README|server|logger|risk|fact)/i;
    for (const rawLine of String(context || '').split(/\r?\n/)) {
      const marker = rawLine.match(/^--- FILE: (.+) ---$/);
      if (marker) {
        currentFile = marker[1];
        continue;
      }
      const line = rawLine.trim();
      if (!line || line.length > 300 || /^[{}[\],;]+$/.test(line)) continue;
      if (!important.test(line)) continue;
      add({ source: currentFile, claim: line, confidence: 0.7 });
      if (cards.length >= 5) return cards;
    }

    const confirmed = Array.isArray(facts.confirmed) ? facts.confirmed : [];
    for (const item of confirmed) {
      add({ source: 'fact.confirmed', claim: item.text, confidence: item.confidence || 0.65 });
      if (cards.length >= 5) return cards;
    }

    if (!cards.length) add({ source: 'question', claim: question, confidence: 0.5 });
    return cards;
  }

  buildRiskEvidenceCards(riskItems = [], fallback = {}, domainChecks = []) {
    const items = riskItems.slice(0, 5).map((risk, index) => ({
      id: `risk_ev_${String(index + 1).padStart(3, '0')}`,
      source: `risk.rule.${risk.key || 'unknown'}`,
      claim: this.compactLine(risk.why || risk.key || 'risk detected', 180),
      confidence: 0.7,
      weight: risk.weight ?? null
    }));
    for (const check of domainChecks.slice(0, Math.max(0, 5 - items.length))) {
      items.push({
        id: `risk_ev_${String(items.length + 1).padStart(3, '0')}`,
        source: check.source || 'domain.risk_lens',
        claim: this.compactLine(check.check || check.why || 'domain risk check', 180),
        confidence: check.confidence || 0.6,
        weight: check.weight ?? null
      });
    }
    if (items.length) return items;
    return [{
      id: 'risk_ev_001',
      source: 'risk.scan',
      claim: this.compactLine(`level=${fallback.level || 'unknown'}: ${fallback.noMajorRisk || 'no major risk detected.'}`, 180),
      confidence: 0.55,
      weight: null
    }];
  }

  buildMaterialPacket(judgment = {}) {
    const text = this.buildMaterialText(judgment);
    return {
      mode: 'judgment_material',
      format: judgment.format || 'astera_judgment_v1',
      target: 'user_ai',
      raw_policy: 'do_not_pass_raw_by_default',
      text,
      compact_text: this.buildCompactMaterialText(judgment),
      judgment
    };
  }

  buildClarificationMaterial({ questions = [], outputLanguage = 'ja' } = {}) {
    const lang = outputLanguage === 'en' ? 'en' : 'ja';
    const lines = lang === 'en'
      ? [
          'Clarification Needed',
          '',
          'Astera needs a little more context before running the 5-pillar judgment.',
          '',
          'Questions',
          '',
          ...(questions.length ? questions : ['Please add the request body.']).map((q) => `- ${q}`)
        ]
      : [
          '確認が必要です',
          '',
          'Asteraが5本柱で判断する前に、もう少し前提が必要です。',
          '',
          '確認したいこと',
          '',
          ...(questions.length ? questions : ['質問本文を入力してください。']).map((q) => `- ${q}`)
        ];
    return {
      mode: 'clarification_material',
      format: 'astera_clarification_v1',
      target: 'user',
      raw_policy: 'safe_to_show',
      text: lines.join('\n'),
      compact_text: lines.join('\n')
    };
  }

  resolveOutputLanguage(input = {}) {
    const explicit = this.normalizeLanguage(input.outputLanguage || input.language || input.locale);
    if (explicit) return explicit;
    const source = `${input.question || ''}\n${input.context || ''}`;
    if (/[\u3040-\u30ff\u3400-\u9fff]/.test(source)) return 'ja';
    return 'en';
  }

  normalizeLanguage(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    if (/^(ja|jp|japanese|日本語|日本)$/.test(raw)) return 'ja';
    if (/^(en|eng|english|英語)$/.test(raw)) return 'en';
    return '';
  }

  judgmentLabelsFor(lang = 'en') {
    if (lang === 'ja') {
      return {
        '01_purpose': '01 本当の目的',
        '02_premise': '02 前提不足',
        '03_facts': '03 事実確認',
        '04_crisis': '04 危機察知',
        '05_opposition': '05 反対視点',
        '06_comparison': '06 比較案',
        '07_recommendation': '07 推奨判断',
        '08_reinstruction': '08 主役AIへの再指示'
      };
    }
    return {
      '01_purpose': '01 True Objective',
      '02_premise': '02 Missing Context',
      '03_facts': '03 Fact Check',
      '04_crisis': '04 Risk Detection',
      '05_opposition': '05 Opposing View',
      '06_comparison': '06 Alternative Options',
      '07_recommendation': '07 Recommendation',
      '08_reinstruction': '08 Re-instruction to Main AI'
    };
  }

  judgmentCopyFor(lang = 'en') {
    if (lang === 'ja') {
      return {
        headings: {
          oneLine: '一言説明',
          detail: '詳しい説明',
          passToMainAi: '主役AIへ渡す内容',
          evidence: 'エビデンス',
          currentMaterial: '今回の整理',
          strength: '回答がどう強くなるか'
        },
        sections: {
          '01_purpose': {
            one_line: '表面的な依頼の奥にある、本当に達成したいことを整理する。',
            detail: [
              'AIへの依頼は、表面の言葉だけを見るとズレることがあります。',
              'たとえば「文章を作って」ではなく、本当は「相手に納得してもらいたい」「支援してもらいたい」「誤解されずに伝えたい」など、奥にある目的が重要です。',
              '',
              'Asteraは、依頼文の裏にある本当の目的を先に整理します。',
              'これにより、主役AIがただ文章を整えるだけでなく、目的に合った回答を作れるようになります。'
            ].join('\n'),
            strength: '主役AIの回答が、表面的な答えではなく、目的に合った答えになりやすくなる。'
          },
          '02_premise': {
            one_line: '答えを作るために足りない条件や情報の抜けを探す。',
            detail: [
              'AIは、足りない前提があっても、それっぽい答えを作ってしまうことがあります。',
              '対象、予算、期限、使える人員、技術条件、運用方法、読者、目的などが抜けていると、きれいな文章でも実際には使えない回答になります。',
              '',
              'Asteraは、回答の前に不足している前提を洗い出します。',
              'これにより、主役AIに「何を前提に答えるべきか」を渡せます。'
            ].join('\n'),
            strength: '主役AIの回答が、思い込みや抜けのある答えになりにくくなる。'
          },
          '03_facts': {
            one_line: '事実・推測・未確認情報を分ける。',
            detail: [
              'AIの回答には、事実のように見える推測や、確認していない情報が混ざることがあります。',
              '特に、技術、法律、料金、最新情報、外部サービス、実装手順では、未確認のまま進めると危険です。',
              '',
              'Asteraは、回答や問いの中にある情報を、確認済みの事実・推測・未確認情報に分けます。',
              'これにより、主役AIが断定してよい部分と、確認が必要な部分を分けて扱えるようになります。'
            ].join('\n'),
            strength: '主役AIの回答が、嘘・思い込み・未確認情報を混ぜにくくなる。'
          },
          '04_crisis': {
            one_line: 'あとで失敗や信用低下につながる危険を先に探す。',
            detail: [
              '一見よさそうな回答でも、実行すると問題になる場合があります。',
              '炎上、誤解、法務リスク、信用低下、運用破綻、コスト増、セキュリティ不備、利用者トラブルなどです。',
              '',
              'Asteraは、回答を使う前に危険な点を探します。',
              '「このまま進めたらどこで詰まるか」「どこで誤解されるか」「何が信用を落とすか」を先に確認します。'
            ].join('\n'),
            strength: '主役AIの回答が、安全性や運用面を考えた、実際に使いやすい回答になりやすくなる。'
          },
          '05_opposition': {
            one_line: 'あえて逆側から見て、弱点や反論されそうな点を確認する。',
            detail: [
              'AIは、依頼者の方向性に合わせて、それっぽく肯定的な答えを作ることがあります。',
              'しかし、実際の判断では、反対意見、批判、別の立場からの見え方も重要です。',
              '',
              'Asteraは、あえて逆側から見ます。',
              '「反対する人なら何と言うか」「弱点はどこか」「突っ込まれる部分はどこか」を確認します。'
            ].join('\n'),
            strength: '主役AIの回答が、反論や批判に耐えやすい、厚みのある回答になりやすくなる。'
          },
          '06_comparison': {
            one_line: 'ひとつの答えだけでなく、別の選択肢も並べる。',
            detail: [
              'AIは、最初にそれっぽい答えを出すと、その案を中心に進めてしまうことがあります。',
              'しかし、実際には別の方法、段階的な方法、安い方法、安全な方法、早い方法など、比較しないと判断できません。',
              '',
              'Asteraは、ひとつの答えに固定せず、別案を並べます。',
              'どの案が何に強いのか、どんな条件ならどれを選ぶべきかを整理します。'
            ].join('\n'),
            strength: '主役AIの回答が、一択押し付けではなく、比較して選べる回答になりやすくなる。'
          },
          '07_recommendation': {
            one_line: '複数の視点をまとめ、現時点で一番筋の良い方向を示す。',
            detail: [
              '比較や危険確認だけでは、最終的にどう進めるべきか分かりにくいことがあります。',
              '情報を並べるだけでは判断になりません。',
              '',
              'Asteraは、本当の目的、前提、事実、危険、反対視点、比較案を踏まえて、現時点で一番筋の良い方向を整理します。',
              'ただし、絶対の正解として押し付けるのではなく、条件付きで「今ならこの方向がよい」と示します。'
            ].join('\n'),
            strength: '主役AIの回答が、情報の羅列ではなく、判断へ着地しやすくなる。'
          },
          '08_reinstruction': {
            one_line: '整理した材料をもとに、主役AIへ渡す指示を作る。',
            detail: [
              '判断材料を集めても、それを主役AIが使える形にしなければ意味がありません。',
              'ただ「もう一回考えて」と渡すだけでは、同じような回答になる可能性があります。',
              '',
              'Asteraは、整理した判断材料を、主役AIが回答を作り直せる指示に変換します。',
              '何を重視するか、何を避けるか、どの前提で答えるか、どんな形式で出すかまで整えます。'
            ].join('\n'),
            strength: '主役AIが判断材料をもとに回答を作り直せるため、より深く、安全で、目的に合った最終回答になりやすくなる。'
          }
        },
        defaults: {
          audience: '誰に向けた回答なのかを明確にする。',
          successConditions: '成功条件を明確にする。',
          missingQuestions: '確認すべき質問を整理する。',
          noAdditionalContext: '追加contextなし。',
          noEvidence: '直接渡せるエビデンスなし。追加contextまたは根拠が必要。',
          noMajorRisk: '主要危機なし。',
          noOpposition: '明示的な反対案なし。',
          noRecommendation: '推奨候補なし。'
        },
        passItems: {
          '01_purpose': [
            '本当に達成したい目的',
            '成功条件',
            '優先順位',
            '避けたい失敗',
            '誰に向けた回答なのか'
          ],
          '02_premise': [
            '足りない条件',
            '確認すべき質問',
            '回答前に置くべき前提',
            '制約条件',
            'まだ決まっていない情報'
          ],
          '03_facts': [
            '確認済みの事実',
            '推測として扱うべき内容',
            '未確認の情報',
            '調べるべき点',
            '断定を避けるべき箇所'
          ],
          '04_crisis': [
            '想定されるリスク',
            '問題が起きる条件',
            '避けるべき表現や手順',
            '先に対策すべき点',
            '代替案'
          ],
          '05_opposition': [
            '反論されそうな点',
            '弱い部分',
            '批判されやすい表現',
            '別の立場からの見え方',
            '補強すべき論点'
          ],
          '06_comparison': [
            '案A / 案B / 案C',
            'それぞれのメリット',
            'デメリット',
            '採用条件',
            '捨てるべき案',
            '段階的な進め方'
          ],
          '07_recommendation': [
            '推奨する方向',
            'その理由',
            '判断条件',
            '注意点',
            '次に取る一手',
            '採用しない案の理由'
          ],
          '08_reinstruction': [
            '再指示文',
            '重視する目的',
            '追加する前提',
            '避けるべき危険',
            '比較すべき案',
            '出力形式',
            '禁止事項',
            '最終回答の条件'
          ]
        },
        listLabels: {
          confirmedFacts: '確認済みの事実',
          treatAsInference: '推測として扱うべき内容',
          unverifiedInformation: '未確認の情報',
          pointsToVerify: '調べるべき点',
          avoidAssertions: '断定を避けるべき箇所',
          expectedRisks: '想定されるリスク',
          riskConditions: '問題が起きる条件',
          expressionsToAvoid: '避けるべき表現や手順',
          mitigations: '先に対策すべき点',
          alternatives: '代替案',
          likelyObjections: '反論されそうな点',
          weakPoints: '弱い部分',
          criticizedPhrases: '批判されやすい表現',
          otherStakeholders: '別の立場からの見え方',
          pointsToReinforce: '補強すべき論点',
          optionA: '案A',
          optionB: '案B',
          optionC: '案C',
          prosCons: 'それぞれのメリット・デメリット',
          adoptionConditions: '採用条件',
          discardedOptions: '捨てるべき案',
          recommendedDirection: '推奨する方向',
          reason: 'その理由',
          conditions: '判断条件',
          cautions: '注意点',
          nextAction: '次に取る一手'
        },
        reinstruction: {
          keepOrder: '01から08の順序を維持して回答する。',
          noUnverifiedFacts: '未確認情報は事実として断定しない。',
          keepRisks: '危機と反対意見を消さず、比較材料として残す。',
          useDomainTemplate: 'ユーザーに選択させず、Asteraが自動判定した用途テンプレートを前提にする。',
          confirmConditions: '推奨案を実行する前に、前提と成功条件を短く再確認する。'
        }
      };
    }

    return {
      headings: {
        oneLine: 'One-Line Explanation',
        detail: 'Detailed Explanation',
        passToMainAi: 'Material for the Main AI',
        evidence: 'Evidence',
        currentMaterial: 'Current Analysis',
        strength: 'How This Improves the Answer'
      },
      sections: {
        '01_purpose': {
          one_line: 'Clarify the real goal behind the surface request.',
          detail: 'Separate the visible request from the outcome the user truly wants, such as persuasion, support, accurate communication, or a concrete decision.',
          strength: 'The main AI is more likely to answer for the real objective rather than only polishing the surface request.'
        },
        '02_premise': {
          one_line: 'Find missing conditions and information needed to answer well.',
          detail: 'Identify missing audience, budget, deadline, technical conditions, operations, constraints, and success criteria before producing an answer.',
          strength: 'The main AI is less likely to rely on assumptions or produce a clean but unusable answer.'
        },
        '03_facts': {
          one_line: 'Separate facts, inferences, and unverified information.',
          detail: 'Mark what can be treated as evidence, what should remain an inference, and what needs verification before being asserted.',
          strength: 'The main AI is less likely to mix false, assumed, or unverified information into the answer.'
        },
        '04_crisis': {
          one_line: 'Detect risks that could later cause failure or loss of trust.',
          detail: 'Look for operational, legal, security, cost, reputation, misunderstanding, and user-impact risks before recommending action.',
          strength: 'The main AI is more likely to produce a practical answer that accounts for safety and operations.'
        },
        '05_opposition': {
          one_line: 'View the request from the opposing side to find weak points.',
          detail: 'Surface likely objections, criticism, fragile wording, and alternative stakeholder views so the final answer can be strengthened.',
          strength: 'The main AI can produce an answer that stands up better to objections and criticism.'
        },
        '06_comparison': {
          one_line: 'Compare multiple viable options instead of forcing one answer.',
          detail: 'Lay out options A, B, and C with benefits, drawbacks, adoption conditions, discarded options, and staged paths.',
          strength: 'The main AI can offer a choice-ready answer rather than a single unexamined recommendation.'
        },
        '07_recommendation': {
          one_line: 'Synthesize the views into the best current direction.',
          detail: 'Use objective, context, facts, risks, opposition, and comparison to recommend the strongest direction under current conditions.',
          strength: 'The main AI is more likely to land on a judgment instead of listing information.'
        },
        '08_reinstruction': {
          one_line: 'Turn the analysis into a new instruction for the main AI.',
          detail: 'Convert the materials into instructions covering priorities, assumptions, risks to avoid, options to compare, output format, prohibitions, and final answer conditions.',
          strength: 'The main AI can regenerate a deeper, safer, purpose-aligned final answer from the judgment material.'
        }
      },
      defaults: {
        audience: 'Clarify who the answer is for.',
        successConditions: 'Clarify success conditions.',
        missingQuestions: 'List questions that should be confirmed.',
        noAdditionalContext: 'No additional context.',
        noEvidence: 'No direct evidence available. Additional context or sources are needed.',
        noMajorRisk: 'no major risk detected.',
        noOpposition: 'No explicit opposing option.',
        noRecommendation: 'No recommendation candidate.'
      },
      passItems: {
        '01_purpose': [
          'The real objective to achieve',
          'Success conditions',
          'Priority order',
          'Failures to avoid',
          'Who the answer is for'
        ],
        '02_premise': [
          'Missing conditions',
          'Questions to confirm',
          'Assumptions to state before answering',
          'Constraints',
          'Information not decided yet'
        ],
        '03_facts': [
          'Confirmed facts',
          'Information to treat as inference',
          'Unverified information',
          'Points to investigate',
          'Claims that should not be asserted'
        ],
        '04_crisis': [
          'Expected risks',
          'Conditions that could trigger problems',
          'Expressions or steps to avoid',
          'Mitigations to handle first',
          'Alternative paths'
        ],
        '05_opposition': [
          'Likely objections',
          'Weak points',
          'Phrases likely to be criticized',
          'Views from other positions',
          'Points to reinforce'
        ],
        '06_comparison': [
          'Option A / Option B / Option C',
          'Benefits of each option',
          'Drawbacks',
          'Adoption conditions',
          'Options to discard',
          'Staged path'
        ],
        '07_recommendation': [
          'Recommended direction',
          'Reason',
          'Decision conditions',
          'Cautions',
          'Next action',
          'Why rejected options were not selected'
        ],
        '08_reinstruction': [
          'Re-instruction text',
          'Objective to prioritize',
          'Additional assumptions',
          'Risks to avoid',
          'Options to compare',
          'Output format',
          'Prohibitions',
          'Final answer conditions'
        ]
      },
      listLabels: {
        confirmedFacts: 'Confirmed facts',
        treatAsInference: 'Items to treat as inference',
        unverifiedInformation: 'Unverified information',
        pointsToVerify: 'Points to verify',
        avoidAssertions: 'Claims that should not be asserted',
        expectedRisks: 'Expected risks',
        riskConditions: 'Conditions that trigger problems',
        expressionsToAvoid: 'Expressions or steps to avoid',
        mitigations: 'Mitigations to handle first',
        alternatives: 'Alternative paths',
        likelyObjections: 'Likely objections',
        weakPoints: 'Weak points',
        criticizedPhrases: 'Phrases likely to be criticized',
        otherStakeholders: 'Views from other stakeholders',
        pointsToReinforce: 'Points to reinforce',
        optionA: 'Option A',
        optionB: 'Option B',
        optionC: 'Option C',
        prosCons: 'Benefits and drawbacks',
        adoptionConditions: 'Adoption conditions',
        discardedOptions: 'Options to discard',
        recommendedDirection: 'Recommended direction',
        reason: 'Reason',
        conditions: 'Decision conditions',
        cautions: 'Cautions',
        nextAction: 'Next action'
      },
      reinstruction: {
        keepOrder: 'Keep the answer in the 01-08 order.',
        noUnverifiedFacts: 'Do not state unverified information as fact.',
        keepRisks: 'Keep risks and opposing views as comparison material.',
        useDomainTemplate: 'Use the automatically selected domain template without asking the user to choose one.',
        confirmConditions: 'Briefly reconfirm assumptions and success conditions before executing the recommendation.'
      }
    };
  }
}

module.exports = KaguraEngine;
