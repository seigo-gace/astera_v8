'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function nowIso() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

class SQLiteStore {
  constructor(dbPath = 'kagura.db') {
    this.dbPath = dbPath;
    this.mode = 'json-fallback';
    this.db = null;
    this.jsonPath = dbPath.endsWith('.db') ? dbPath.replace(/\.db$/, '.store.json') : `${dbPath}.json`;
    this.data = { tenants: [], usage: [], events: [], processed_events: [] };
    const dir = path.dirname(this.dbPath);
    if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
    this._trySqlite();
    if (this.mode !== 'sqlite') this._loadJson();
  }

  _trySqlite() {
    try {
      const { DatabaseSync } = require('node:sqlite');
      this.db = new DatabaseSync(this.dbPath, { timeout: 5000 });
      this.mode = 'sqlite';
      this.db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS tenants (
          id TEXT PRIMARY KEY,
          api_key_hash TEXT NOT NULL UNIQUE,
          key_prefix TEXT NOT NULL,
          plan TEXT NOT NULL,
          status TEXT NOT NULL,
          stripe_customer_id TEXT,
          stripe_subscription_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_tenants_stripe_subscription_id ON tenants(stripe_subscription_id);
        CREATE TABLE IF NOT EXISTS usage (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          route TEXT NOT NULL,
          units INTEGER NOT NULL,
          status TEXT NOT NULL,
          meta_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY(tenant_id) REFERENCES tenants(id)
        );
        CREATE TABLE IF NOT EXISTS events (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          tenant_id TEXT,
          payload_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS processed_events (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          status TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 1,
          tenant_id TEXT,
          result_json TEXT,
          error_message TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
    } catch (error) {
      this.mode = 'json-fallback';
      this.db = null;
      this.sqliteError = error.message;
    }
  }

  _loadJson() {
    try {
      if (fs.existsSync(this.jsonPath)) {
        this.data = { tenants: [], usage: [], events: [], processed_events: [], ...JSON.parse(fs.readFileSync(this.jsonPath, 'utf8')) };
      }
    } catch (error) {
      const broken = `${this.jsonPath}.broken-${Date.now()}`;
      fs.renameSync(this.jsonPath, broken);
      this.data = { tenants: [], usage: [], events: [], processed_events: [] };
    }
  }

  _saveJson() {
    const dir = path.dirname(this.jsonPath);
    if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${this.jsonPath}.tmp`, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    fs.renameSync(`${this.jsonPath}.tmp`, this.jsonPath);
  }

  createTenant({ apiKeyHash, keyPrefix, plan = 'free', status = 'active' }) {
    const tenant = {
      id: id('tenant'),
      api_key_hash: apiKeyHash,
      key_prefix: keyPrefix,
      plan,
      status,
      stripe_customer_id: null,
      stripe_subscription_id: null,
      created_at: nowIso(),
      updated_at: nowIso()
    };
    if (this.mode === 'sqlite') {
      this.db.prepare(`
        INSERT INTO tenants (id, api_key_hash, key_prefix, plan, status, stripe_customer_id, stripe_subscription_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(tenant.id, tenant.api_key_hash, tenant.key_prefix, tenant.plan, tenant.status, tenant.stripe_customer_id, tenant.stripe_subscription_id, tenant.created_at, tenant.updated_at);
      return tenant;
    }
    this.data.tenants.push(tenant);
    this._saveJson();
    return tenant;
  }

  getTenantByKeyHash(apiKeyHash) {
    if (this.mode === 'sqlite') {
      return this.db.prepare('SELECT * FROM tenants WHERE api_key_hash = ?').get(apiKeyHash) || null;
    }
    return this.data.tenants.find((tenant) => tenant.api_key_hash === apiKeyHash) || null;
  }

  getTenantById(tenantId) {
    if (this.mode === 'sqlite') {
      return this.db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId) || null;
    }
    return this.data.tenants.find((tenant) => tenant.id === tenantId) || null;
  }

  findTenantByStripeSubscriptionId(subscriptionId) {
    if (!subscriptionId) return null;
    if (this.mode === 'sqlite') {
      return this.db.prepare('SELECT * FROM tenants WHERE stripe_subscription_id = ?').get(subscriptionId) || null;
    }
    return this.data.tenants.find((tenant) => tenant.stripe_subscription_id === subscriptionId) || null;
  }

  updateTenant(tenantId, patch) {
    const existing = this.getTenantById(tenantId);
    if (!existing) return null;
    const allowed = ['plan', 'status', 'stripe_customer_id', 'stripe_subscription_id'];
    const next = { ...existing, ...Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k))), updated_at: nowIso() };
    if (this.mode === 'sqlite') {
      this.db.prepare(`
        UPDATE tenants SET plan = ?, status = ?, stripe_customer_id = ?, stripe_subscription_id = ?, updated_at = ? WHERE id = ?
      `).run(next.plan, next.status, next.stripe_customer_id, next.stripe_subscription_id, next.updated_at, tenantId);
      return this.getTenantById(tenantId);
    }
    const idx = this.data.tenants.findIndex((tenant) => tenant.id === tenantId);
    this.data.tenants[idx] = next;
    this._saveJson();
    return next;
  }

  recordUsage({ tenantId, route, units = 1, status = 'ok', meta = {} }) {
    const row = { id: id('use'), tenant_id: tenantId, route, units, status, meta_json: JSON.stringify(meta), created_at: nowIso() };
    if (this.mode === 'sqlite') {
      this.db.prepare(`INSERT INTO usage (id, tenant_id, route, units, status, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(row.id, row.tenant_id, row.route, row.units, row.status, row.meta_json, row.created_at);
      return row;
    }
    this.data.usage.push(row);
    this._saveJson();
    return row;
  }

  countUsageSince(tenantId, route, sinceIso) {
    if (this.mode === 'sqlite') {
      const row = this.db.prepare('SELECT COALESCE(SUM(units), 0) AS total FROM usage WHERE tenant_id = ? AND route = ? AND created_at >= ?')
        .get(tenantId, route, sinceIso);
      return Number(row?.total || 0);
    }
    return this.data.usage
      .filter((row) => row.tenant_id === tenantId && row.route === route && row.created_at >= sinceIso)
      .reduce((sum, row) => sum + Number(row.units || 0), 0);
  }

  recordEvent({ type, tenantId = null, payload = {} }) {
    const row = { id: id('evt'), type, tenant_id: tenantId, payload_json: JSON.stringify(payload), created_at: nowIso() };
    if (this.mode === 'sqlite') {
      this.db.prepare('INSERT INTO events (id, type, tenant_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(row.id, row.type, row.tenant_id, row.payload_json, row.created_at);
      return row;
    }
    this.data.events.push(row);
    this._saveJson();
    return row;
  }

  beginProcessedEvent({ eventId, type }) {
    const eid = String(eventId || '').trim();
    if (!eid) return { firstTime: true, event: null, reason: 'event_id_missing' };
    const now = nowIso();

    if (this.mode === 'sqlite') {
      const inserted = this.db.prepare(`
        INSERT OR IGNORE INTO processed_events (id, type, status, attempts, tenant_id, result_json, error_message, created_at, updated_at)
        VALUES (?, ?, 'processing', 1, NULL, NULL, NULL, ?, ?)
      `).run(eid, type || 'unknown', now, now);
      if (inserted.changes > 0) return { firstTime: true, event: this.getProcessedEvent(eid) };

      const existing = this.getProcessedEvent(eid);
      if (existing?.status === 'failed') {
        this.db.prepare(`UPDATE processed_events SET status = 'processing', attempts = attempts + 1, error_message = NULL, updated_at = ? WHERE id = ?`)
          .run(now, eid);
        return { firstTime: true, event: this.getProcessedEvent(eid), retry: true };
      }
      return { firstTime: false, event: existing, reason: existing?.status || 'duplicate' };
    }

    const existing = this.data.processed_events.find((row) => row.id === eid);
    if (!existing) {
      const row = { id: eid, type: type || 'unknown', status: 'processing', attempts: 1, tenant_id: null, result_json: null, error_message: null, created_at: now, updated_at: now };
      this.data.processed_events.push(row);
      this._saveJson();
      return { firstTime: true, event: row };
    }
    if (existing.status === 'failed') {
      existing.status = 'processing';
      existing.attempts = Number(existing.attempts || 0) + 1;
      existing.error_message = null;
      existing.updated_at = now;
      this._saveJson();
      return { firstTime: true, event: existing, retry: true };
    }
    return { firstTime: false, event: existing, reason: existing.status };
  }

  finishProcessedEvent({ eventId, status = 'processed', tenantId = null, result = {}, errorMessage = null }) {
    const eid = String(eventId || '').trim();
    if (!eid) return null;
    const now = nowIso();
    const resultJson = JSON.stringify(result || {});
    if (this.mode === 'sqlite') {
      this.db.prepare(`
        UPDATE processed_events SET status = ?, tenant_id = ?, result_json = ?, error_message = ?, updated_at = ? WHERE id = ?
      `).run(status, tenantId, resultJson, errorMessage, now, eid);
      return this.getProcessedEvent(eid);
    }
    const row = this.data.processed_events.find((item) => item.id === eid);
    if (!row) return null;
    row.status = status;
    row.tenant_id = tenantId;
    row.result_json = resultJson;
    row.error_message = errorMessage;
    row.updated_at = now;
    this._saveJson();
    return row;
  }

  getProcessedEvent(eventId) {
    const eid = String(eventId || '').trim();
    if (!eid) return null;
    if (this.mode === 'sqlite') {
      return this.db.prepare('SELECT * FROM processed_events WHERE id = ?').get(eid) || null;
    }
    return this.data.processed_events.find((row) => row.id === eid) || null;
  }

  close() {
    if (this.db) this.db.close();
  }
}

module.exports = SQLiteStore;
