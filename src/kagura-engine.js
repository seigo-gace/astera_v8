'use strict';

const WorkerPool = require('./worker-pool');
const Logger = require('./logger');
const LLMClient = require('./llm/llm-client');

class KaguraEngine {
  constructor({ poolSize = 4, logger = new Logger(), llm = new LLMClient() } = {}) {
    this.pool = new WorkerPool(poolSize);
    this.logger = logger;
    this.llm = llm;
  }

  async process(input = {}, tenant = { id: 'unknown' }) {
    const question = String(input.question || '').trim();
    if (!question) {
      return {
        result: {
          type: 'clarification_needed',
          questions: ['質問本文を入力してください。']
        },
        prompt: ''
      };
    }

    const pre = await this.pool.exec('inquiry', { mode: 'preflight', question, moodAnswers: input.moodAnswers || {} });
    if (pre.clarification_needed) {
      const result = { type: 'clarification_needed', mood: pre.mood, human_reading: pre.human_reading, questions: pre.questions, rule: pre.rule };
      this.logger.write({ tenantId: tenant.id, type: 'clarification_needed', payload: { question, result } });
      return { result, prompt: '' };
    }

    const [facts, risks, inquiry] = await Promise.all([
      this.pool.exec('fact', { question }),
      this.pool.exec('risk', { question }),
      this.pool.exec('inquiry', { mode: 'analysis', question, moodAnswers: input.moodAnswers || {} })
    ]);

    const multi = await this.pool.exec('multi', { question, facts, risks, inquiry });

    // Hyperion/PCE統合: 5本柱の上に、主案・悪手・反対案・第三案・人読み最適案を競わせる。
    const dialectic = await this.pool.exec('dialectic', {
      question,
      facts,
      risks,
      inquiry,
      multi,
      mood: pre.mood,
      human: inquiry.human_reading || pre.human_reading || {}
    });

    const comparison = await this.pool.exec('compare', { question, mood: pre.mood, facts, risks, multi, inquiry, dialectic });

    const hyperion = {
      engine: 'Hyperion-Core v2 / PCE-DCE',
      mode: 'max_firepower',
      human_reading: inquiry.human_reading || pre.human_reading || {},
      dialectic
    };

    const result = {
      type: 'cognitive_map',
      mode: 'hyperion_max_firepower',
      mood: pre.mood,
      facts,
      risks,
      multi,
      inquiry,
      hyperion,
      comparison
    };
    const prompt = this.buildPrompt(question, result);
    const answer = await this.llm.generate(prompt, input.llm || {});

    this.logger.write({ tenantId: tenant.id, type: 'process', payload: { question, result, llm: answer } });

    return {
      result,
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
    return [
      '# Astera v8 認知前処理済みプロンプト',
      '',
      '## 元の質問',
      question,
      '',
      '## 相手の状態',
      `- mood: ${map.mood?.code} / ${map.mood?.label} / confidence=${map.mood?.confidence}`,
      `- human_mode: ${human.mode || 'unknown'} / load=${human.load ?? '-'}`,
      `- likely_needs: ${(human.likely_needs || []).join(' / ') || '-'}`,
      `- response_policy: ${(human.response_policy || []).join(' / ') || '-'}`,
      '',
      '## 5本柱の認知マップ',
      `1. 真実: 確認候補${map.facts.confirmed.length} / 未確認${map.facts.unconfirmed.length} / 意見${map.facts.opinions.length}`,
      `2. 危機察知: ${map.risks.risk_count}件 / level=${map.risks.level}`,
      `3. 多角度: recommended=${map.multi.recommended}`,
      `4. 反対思考: healthy=${map.inquiry.problem_health.healthy} / ${map.inquiry.problem_health.reason}`,
      `5. 比較検証: score=${map.comparison.score} / answer線距離=${map.comparison.answer_line_distance} / decision=${map.comparison.verdict.decision}`,
      '',
      '## Hyperion/PCE-DCE 多重案ランキング',
      rankingText || '- 候補なし',
      '',
      '## 採用候補',
      JSON.stringify(map.comparison.selected_candidate || null, null, 2),
      '',
      '## 詳細JSON',
      JSON.stringify(map, null, 2),
      '',
      '## 最終回答ルール',
      '- 未確認情報は未確認と明記する。',
      '- リスクと反対意見を消さず、判断材料として残す。',
      '- 悪手案は採用せず、事故防止の素材として使う。',
      '- 相手の機嫌が不調寄りなら、問い返しは少なく、次の一手を明確にする。',
      '- 主案・反対案・第三案を比較して、最も現実に進む案を出す。'
    ].join('\n');
  }

  async destroy() {
    await this.pool.destroy();
  }
}

module.exports = KaguraEngine;
