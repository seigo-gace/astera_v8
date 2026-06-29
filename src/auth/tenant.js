'use strict';

const crypto = require('node:crypto');

const PLAN_LIMITS = {
  free: { perMinute: 5 },
  pro: { perMinute: 60 },
  business: { perMinute: 300 },
  admin: { perMinute: 1000 }
};

function timingSafeStringEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

class TenantManager {
  constructor(store) {
    if (!store) throw new Error('TenantManager requires store');
    this.store = store;
    this.pepper = process.env.ASTERA_KEY_PEPPER || process.env.KAGURA_KEY_PEPPER || 'astera-dev-pepper-change-me';
  }

  hashKey(apiKey) {
    return crypto.createHash('sha256').update(`${this.pepper}:${apiKey}`).digest('hex');
  }

  issueKey({ plan = 'free' } = {}) {
    const normalizedPlan = PLAN_LIMITS[plan] ? plan : 'free';
    const raw = `kg_${crypto.randomBytes(24).toString('base64url')}`;
    const tenant = this.store.createTenant({
      apiKeyHash: this.hashKey(raw),
      keyPrefix: raw.slice(0, 10),
      plan: normalizedPlan,
      status: 'active'
    });
    return { apiKey: raw, tenant };
  }

  resolve(apiKey) {
    const key = String(apiKey || '').trim();
    if (!key || key.length > 256) return null;

    const globalKey = process.env.ASTERA_API_KEY || process.env.KAGURA_API_KEY || '';
    if (globalKey && timingSafeStringEqual(key, globalKey)) {
      return { id: 'admin', plan: 'admin', status: 'active', key_prefix: 'admin', is_global: true };
    }

    if (!key.startsWith('kg_')) return null;
    const tenant = this.store.getTenantByKeyHash(this.hashKey(key));
    if (!tenant || tenant.status !== 'active') return null;
    return tenant;
  }

  limitsFor(tenant) {
    return PLAN_LIMITS[tenant?.plan] || PLAN_LIMITS.free;
  }
}

module.exports = TenantManager;
module.exports.PLAN_LIMITS = PLAN_LIMITS;
