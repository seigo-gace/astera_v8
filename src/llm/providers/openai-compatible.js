'use strict';

const LLMAdapter = require('../adapter-base');
const { fetchJson } = require('../http-client');

class OpenAICompatAdapter extends LLMAdapter {
  async generate(prompt) {
    const baseUrl = this.options.baseUrl || process.env.OPENAI_COMPAT_BASE_URL;
    const key = this.options.apiKey || process.env.OPENAI_COMPAT_API_KEY;
    const model = this.options.model || process.env.OPENAI_COMPAT_MODEL;
    if (!baseUrl || !model) throw new Error('OPENAI_COMPAT_BASE_URL and OPENAI_COMPAT_MODEL are required');
    const root = baseUrl.replace(/\/$/, '');
    const endpoint = root.endsWith('/v1') ? `${root}/chat/completions` : `${root}/v1/chat/completions`;
    const headers = { 'Content-Type': 'application/json' };
    if (key) headers.Authorization = `Bearer ${key}`;
    const { res, data } = await fetchJson(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] })
    });
    if (!res.ok) throw new Error(data?.error?.message || `OpenAI-compatible error ${res.status}`);
    return { provider: 'compat', model, text: data.choices?.[0]?.message?.content || '', raw: data };
  }
}

module.exports = OpenAICompatAdapter;
