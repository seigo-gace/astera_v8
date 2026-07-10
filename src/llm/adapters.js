'use strict';

const NullAdapter = require('./providers/null');
const OpenAIAdapter = require('./providers/openai');
const AnthropicAdapter = require('./providers/anthropic');
const OllamaAdapter = require('./providers/ollama');
const OpenAICompatAdapter = require('./providers/openai-compatible');
const { fetchJson } = require('./http-client');

function adapterFor(name, options) {
  const key = String(name || 'null').toLowerCase();
  if (key === 'openai') return new OpenAIAdapter(options);
  if (key === 'anthropic' || key === 'claude') return new AnthropicAdapter(options);
  if (key === 'ollama') return new OllamaAdapter(options);
  if (key === 'compat' || key === 'openai-compatible' || key === 'openai_compat') return new OpenAICompatAdapter(options);
  if (key === 'null' || key === 'rule' || key === 'rules') return new NullAdapter(options);
  throw new Error(`Unknown LLM provider: ${name}`);
}

module.exports = {
  adapterFor,
  NullAdapter,
  OpenAIAdapter,
  AnthropicAdapter,
  OllamaAdapter,
  OpenAICompatAdapter,
  fetchJson
};
