'use strict';

const { maskSecrets } = require('./safe-json');
const TgsClient = require('./logging/tgs-client');
const LogOutbox = require('./logging/outbox');

const LEVELS = new Set(['error', 'warn', 'info', 'debug', 'trace']);

class Logger {
  constructor({
    cacheDir,
    cacheTtlMs,
    tgsUrl,
    projectId,
    tgsEnabled = process.env.ASTERA_TGS_ENABLED !== '0',
    timeoutMs,
    retries,
    fetchImpl
  } = {}) {
    this.tgsEnabled = Boolean(tgsEnabled);
    this.pending = new Set();
    if (!this.tgsEnabled) {
      this.projectId = /^P\d+$/.test(String(projectId || 'P002')) ? String(projectId || 'P002') : 'P002';
      return;
    }

    this.client = new TgsClient({ url: tgsUrl, projectId, timeoutMs, retries, fetchImpl });
    this.outbox = new LogOutbox({ dir: cacheDir, ttlMs: cacheTtlMs });
    this.projectId = this.client.projectId;
    for (const entry of this.outbox.recover()) this._track(this._deliver(entry.row, entry.file));
  }

  write({ tenantId = 'system', type = 'event', severity = 'info', payload = {}, text = '' }) {
    const safeTenant = String(tenantId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const row = {
      at: new Date().toISOString(),
      source: 'astera-v8',
      severity: LEVELS.has(severity) ? severity : 'info',
      tenant_id: safeTenant,
      type: String(type || 'event'),
      text: String(text || type || 'event'),
      payload: maskSecrets(payload)
    };

    if (!this.tgsEnabled) return row;
    const cacheFile = this.outbox.put(row);
    this._track(this._deliver(row, cacheFile));
    return row;
  }

  _track(promise) {
    this.pending.add(promise);
    promise.finally(() => this.pending.delete(promise)).catch(() => {});
  }

  async _deliver(row, cacheFile) {
    const delivered = await this.client.deliver(row);
    if (delivered && cacheFile) this.outbox.remove(cacheFile);
    return delivered;
  }

  async flush(timeoutMs = 50_000) {
    if (!this.pending.size) return true;
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve(false), Math.max(0, timeoutMs));
    });
    const complete = Promise.allSettled([...this.pending]).then(() => true);
    const result = await Promise.race([complete, timeout]);
    clearTimeout(timer);
    return result;
  }

  status() {
    return {
      enabled: this.tgsEnabled,
      project_id: this.projectId,
      pending_deliveries: this.pending.size,
      outbox: this.outbox?.stats?.() || null
    };
  }
}

module.exports = Logger;
