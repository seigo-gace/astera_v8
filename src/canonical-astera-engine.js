'use strict';

const CanonicalAsteraEngineBase = require('./canonical-astera-engine-base');
const inputUnderstanding = require('./input-understanding');
const {
  enrichRequest,
  extractInstructionUnderstandingFields,
  extractPublicConstraintLines,
  isMaterialOnlyQuestion,
  isNaturalUserConsult
} = require('./deterministic-task-decomposer');
const { readHumanState } = require('./human-reader');
const { unique } = require('./judgment-materials-analyzer');
const { JapaneseParserMCPClient, needsJapaneseParser, isJapaneseParserConfigured } = require('./japanese-parser-mcp-client');
const { prepareJapaneseRequestViaMcp } = require('./canonical-v4-engine');

function clarificationQuestions(request = {}, context = '') {
  const packet = request.analysis_task_packet || {};
  const weakTargets = /^(?:どう|これ|それ|あれ|ここ|そこ|this|that|it|what|how)$/i;
  const unresolvedTarget = (packet.unresolved || []).some((item) => /:target$/.test(String(item)))
    || (packet.tasks || []).some((task) => !String(task.target || '').trim() || weakTargets.test(String(task.target || '').trim()));
  if (!unresolvedTarget) return [];
  const explicitContextTarget = /(?:対象|target)(?:は|:|=)\s*([^。！？!?\n]{2,160})/i.exec(String(context || ''));
  if (explicitContextTarget && explicitContextTarget[1]?.trim()) return [];
  const lang = String(request.language || '').split('-')[0];
  return [lang === 'ja'
    ? '判断・変更する対象が一意に確定していません。対象を指定してください。'
    : 'The target of the request is not uniquely resolved. Specify the target.'];
}

function normalizedHardBlockers(request = {}) {
  const packet = request.analysis_task_packet || {};
  return unique([
    ...(packet.hard_blockers || []),
    ...((request.instruction_understanding?.blocked_reasons) || [])
  ].map((item) => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') return item.code || item.type || JSON.stringify(item);
    return String(item || '');
  }));
}

function isStructuralHardBlocker(code) {
  const value = String(code || '');
  return value.startsWith('TASK_GRAPH_CYCLE');
}

function isParserMaterialTensionBlocker(code) {
  const value = String(code || '');
  return value === 'TIMEOUT'
    || value === 'PARSER_ACTION_GUARD_BLOCKED'
    || value === 'NO_EXECUTABLE_ACTION'
    || value === 'NEGATED_ACTION';
}

function shouldBlockBeforePipeline(question, request, hardBlockers) {
  const materialOnly = isMaterialOnlyQuestion(question);
  const tasks = request.analysis_task_packet?.tasks?.length || 0;
  const graphValid = request.analysis_task_packet?.task_graph_validation?.valid !== false;
  const structural = hardBlockers.filter(isStructuralHardBlocker);
  const nonStructural = hardBlockers.filter((code) => !isStructuralHardBlocker(code));
  const onlyMaterialTension = nonStructural.length > 0 && nonStructural.every(isParserMaterialTensionBlocker);
  if (tasks > 0 && graphValid && !structural.length && (materialOnly || onlyMaterialTension)) return false;
  if (structural.length) return true;
  if (nonStructural.length && !onlyMaterialTension) return true;
  if (request.instruction_understanding?.execution_allowed === false && !onlyMaterialTension && !materialOnly) return true;
  return false;
}

function packetMaterialSummary(request = {}, lang = 'ja') {
  const packet = request.analysis_task_packet || {};
  const lines = [];
  if ((packet.constraints || []).length) lines.push(`${lang === 'ja' ? 'Constraints' : 'Constraints'}: ${(packet.constraints || []).join(' / ')}`);
  if ((packet.deadlines || []).length) lines.push(`${lang === 'ja' ? 'Deadlines' : 'Deadlines'}: ${(packet.deadlines || []).join(' / ')}`);
  if ((packet.conditions || []).length) lines.push(`${lang === 'ja' ? 'Conditions' : 'Conditions'}: ${(packet.conditions || []).join(' / ')}`);
  if ((packet.exceptions || []).length) lines.push(`${lang === 'ja' ? 'Exceptions' : 'Exceptions'}: ${(packet.exceptions || []).join(' / ')}`);
  if ((packet.preserve || []).length) lines.push(`${lang === 'ja' ? 'Preserve' : 'Preserve'}: ${(packet.preserve || []).join(' / ')}`);
  if ((packet.prohibitions || []).length) lines.push(`${lang === 'ja' ? 'Prohibitions' : 'Prohibitions'}: ${(packet.prohibitions || []).join(' / ')}`);
  if ((packet.unresolved || []).length) lines.push(`${lang === 'ja' ? 'Unresolved' : 'Unresolved'}: ${(packet.unresolved || []).join(' / ')}`);
  return lines;
}

const MAIN8_SEPARATOR = '---';

function sanitizePublicMaterialText(text) {
  return String(text || '')
    .replace(/\b[0-9a-f]{64}\b/gi, '')
    .replace(/\bT\d+:[a-f0-9]{0,64}:[A-Z0-9_]+\b/gi, '')
    .replace(/claim=[0-9a-f]{64}/gi, 'claim=')
    .replace(/claim_id=[0-9a-f]{64}/gi, 'claim_id=')
    .replace(/undetermined_claim_ids:\s*[0-9a-f]{64}/gi, 'undetermined_claim_ids:')
    .replace(/\bHAS_STATE\b/g, '')
    .replace(/\bPARSER_ACTION_GUARD_BLOCKED\b/g, '')
    .replace(/\bNEGATED_ACTION\b/g, '')
    .replace(/\bPARSE_UNRESOLVED\b/g, '')
    .replace(/\bINSUFFICIENT_EVIDENCE\b/g, '')
    .replace(/\bMODALITY_NOT_VERIFIABLE\b/g, '')
    .replace(/\bFINAL_DECISION_PROHIBITED\b/g, '')
    .replace(/\bMATERIAL_ONLY_REQUIRED\b/g, '')
    .replace(/Lens=UNRESOLVED/g, '')
    .replace(/最終結論 HAS_STATE[^\n]*/g, '')
    .replace(/unresolved=T\d+:[^\n]+/g, '')
    .replace(/missing=T\d+:[^\n]+/g, '')
    .replace(/hard_constraint=[^\n]+判断材料[^\n]*/g, '')
    .replace(/hard_constraint=[^\n]+最終結論[^\n]*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildMaterialOnlyPublicText(judgment) {
  const blocks = [];
  for (const key of judgment.order || []) {
    const section = judgment[key];
    if (!section) continue;
    blocks.push(section.label);
    const lines = judgment._public_section_lines?.[key]
      || (section.items || []).map((item) => (String(item).startsWith('- ') ? item : `- ${item}`));
    blocks.push(...(lines.length ? lines : [`- ${section.summary || '-'}`]));
    blocks.push(MAIN8_SEPARATOR);
  }
  if (blocks.length && blocks[blocks.length - 1] === MAIN8_SEPARATOR) blocks.pop();
  return blocks.join('\n');
}

function blockedMaterial({ request, hardBlockers, lang }) {
  const unresolved = request.analysis_task_packet?.unresolved || [];
  const carry = packetMaterialSummary(request, lang);
  const lines = lang === 'ja'
    ? [
        'Task Graphを安全に実行できないため、後続処理を停止しました。',
        `Hard Blocker: ${hardBlockers.join(' / ') || '-'}`,
        `Unresolved: ${unresolved.join(' / ') || '-'}`,
        ...carry,
        '推測で補完せず、Task/Claim/Evidence処理へ進めていません。'
      ]
    : [
        'Task Graph execution is blocked by a hard invariant.',
        `Hard Blocker: ${hardBlockers.join(' / ') || '-'}`,
        `Unresolved: ${unresolved.join(' / ') || '-'}`,
        ...carry,
        'No Task/Claim/Evidence processing was performed by guessing through the blocker.'
      ];
  return { text: lines.join('\n'), compact_text: lines.join(' / ') };
}

class CanonicalAsteraEngine extends CanonicalAsteraEngineBase {
  constructor(options = {}) {
    super(options);
    if (options.japaneseParserClient === undefined) {
      this.japaneseParserClient = isJapaneseParserConfigured(options.japaneseParserOptions || {})
        ? new JapaneseParserMCPClient(options.japaneseParserOptions || {})
        : null;
    } else {
      this.japaneseParserClient = options.japaneseParserClient;
    }
  }

  async prepareRequest(input = {}) {
    const question = String(input.question || '');
    if (needsJapaneseParser(question)) {
      const prepared = await prepareJapaneseRequestViaMcp({
        ...input,
        deadline_ms: input.deadline_ms || input.parser_deadline_ms || Number(process.env.ASTERA_JAPANESE_PARSER_DEADLINE_MS || 8000)
      }, {
        client: this.japaneseParserClient,
        logger: this.logger
      });
      return enrichRequest(prepared, input);
    }
    const understood = inputUnderstanding.analyzeRequest(input);
    return enrichRequest(understood, input);
  }

  async destroy() {
    if (this.japaneseParserClient && typeof this.japaneseParserClient.destroy === 'function') {
      await this.japaneseParserClient.destroy();
    }
    await super.destroy();
  }

  frame(args) {
    const judgment = super.frame(args);
    const packet = args.request?.analysis_task_packet || {};
    const instructionUnderstanding = args.request?.instruction_understanding || null;
    const humanReader = args.request?.human_reader || null;
    const hardBlockers = unique([
      ...(packet.hard_blockers || []),
      ...(args.taskResults || []).flatMap((result) => result.task?.hard_blockers || [])
    ].map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') return item.code || item.type || JSON.stringify(item);
      return String(item || '');
    }));

    const questionText = String(args.request?.original_question || args.request?.normalized_question || '');
    const instruction = extractInstructionUnderstandingFields(questionText);
    const materialOnly = isMaterialOnlyQuestion(questionText)
      || (args.taskResults || []).some((result) => result.task?.material_only === true);
    const userGoal = packet.user_goal || instruction.user_goal
      || (args.taskResults || []).map((result) => result.task.user_goal || result.task.purpose).find((item) => item && !/判断材料へ構造化|UNRESOLVED/i.test(String(item)))
      || '-';
    const desiredEffect = packet.desired_effect || instruction.desired_effect || '未指定';
    const effectStatus = packet.effect_status || instruction.effect_status || '未指定';
    const purposeItems = [
      `目的: ${userGoal}`,
      `期待効果: ${desiredEffect}`,
      `効果判定基準: ${effectStatus}`
    ];
    if (judgment['01_purpose']) {
      judgment['01_purpose'].items = purposeItems;
      judgment['01_purpose'].summary = purposeItems.join(' / ') || '-';
      if (judgment['01_purpose'].decision_basis) {
        judgment['01_purpose'].decision_basis = {
          ...judgment['01_purpose'].decision_basis,
          derivation: 'Task DecompositionのPurposeを優先し、Action/Target/Source Spanと分離した目的を保持する。'
        };
      }
    }

    const publicConstraints = extractPublicConstraintLines(questionText);
    const outputPolicy = packet.output_policy || instruction.output_policy;

    if (materialOnly) {
      judgment.presentation_mode = 'PUBLIC_MATERIAL_ONLY';
      if (judgment['02_premise']) {
        judgment['02_premise'].items = publicConstraints;
        judgment['02_premise'].summary = publicConstraints.join(' / ') || '-';
      }
      judgment._public_section_lines = {
        '01_purpose': purposeItems.map((item) => `- ${item}`),
        '02_premise': publicConstraints.map((item) => `- ${item}`),
        '03_facts': ['- ユーザー入力の目的と制約は01・02に整理済み。ドメイン事実Claimの追加検証は不要。'],
        '04_crisis': ['- 入力記述のみでは確定できない実行リスクは、この段階では断定しない。'],
        '05_opposition': ['- 慎重視点: 予算・納期・既存操作の維持と改善効果のトレードオフを材料として整理する。'],
        '06_comparison': ['- 比較候補は入力されていない'],
        '07_evidence_status': [
          '- 外部Evidence検索: 不要（NOT_REQUIRED）',
          '- Claim確認: 入力整理のみ（ドメインClaim未指定）'
        ],
        '08_reinstruction': unique([
          '- 01の目的と02の制約を後続判断で保持する',
          outputPolicy?.natural_ja ? `- Output Policy: ${outputPolicy.natural_ja}` : null,
          '- Astera自身は採用・棄却・Ranking・Recommendation・最終Decisionを行わない。'
        ].filter(Boolean))
      };
    } else if (judgment['02_premise'] && publicConstraints.length) {
      judgment['02_premise'].items = unique([...(judgment['02_premise'].items || []), ...publicConstraints]);
      judgment['02_premise'].summary = judgment['02_premise'].items.join(' / ');
    }

    if (!materialOnly && judgment['08_reinstruction'] && outputPolicy?.natural_ja) {
      const reinstructionItems = unique([
        ...(judgment['08_reinstruction'].items || []),
        `Output Policy: ${outputPolicy.natural_ja}`
      ]);
      judgment['08_reinstruction'].items = reinstructionItems;
      judgment['08_reinstruction'].summary = reinstructionItems.join(' / ');
    }

    judgment.task_graph = {
      ...(judgment.task_graph || {}),
      branches: packet.branches || [],
      branch_groups: packet.branch_groups || [],
      reference_resolutions: packet.reference_resolutions || [],
      context_bindings: packet.context_bindings || [],
      unresolved: packet.unresolved || [],
      hard_blockers: hardBlockers,
      validation: packet.task_graph_validation || null
    };
    judgment.human_reader = humanReader
      ? {
          mode: humanReader.mode,
          signals: humanReader.signals,
          response_policy: humanReader.response_policy,
          drift_watch: humanReader.drift_watch,
          fact_mutation_allowed: false,
          evidence_mutation_allowed: false,
          constraint_mutation_allowed: false
        }
      : null;

    for (const key of judgment.order || []) {
      const section = judgment[key];
      if (!section?.decision_basis) continue;
      section.decision_basis = {
        ...section.decision_basis,
        instruction_understanding: instructionUnderstanding,
        hard_blockers: hardBlockers,
        blocking_conditions: unique([...(section.decision_basis.blocking_conditions || []), ...hardBlockers]),
        presentation_control: humanReader
          ? { mode: humanReader.mode, response_policy: humanReader.response_policy, fact_mutation_allowed: false }
          : null
      };
    }
    return judgment;
  }

  material(judgment) {
    const base = super.material(judgment);
    if (judgment.presentation_mode === 'PUBLIC_MATERIAL_ONLY') {
      const text = buildMaterialOnlyPublicText(judgment);
      const compact_text = (judgment.order || [])
        .map((key) => {
          const section = judgment[key];
          return section ? `${section.label}: ${section.summary || '-'}` : null;
        })
        .filter(Boolean)
        .join('\n');
      return { ...base, text, compact_text };
    }
    const text = sanitizePublicMaterialText(base.text);
    const compact_text = sanitizePublicMaterialText(base.compact_text);
    return { ...base, text, compact_text };
  }

  clarify(questions, lang, request = null) {
    const base = super.clarify(questions, lang);
    if (!request?.analysis_task_packet) return base;
    const carry = packetMaterialSummary(request, lang);
    if (!carry.length) return base;
    const suffix = carry.join('\n');
    return {
      ...base,
      text: `${base.text}\n${suffix}`,
      compact_text: `${base.compact_text} / ${carry.join(' / ')}`
    };
  }

  async process(input = {}, tenant = { id: 'unknown' }, executionContext = {}) {
    const question = String(input.question || '').trim();
    const context = String(input.context || '').trim();
    const request = await this.prepareRequest({
      question,
      context,
      language: input.language,
      locale: input.locale,
      output_language: input.output_language,
      deadline_ms: input.deadline_ms || input.parser_deadline_ms || Number(process.env.ASTERA_EFFECT_PARSER_DEADLINE_MS || 8000)
    });

    request.human_reader = readHumanState(question, input.moodAnswers || {});

    if (question && request.analysis_task_packet?.tasks?.length) {
      const hardBlockers = normalizedHardBlockers(request);
      if (shouldBlockBeforePipeline(question, request, hardBlockers)) {
        const requestedOutput = String(request.output_language || request.language || input.output_language || input.language || 'und');
        const renderLang = requestedOutput.split('-')[0] === 'ja' ? 'ja' : 'en';
        return {
          result: {
            type: 'task_graph_blocked',
            non_ai: true,
            no_normative_decision_generated: true,
            decision_authority: 'EXTERNAL_ONLY',
            request_model: request,
            instruction_understanding: request.instruction_understanding || null,
            analysis_task_packet: request.analysis_task_packet,
            hard_blockers: hardBlockers,
            unresolved: request.analysis_task_packet.unresolved || [],
            human_reader: request.human_reader,
            task_processing_started: false,
            evidence_processing_started: false
          },
          material: { ...blockedMaterial({ request, hardBlockers, lang: renderLang }), no_normative_decision_generated: true },
          prompt: '',
          runtime: {
            ai_used: false,
            llm_called: false,
            engine: 'v8_canonical_global_rules',
            blocked: true,
            hard_blockers: hardBlockers,
            human_reader_mode: request.human_reader.mode,
            input_language: request.language,
            input_script: request.script,
            requested_output_language: requestedOutput,
            localization: {
              requested_language: requestedOutput,
              rendered_language: renderLang,
              status: ['ja', 'en'].includes(requestedOutput.split('-')[0]) ? 'NATIVE_CANONICAL_RENDER' : 'EXTERNAL_LOCALIZATION_REQUIRED'
            }
          }
        };
      }

      const skipTargetClarification = (request.analysis_task_packet?.tasks?.length || 0) >= 1
        && (isMaterialOnlyQuestion(question) || isNaturalUserConsult(question));
      const clarification = skipTargetClarification
        ? []
        : clarificationQuestions(request, context);
      if (clarification.length) {
        const requestedOutput = String(request.output_language || request.language || input.output_language || input.language || 'und');
        const renderLang = requestedOutput.split('-')[0] === 'ja' ? 'ja' : 'en';
        return {
          result: {
            type: 'clarification_needed',
            non_ai: true,
            no_normative_decision_generated: true,
            decision_authority: 'EXTERNAL_ONLY',
            request_model: request,
            instruction_understanding: request.instruction_understanding || null,
            analysis_task_packet: request.analysis_task_packet,
            human_reader: request.human_reader,
            questions: clarification
          },
          material: { ...this.clarify(clarification, renderLang, request), no_normative_decision_generated: true },
          prompt: '',
          runtime: {
            ai_used: false,
            llm_called: false,
            engine: 'v8_canonical_global_rules',
            human_reader_mode: request.human_reader.mode,
            input_language: request.language,
            input_script: request.script,
            requested_output_language: requestedOutput,
            localization: {
              requested_language: requestedOutput,
              rendered_language: renderLang,
              status: ['ja', 'en'].includes(requestedOutput.split('-')[0]) ? 'NATIVE_CANONICAL_RENDER' : 'EXTERNAL_LOCALIZATION_REQUIRED'
            }
          }
        };
      }
    }

    const out = await super.process({
      question,
      context,
      language: input.language,
      locale: input.locale,
      output_language: input.output_language,
      moodAnswers: input.moodAnswers
    }, tenant, executionContext);
    if (out?.result?.type === 'cognitive_map') {
      out.result.human_reader = request.human_reader;
      if (out.result.facts && Array.isArray(out.result.task_results)) {
        out.result.facts.evidence_gaps = out.result.task_results.flatMap((result) =>
          (result.facts?.evidence_gaps || []).map((item) => ({ task_id: result.task?.id || null, ...item }))
        );
      }
      if (out.result.judgment) out.result.judgment.human_reader = out.result.judgment.human_reader || request.human_reader;
    }
    if (out?.runtime) out.runtime.human_reader_mode = request.human_reader.mode;
    return out;
  }
}

module.exports = CanonicalAsteraEngine;
