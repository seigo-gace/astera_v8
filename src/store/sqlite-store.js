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
  constructor(dbPath = 'astera.db') {
    this.dbPath = dbPath;
    this.mode = 'json-fallback';
    this.db = null;
    this.jsonPath = dbPath.endsWith('.db') ? dbPath.replace(/\.db$/, '.store.json') : `${dbPath}.json`;
    this.data = { tenants: [], usage: [], events: [] };
    const dir = path.dirname(this.dbPath);
    if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
    this._trySqlite();
    if (this.mode !== 'sqlite') this._loadJson();
  }

  _trySqlite() {
    try {
      const { DatabaseSync } = require('node:sqlite');
      this.db = new DatabaseSync(this.dbPath, { timeout: 5000 });
      try { fs.chmodSync(this.dbPath, 0o600); } catch (_) {}
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
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
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
        this.data = { tenants: [], usage: [], events: [], ...JSON.parse(fs.readFileSync(this.jsonPath, 'utf8')) };
      }
    } catch (error) {
      const broken = `${this.jsonPath}.broken-${Date.now()}`;
      fs.renameSync(this.jsonPath, broken);
      this.data = { tenants: [], usage: [], events: [] };
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
      created_at: nowIso(),
      updated_at: nowIso()
    };
    if (this.mode === 'sqlite') {
      this.db.prepare(`
        INSERT INTO tenants (id, api_key_hash, key_prefix, plan, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(tenant.id, tenant.api_key_hash, tenant.key_prefix, tenant.plan, tenant.status, tenant.created_at, tenant.updated_at);
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


  updateTenant(tenantId, patch) {
    const existing = this.getTenantById(tenantId);
    if (!existing) return null;
    const allowed = ['plan', 'status'];
    const next = { ...existing, ...Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k))), updated_at: nowIso() };
    if (this.mode === 'sqlite') {
      this.db.prepare(`
        UPDATE tenants SET plan = ?, status = ?, updated_at = ? WHERE id = ?
      `).run(next.plan, next.status, next.updated_at, tenantId);
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


  close() {
    if (this.db) this.db.close();
  }
}

module.exports = SQLiteStore;
