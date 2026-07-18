'use strict';

const crypto = require('node:crypto');

const REUSE_ORIGIN = Object.freeze({
  repository: 'seigo-gace/modular-catalog',
  commit: 'a573f0acba7c31d2a36c58c95cbd02fbdd532734',
  source: 'src/catalog.js'
});

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  const input = Buffer.isBuffer(value) ? value : typeof value === 'string' ? value : canonicalJson(value);
  return crypto.createHash('sha256').update(input).digest('hex');
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value) {
  return [...new Set(normalizeText(value).toLowerCase().split(/[^\p{L}\p{N}+#.\-]+/u).filter(Boolean))];
}

module.exports = { REUSE_ORIGIN, canonicalJson, sha256, normalizeText, tokenize };
