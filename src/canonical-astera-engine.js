'use strict';

const CanonicalAsteraEngineBase = require('./canonical-astera-engine-base');
const inputUnderstanding = require('./input-understanding');
const { enrichRequest } = require('./deterministic-task-decomposer');
const { readHumanState } = require('./hyperion-human-reader');
const { unique } = require('./judgment-materials-analyzer');

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

function blockedMaterial({ request, hardBlockers, lang }) {
  const unresolved = request.analysis_task_packet?.unresolved || [];
  const lines = lang === 'ja'
    ? [
        'Task Graphを安全に実行できないため、後続処理を停止しました。',
        `Hard Blocker: ${hardBlockers.join(' / ') || '-'}`,
        `Unresolved: ${unresolved.join(' / ') || '-'}`,
        '推測で補完せず、Task/Claim/Evidence処理へ進めていません。'
      ]
    : [
        'Task Graph execution is blocked by a hard invariant.',
        `Hard Blocker: ${hardBlockers.join(' / ') || '-'}`,
        `Unresolved: ${unresolved.join(' / ') || '-'}`,
        'No Task/Claim/Evidence processing was performed by guessing through the blocker.'
      ];
  return { text: lines.join('\n'), compact_text: lines.join(' / ') };
}

function preserveTextApiCompatibility(out) {
  if (!out?.material || typeof out.material.text !== 'string') return out;
  out.material.text = out.material.text
    .replaceAll('導出根拠\n', '導出根拠（判断基準）\n')
    .replaceAll('External Consumerへ渡す内容\n', '主役AIへ渡す内容 / 利用者へ渡す内容\n')
    .replaceAll('08 主役AI／利用者への再指示', '08 主役AIへの再指示 / 利用者への再指示')
    .replaceAll('Ranking・Recommendation・最終Decision', '順位付け・推奨・最終判断');
  if (typeof out.material.compact_text === 'string') {
    out.material.compact_text = out.material.compact_text.replaceAll(
      '08 主役AI／利用者への再指示',
      '08 主役AIへの再指示 / 利用者への再指示'
    );
  }
  return out;
}

class CanonicalAsteraEngine extends CanonicalAsteraEngineBase {
  prepareRequest(input = {}) {
    const understood = inputUnderstanding.analyzeRequest(input);
    return enrichRequest(understood, input);
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

    const purposeItems = (args.taskResults || []).map((result) =>
      `${result.task.id}[${result.task.action}] ${result.task.purpose || result.task.objective}`
    );
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

  async process(input = {}, tenant = { id: 'unknown' }, executionContext = {}) {
    const question = String(input.question || '').trim();
    const context = String(input.context || '').trim();
    const prepared = input.preparedRequest?.analysis_task_packet ? input.preparedRequest : null;
    const request = prepared
      ? (prepared.schema_version === 'astera.request-model.v3'
          ? prepared
          : enrichRequest(prepared, { question, context }))
      : this.prepareRequest({ question, context, language: input.language, locale: input.locale, output_language: input.output_language });

    request.human_reader = readHumanState(question, input.moodAnswers || {});

    if (question && request.analysis_task_packet?.tasks?.length) {
      const hardBlockers = normalizedHardBlockers(request);
      if (request.instruction_understanding?.execution_allowed === false || hardBlockers.length) {
        const requestedOutput = String(request.output_language || request.language || input.output_language || input.language || 'und');
        const renderLang = requestedOutput.split('-')[0] === 'ja' ? 'ja' : 'en';
        return {
          result: {
            type: 'task_graph_blocked',
            non_ai: true,
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
          material: blockedMaterial({ request, hardBlockers, lang: renderLang }),
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

      const clarification = clarificationQuestions(request, context);
      if (clarification.length) {
        const requestedOutput = String(request.output_language || request.language || input.output_language || input.language || 'und');
        const renderLang = requestedOutput.split('-')[0] === 'ja' ? 'ja' : 'en';
        return {
          result: {
            type: 'clarification_needed',
            non_ai: true,
            request_model: request,
            instruction_understanding: request.instruction_understanding || null,
            analysis_task_packet: request.analysis_task_packet,
            human_reader: request.human_reader,
            questions: clarification
          },
          material: this.clarify(clarification, renderLang),
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

    const out = await super.process({ ...input, preparedRequest: request }, tenant, executionContext);
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
    return preserveTextApiCompatibility(out);
  }
}

module.exports = CanonicalAsteraEngine;
