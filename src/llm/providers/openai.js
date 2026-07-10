'use strict';

const LLMAdapter = require('../adapter-base');
const { fetchJson } = require('../http-client');

class OpenAIAdapter extends LLMAdapter {
  async generate(prompt) {
    const key = this.options.apiKey || process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY is not set');
    const model = this.options.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const { res, data } = await fetchJson('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] })
    });
    if (!res.ok) throw new Error(data?.error?.message || `OpenAI error ${res.status}`);
    return { provider: 'openai', model, text: data.choices?.[0]?.message?.content || '', raw: data };
  }
}

module.exports = OpenAIAdapter;
