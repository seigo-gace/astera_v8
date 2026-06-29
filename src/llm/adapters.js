'use strict';

const LLMAdapter = require('./adapter-base');

function timeoutSignal(ms = Number(process.env.ASTERA_LLM_TIMEOUT_MS || process.env.KAGURA_LLM_TIMEOUT_MS || 30_000)) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('LLM request timeout')), Math.max(1000, Number(ms) || 30_000));
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function fetchJson(url, options = {}) {
  const timeout = timeoutSignal(options.timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: timeout.signal });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { rawText: text }; }
    return { res, data };
  } finally {
    timeout.clear();
  }
}

class NullAdapter extends LLMAdapter {
  async generate(prompt) {
    return {
      provider: 'null',
      model: 'rule-based',
      text: [
        'Astera v8 NullAdapter result:',
        '外部LLMは呼び出していません。',
        '下記の認知前処理済みプロンプトを任意のLLMへ渡してください。',
        '',
        prompt.slice(0, 4000)
      ].join('\n')
    };
  }
}

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
      body: JSON.stringify({ model, max_tokens: Number(process.env.ASTERA_LLM_MAX_TOKENS || process.env.KAGURA_LLM_MAX_TOKENS || 1200), messages: [{ role: 'user', content: prompt }] })
    });
    if (!res.ok) throw new Error(data?.error?.message || `Anthropic error ${res.status}`);
    return { provider: 'anthropic', model, text: data.content?.map((x) => x.text || '').join('\n') || '', raw: data };
  }
}

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

class OpenAICompatAdapter extends LLMAdapter {
  async generate(prompt) {
    const baseUrl = this.options.baseUrl || process.env.OPENAI_COMPAT_BASE_URL;
    const key = this.options.apiKey || process.env.OPENAI_COMPAT_API_KEY;
    const model = this.options.model || process.env.OPENAI_COMPAT_MODEL;
    if (!baseUrl || !model) throw new Error('OPENAI_COMPAT_BASE_URL and OPENAI_COMPAT_MODEL are required');
    const endpoint = baseUrl.replace(/\/$/, '').endsWith('/v1')
      ? `${baseUrl.replace(/\/$/, '')}/chat/completions`
      : `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`;
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

function adapterFor(name, options) {
  const key = String(name || 'null').toLowerCase();
  if (key === 'openai') return new OpenAIAdapter(options);
  if (key === 'anthropic' || key === 'claude') return new AnthropicAdapter(options);
  if (key === 'ollama') return new OllamaAdapter(options);
  if (key === 'compat' || key === 'openai-compatible' || key === 'openai_compat') return new OpenAICompatAdapter(options);
  if (key === 'null' || key === 'rule' || key === 'rules') return new NullAdapter(options);
  throw new Error(`Unknown LLM provider: ${name}`);
}

module.exports = { adapterFor, NullAdapter, OpenAIAdapter, AnthropicAdapter, OllamaAdapter, OpenAICompatAdapter, fetchJson };
