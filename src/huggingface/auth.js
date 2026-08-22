'use strict';

function getHuggingFaceToken(env = process.env) {
  return String(env.HF_TOKEN || '').trim();
}

function requireHuggingFaceToken(env = process.env) {
  const token = getHuggingFaceToken(env);
  if (!token) {
    const err = new Error('HF_TOKEN is not set');
    err.status = 503;
    throw err;
  }
  return token;
}

function buildHuggingFaceAuthHeaders(env = process.env, extraHeaders = {}) {
  const token = requireHuggingFaceToken(env);
  return {
    ...extraHeaders,
    Authorization: `Bearer ${token}`
  };
}

module.exports = {
  getHuggingFaceToken,
  requireHuggingFaceToken,
  buildHuggingFaceAuthHeaders
};
