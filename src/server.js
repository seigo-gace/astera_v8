'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const KaguraEngine = require('./kagura-engine');
const TenantManager = require('./auth/tenant');
const { UsageMeter } = require('./billing/meter');
const RateLimiter = require('./guard/rate-limiter');
const KeyVault = require('./billing/key-vault');
const { parseJsonStrict, maskSecrets } = require('./safe-json');

const ONE_MB = 1024 * 1024;

function parseAllowedOrigins() {
  const raw = process.env.ASTERA_CORS_ORIGINS || process.env.ASTERA_CORS_ORIGIN || process.env.KAGURA_CORS_ORIGINS || process.env.KAGURA_CORS_ORIGIN || '';
  const list = String(raw || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  return list.length ? list : ['http://127.0.0.1:7373', 'http://localhost:7373'];
}

function isLocalHost(host = '') {
  return /^(127\.0\.0\.1|localhost|\[::1\]|::1)(:\d+)?$/i.test(String(host || ''));
}

class KaguraServer {
  constructor(options = {}) {
    this.port = Number(options.port ?? 7373);
    this.host = options.host || '127.0.0.1';
    this.store = options.store;
    this.stripe = options.stripe;
    this.subSync = options.subSync;
    this.engine = new KaguraEngine({ poolSize: Number(options.poolSize || 4) });
    this.tenants = new TenantManager(this.store);
    this.meter = new UsageMeter(this.store);
    this.limiter = new RateLimiter();
    this.vault = new KeyVault();
    this.server = http.createServer((req, res) => this._handle(req, res));
  }

  start() {
    this.server.listen(this.port, this.host, () => {
      console.log(`Astera v8 listening at http://${this.host}:${this.port}`);
    });
  }

  async stop() {
    await this.engine.destroy();
    if (this.server.listening) await new Promise((resolve) => this.server.close(resolve));
    this.store?.close?.();
  }

  _corsOriginFor(req) {
    const origin = req?.headers?.origin;
    const allowed = parseAllowedOrigins();
    if (!origin) return allowed.includes('*') ? '*' : null;
    if (allowed.includes('*')) return '*';
    if (allowed.includes(origin)) return origin;
    return null;
  }

  _headers(req, extra = {}) {
    const origin = this._corsOriginFor(req);
    const headers = {
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Stripe-Signature',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Vary': 'Origin',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      ...extra
    };
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    if ((process.env.ASTERA_ENABLE_HSTS || process.env.KAGURA_ENABLE_HSTS) === '1') {
      headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
    }
    return headers;
  }

  _isSecureRequest(req) {
    return Boolean(req.socket.encrypted) || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
  }

  _requiresHttps(req) {
    if ((process.env.ASTERA_REQUIRE_HTTPS || process.env.KAGURA_REQUIRE_HTTPS) !== '1') return false;
    if (isLocalHost(req.headers.host)) return false;
    return !this._isSecureRequest(req);
  }

  _json(req, res, status, payload, options = {}) {
    const shouldMask = options.mask !== false;
    res.writeHead(status, this._headers(req, { 'Content-Type': 'application/json; charset=utf-8' }));
    res.end(JSON.stringify(shouldMask ? maskSecrets(payload) : payload, null, 2));
  }

  async _readRawBody(req, limit = ONE_MB) {
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > limit) {
        const err = new Error('Payload too large');
        err.status = 413;
        throw err;
      }
      chunks.push(buf);
    }
    return Buffer.concat(chunks, total);
  }

  async _readJson(req, limit = ONE_MB) {
    return parseJsonStrict(await this._readRawBody(req, limit));
  }

  async _authenticate(req) {
    const key = req.headers['x-api-key'];
    const localNoAuth = (process.env.ASTERA_LOCAL_NO_AUTH || process.env.KAGURA_LOCAL_NO_AUTH) === '1' && ['127.0.0.1', 'localhost', '::1'].includes(this.host);
    if (!key && localNoAuth) return { id: 'local-dev', plan: 'admin', status: 'active', is_global: true };
    return this.tenants.resolve(key);
  }

  async _handle(req, res) {
    try {
      if (this._requiresHttps(req)) {
        return this._json(req, res, 426, { error: 'https_required', hint: 'Set HTTPS at the reverse proxy or send X-Forwarded-Proto: https.' });
      }

      if (req.headers.origin && !this._corsOriginFor(req)) {
        return this._json(req, res, 403, { error: 'cors_origin_denied' });
      }

      if (req.method === 'OPTIONS') {
        res.writeHead(204, this._headers(req));
        return res.end();
      }

      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
        res.writeHead(200, this._headers(req, { 'Content-Type': 'text/html; charset=utf-8' }));
        return res.end(html);
      }

      if (req.method === 'GET' && url.pathname === '/healthz') {
        return this._json(req, res, 200, { ok: true, store: this.store.mode, sqlite_error: this.store.sqliteError || null, time: new Date().toISOString() });
      }

      if (req.method === 'POST' && url.pathname === '/signup') {
        const ip = req.socket.remoteAddress || 'unknown';
        const rl = this.limiter.check({ key: `signup:${ip}`, limit: 10, windowMs: 60_000 });
        if (!rl.allowed) return this._json(req, res, 429, { error: 'rate_limited', rate: rl });
        const { apiKey, tenant } = this.tenants.issueKey({ plan: 'free' });
        return this._json(req, res, 200, {
          apiKey,
          tenantId: tenant.id,
          plan: tenant.plan,
          note: 'このAPIキーは二度と表示されません。安全な場所に保存してください。'
        }, { mask: false });
      }

      if (req.method === 'POST' && url.pathname === '/billing/webhook') {
        const raw = await this._readRawBody(req, ONE_MB);
        const event = this.stripe.verifyWebhook(raw, req.headers['stripe-signature']);
        const result = await this.subSync.handleEvent(event);
        return this._json(req, res, 200, { received: true, result });
      }

      if (req.method === 'POST' && url.pathname === '/billing/checkout') {
        const tenant = await this._authenticate(req);
        if (!tenant) return this._json(req, res, 401, { error: 'unauthorized' });
        const body = await this._readJson(req);
        const rl = this.limiter.check({ key: `checkout:${tenant.id}`, limit: 10, windowMs: 60_000 });
        if (!rl.allowed) return this._json(req, res, 429, { error: 'rate_limited', rate: rl });
        const priceId = body.priceId || process.env.STRIPE_PRO_PRICE_ID;
        const publicBaseUrl = process.env.ASTERA_PUBLIC_BASE_URL || process.env.KAGURA_PUBLIC_BASE_URL || 'http://127.0.0.1:7373';
        const session = await this.stripe.createCheckoutSession({
          tenant,
          priceId,
          successUrl: body.successUrl || `${publicBaseUrl}/?success=1`,
          cancelUrl: body.cancelUrl || `${publicBaseUrl}/?cancel=1`
        });
        return this._json(req, res, 200, { checkoutUrl: session.url, sessionId: session.id });
      }

      if (req.method === 'POST' && url.pathname === '/process') {
        const tenant = await this._authenticate(req);
        if (!tenant) return this._json(req, res, 401, { error: 'unauthorized', hint: 'X-API-Key header is required. Use /signup first.' });
        const limits = this.tenants.limitsFor(tenant);
        const rl = this.limiter.check({ key: `process:${tenant.id}`, limit: limits.perMinute, windowMs: 60_000 });
        if (!rl.allowed) return this._json(req, res, 429, { error: 'rate_limited', rate: rl });

        const body = await this._readJson(req);
        body.llm = this.vault.resolveRequestLLM(body);
        const out = await this.engine.process(body, tenant);
        this.meter.record({ tenant, route: '/process', units: 1, status: 'ok', meta: { answerProvider: out.answer?.provider || null } });
        return this._json(req, res, 200, out);
      }

      return this._json(req, res, 404, { error: 'not_found' });
    } catch (error) {
      const status = error.status || (error.message && error.message.includes('Stripe signature') ? 400 : 500);
      return this._json(req, res, status, { error: error.message, status });
    }
  }
}

module.exports = KaguraServer;
module.exports.parseAllowedOrigins = parseAllowedOrigins;
