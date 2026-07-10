'use strict';

const crypto = require('node:crypto');

function safeEqualHex(a, b) {
  if (!/^[0-9a-f]+$/i.test(String(a || '')) || !/^[0-9a-f]+$/i.test(String(b || ''))) return false;
  const aa = Buffer.from(String(a || ''), 'hex');
  const bb = Buffer.from(String(b || ''), 'hex');
  if (aa.length !== bb.length || aa.length === 0) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function parseStripeSignature(header = '') {
  const out = { t: null, v1: [] };
  for (const item of String(header || '').split(',')) {
    const idx = item.indexOf('=');
    if (idx === -1) continue;
    const key = item.slice(0, idx).trim();
    const value = item.slice(idx + 1).trim();
    if (key === 't') out.t = value;
    if (key === 'v1') out.v1.push(value);
  }
  return out;
}

class StripeClient {
  constructor({ secretKey = '', webhookSecret = '' } = {}) {
    this.secretKey = secretKey;
    this.webhookSecret = webhookSecret;
    this.apiBase = 'https://api.stripe.com/v1';
    this.toleranceSeconds = Number(process.env.STRIPE_WEBHOOK_TOLERANCE_SECONDS || 300);
  }

  isEnabled() {
    return Boolean(this.secretKey);
  }

  async createCheckoutSession({ tenant, priceId, plan = 'pro', successUrl, cancelUrl }) {
    if (!this.secretKey) {
      const err = new Error('Stripe is disabled: STRIPE_SECRET_KEY is not set');
      err.status = 503;
      throw err;
    }
    if (!priceId) {
      const err = new Error('priceId is required');
      err.status = 400;
      throw err;
    }

    const params = new URLSearchParams();
    params.set('mode', 'subscription');
    params.set('success_url', successUrl);
    params.set('cancel_url', cancelUrl);
    params.set('client_reference_id', tenant.id);
    params.set('line_items[0][price]', priceId);
    params.set('line_items[0][quantity]', '1');
    params.set('metadata[tenant_id]', tenant.id);
    params.set('metadata[plan]', plan);
    params.set('subscription_data[metadata][tenant_id]', tenant.id);
    params.set('subscription_data[metadata][plan]', plan);

    const controller = new AbortController();
    const timeoutMs = Math.max(1000, Number(process.env.ASTERA_STRIPE_TIMEOUT_MS || 30_000));
    const timer = setTimeout(() => controller.abort(new Error('Stripe request timeout')), timeoutMs);
    timer.unref?.();
    let res;
    try {
      res = await fetch(`${this.apiBase}/checkout/sessions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params,
        signal: controller.signal
      });
    } catch (error) {
      const upstream = new Error(error?.name === 'AbortError' ? 'Stripe request timeout' : 'Stripe request failed');
      upstream.status = 502;
      throw upstream;
    } finally {
      clearTimeout(timer);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = data?.error?.message || `Stripe error ${res.status}`;
      const err = new Error(message);
      err.status = res.status;
      throw err;
    }
    return { id: data.id, url: data.url, raw: data };
  }

  verifyWebhook(rawBody, signatureHeader) {
    if (!this.webhookSecret) {
      const err = new Error('STRIPE_WEBHOOK_SECRET is not set');
      err.status = 503;
      throw err;
    }
    const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''), 'utf8');
    const { t, v1 } = parseStripeSignature(signatureHeader);
    if (!t || !v1.length) {
      const err = new Error('Invalid Stripe-Signature header');
      err.status = 400;
      throw err;
    }

    const timestamp = Number(t);
    const age = Math.abs(Date.now() / 1000 - timestamp);
    if (!Number.isFinite(age) || age > this.toleranceSeconds) {
      const err = new Error('Stripe signature timestamp is outside tolerance');
      err.status = 400;
      throw err;
    }

    const dot = Buffer.from(`${t}.`, 'utf8');
    const signedPayload = Buffer.concat([dot, bodyBuffer]);
    const expected = crypto.createHmac('sha256', this.webhookSecret).update(signedPayload).digest('hex');
    if (!v1.some((candidate) => safeEqualHex(expected, candidate))) {
      const err = new Error('Stripe signature mismatch');
      err.status = 400;
      throw err;
    }

    try {
      return JSON.parse(bodyBuffer.toString('utf8'));
    } catch (error) {
      const err = new Error(`Invalid Stripe webhook JSON: ${error.message}`);
      err.status = 400;
      throw err;
    }
  }
}

module.exports = StripeClient;
module.exports.parseStripeSignature = parseStripeSignature;
