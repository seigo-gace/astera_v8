'use strict';

const CanonicalAsteraEngineBase = require('./canonical-astera-engine-base');
const inputUnderstanding = require('./input-understanding');
const { enrichRequest } = require('./deterministic-task-decomposer');
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
    const hardBlockers = unique([
      ...(packet.hard_blockers || []),
      ...(args.taskResults || []).flatMap((result) => result.task?.hard_blockers || [])
    ].map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') return item.code || item.type || JSON.stringify(item);
      return String(item || '');
    }));
    for (const key of judgment.order || []) {
      const section = judgment[key];
      if (!section?.decision_basis) continue;
      section.decision_basis = {
        ...section.decision_basis,
        instruction_understanding: instructionUnderstanding,
        hard_blockers: hardBlockers,
        blocking_conditions: unique([...(section.decision_basis.blocking_conditions || []), ...hardBlockers])
      };
    }
    return judgment;
  }

  async process(input = {}, tenant = { id: 'unknown' }) {
    const question = String(input.question || '').trim();
    const context = String(input.context || '').trim();
    const prepared = input.preparedRequest?.analysis_task_packet ? input.preparedRequest : null;
    const request = prepared
      ? (prepared.schema_version === 'astera.request-model.v3'
          ? prepared
          : enrichRequest(prepared, { question, context }))
      : this.prepareRequest({ question, context, language: input.language, locale: input.locale, output_language: input.output_language });

    if (question && request.analysis_task_packet?.tasks?.length) {
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
            questions: clarification
          },
          material: this.clarify(clarification, renderLang),
          prompt: '',
          runtime: {
            ai_used: false,
            llm_called: false,
            engine: 'v8_canonical_global_rules',
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

    const out = await super.process({ ...input, preparedRequest: request }, tenant);
    if (out?.result?.type === 'cognitive_map' && out.result.facts && Array.isArray(out.result.task_results)) {
      out.result.facts.evidence_gaps = out.result.task_results.flatMap((result) =>
        (result.facts?.evidence_gaps || []).map((item) => ({ task_id: result.task?.id || null, ...item }))
      );
    }
    return preserveTextApiCompatibility(out);
  }
}

module.exports = CanonicalAsteraEngine;
