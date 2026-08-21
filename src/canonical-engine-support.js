'use strict';

const Logger = require('./logger');

const line = (value) => String(value ?? '-').replace(/\s+/g, ' ').trim() || '-';
const join = (items, fallback = '-') => (items || []).map(line).filter((item) => item && item !== '-').join(' / ') || fallback;

class CanonicalEngineSupport {
  constructor({ logger = new Logger() } = {}) {
    this.logger = logger;
  }

  clarify(questions, lang = 'ja') {
    const label = lang === 'en' ? 'Clarification required' : '前提確認が必要です';
    const sub = lang === 'en' ? 'Items to confirm' : '確認したいこと';
    const qs = (questions || []).length
      ? questions
      : [lang === 'en'
          ? 'What is the target, action, and completion condition?'
          : '対象・行為・完了条件は何ですか？'];
    return {
      mode: 'clarification',
      target: 'user_ai',
      raw_policy: 'do_not_pass_raw_by_default',
      non_ai: true,
      text: `${label}\n${sub}\n${qs.map((item) => `- ${line(item)}`).join('\n')}`,
      compact_text: `${label}: ${join(qs)}`,
      sections: []
    };
  }

  async destroy() {}
}

module.exports = CanonicalEngineSupport;
