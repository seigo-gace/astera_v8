'use strict';

const crypto = require('node:crypto');

function timingSafeStringEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function configuredSkillApiKey() {
  return String(process.env.ASTERA_SKILL_API_KEY || '');
}

function isSkillApiConfigured() {
  const skillKey = configuredSkillApiKey();
  const publicKey = String(process.env.ASTERA_API_KEY || '');
  if (skillKey.length < 32 || skillKey.length > 256) return false;
  return !publicKey || !timingSafeStringEqual(skillKey, publicKey);
}

function authenticateSkillApiKey(apiKey) {
  const candidate = String(apiKey || '').trim();
  if (!isSkillApiConfigured() || !candidate || candidate.length > 256) return null;
  if (!timingSafeStringEqual(candidate, configuredSkillApiKey())) return null;
  return {
    id: 'owner-skill-private',
    plan: 'private',
    status: 'active',
    key_prefix: 'skill-private',
    is_global: true,
    unlimited: true
  };
}

module.exports = { authenticateSkillApiKey, isSkillApiConfigured, timingSafeStringEqual };
