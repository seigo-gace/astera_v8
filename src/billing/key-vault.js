'use strict';

const { maskSecrets } = require('../safe-json');

const ALLOWED_PROVIDERS = new Set(['openai', 'anthropic', 'claude', 'ollama', 'compat', 'openai-compatible', 'openai_compat', 'null', 'rule', 'rules']);

function normalizeChain(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || process.env.LLM_CHAIN || 'null').split(',');
  const chain = raw
    .map((x) => String(x || '').trim().toLowerCase())
    .filter(Boolean)
    .filter((x) => ALLOWED_PROVIDERS.has(x))
    .slice(0, 5);
  return chain.length ? chain : ['null'];
}

class KeyVault {
  resolveRequestLLM(body = {}) {
    const llm = body.llm || {};
    return {
      chain: normalizeChain(llm.chain),
      apiKey: typeof llm.apiKey === 'string' ? llm.apiKey : '',
      baseUrl: typeof llm.baseUrl === 'string' ? llm.baseUrl : '',
      model: typeof llm.model === 'string' ? llm.model : '',
      masked: maskSecrets(llm)
    };
  }
}

module.exports = KeyVault;
module.exports.normalizeChain = normalizeChain;
