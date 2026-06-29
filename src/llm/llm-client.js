'use strict';

const { adapterFor } = require('./adapters');

class LLMClient {
  constructor({ defaultChain } = {}) {
    this.defaultChain = defaultChain || String(process.env.LLM_CHAIN || 'null').split(',').map((x) => x.trim()).filter(Boolean);
    if (!this.defaultChain.length) this.defaultChain = ['null'];
  }

  async generate(prompt, requestLLM = {}) {
    const chain = Array.isArray(requestLLM.chain) && requestLLM.chain.length ? requestLLM.chain : this.defaultChain;
    const errors = [];
    for (const name of chain) {
      try {
        const adapter = adapterFor(name, requestLLM);
        const result = await adapter.generate(prompt);
        return { ...result, chain_used: name, errors };
      } catch (error) {
        errors.push({ provider: name, message: error.message });
      }
    }
    const fallback = adapterFor('null', requestLLM);
    const result = await fallback.generate(prompt);
    return { ...result, chain_used: 'null', errors };
  }
}

module.exports = LLMClient;
