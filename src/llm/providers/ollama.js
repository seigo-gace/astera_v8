'use strict';

const LLMAdapter = require('../adapter-base');
const { fetchJson } = require('../http-client');

class OllamaAdapter extends LLMAdapter {
  async generate(prompt) {
    const baseUrl = this.options.baseUrl || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
    const model = this.options.model || process.env.OLLAMA_MODEL || 'llama3.1';
    const { res, data } = await fetchJson(`${baseUrl.replace(/\/$/, '')}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false })
    });
    if (!res.ok) throw new Error(data?.error || `Ollama error ${res.status}`);
    return { provider: 'ollama', model, text: data.response || '', raw: data };
  }
}

module.exports = OllamaAdapter;
