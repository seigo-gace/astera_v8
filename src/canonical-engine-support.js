'use strict';

const Logger = require('./logger');
const { CanonicalTaskExecutor } = require('./runtime/canonical-task-executor');
const { FiveStageExecutor } = require('./runtime/five-stage-executor');
const { canonicalConcurrency } = require('./runtime/concurrency-policy');
const { destroyGlobalCanonicalTaskAdmission } = require('./runtime/canonical-task-admission');

const line = (value) => String(value ?? '-').replace(/\s+/g, ' ').trim() || '-';
const join = (items, fallback = '-') => (items || []).map(line).filter((item) => item && item !== '-').join(' / ') || fallback;

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

class CanonicalEngineSupport {
  constructor({ logger = new Logger(), poolSize = 4, workerTimeoutMs, workerQueueSize } = {}) {
    this.logger = logger;
    this.poolSize = canonicalConcurrency(poolSize, 4);
    this.workerTimeoutMs = positiveInteger(
      workerTimeoutMs || process.env.ASTERA_WORKER_TIMEOUT_MS,
      10_000
    );
    this.workerQueueSize = positiveInteger(
      workerQueueSize || process.env.ASTERA_WORKER_QUEUE_SIZE,
      Math.max(this.poolSize * 8, 32)
    );
    this.canonicalTaskExecutor = null;
    this.fiveStageExecutor = null;
  }

  getCanonicalTaskExecutor() {
    if (!this.canonicalTaskExecutor) {
      this.canonicalTaskExecutor = new CanonicalTaskExecutor({
        size: this.poolSize,
        timeoutMs: this.workerTimeoutMs,
        maxQueue: this.workerQueueSize,
        logger: this.logger
      });
    }
    return this.canonicalTaskExecutor;
  }

  getFiveStageExecutor() {
    if (!this.fiveStageExecutor) {
      this.fiveStageExecutor = new FiveStageExecutor({
        timeoutMs: this.workerTimeoutMs,
        maxQueue: Math.max(40, this.workerQueueSize * 5),
        logger: this.logger
      });
    }
    return this.fiveStageExecutor;
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

  async destroy() {
    const executor = this.canonicalTaskExecutor;
    const fiveStageExecutor = this.fiveStageExecutor;
    this.canonicalTaskExecutor = null;
    this.fiveStageExecutor = null;
    await destroyGlobalCanonicalTaskAdmission();
    await Promise.allSettled([
      executor ? executor.destroy() : Promise.resolve(),
      fiveStageExecutor ? fiveStageExecutor.destroy() : Promise.resolve()
    ]);
  }
}

module.exports = CanonicalEngineSupport;
