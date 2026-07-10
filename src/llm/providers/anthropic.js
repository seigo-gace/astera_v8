'use strict';

const LLMAdapter = require('../adapter-base');
const { fetchJson } = require('../http-client');

class AnthropicAdapter extends LLMAdapter {
  async generate(prompt) {
    const key = this.options.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
    const model = this.options.model || process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest';
    const { res, data } = await fetchJson('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': process.env.ANTHROPIC_VERSION || '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        max_tokens: Number(process.env.ASTERA_LLM_MAX_TOKENS || process.env.KAGURA_LLM_MAX_TOKENS || 1200),
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!res.ok) throw new Error(data?.error?.message || `Anthropic error ${res.status}`);
    return { provider: 'anthropic', model, text: data.content?.map((item) => item.text || '').join('\n') || '', raw: data };
  }
}

module.exports = AnthropicAdapter;
