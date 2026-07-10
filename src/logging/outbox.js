'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { stringify, maskSecrets } = require('../safe-json');

class LogOutbox {
  constructor({
    dir = process.env.ASTERA_LOG_CACHE_DIR || '/home/admin1/logs/astera-v8/outbox',
    ttlMs = Number(process.env.ASTERA_LOG_CACHE_TTL_MS || 7 * 24 * 60 * 60 * 1000)
  } = {}) {
    this.dir = dir;
    this.ttlMs = Math.max(60_000, Number(ttlMs) || 7 * 24 * 60 * 60 * 1000);
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    try { fs.chmodSync(this.dir, 0o700); } catch (_) {}
  }

  put(row) {
    const createdAt = Date.now();
    const file = path.join(this.dir, `${createdAt}-${crypto.randomUUID()}.json`);
    const temporary = `${file}.tmp`;
    const record = {
      version: 1,
      created_at: new Date(createdAt).toISOString(),
      expires_at: new Date(createdAt + this.ttlMs).toISOString(),
      row
    };
    try {
      fs.writeFileSync(temporary, stringify(record), { mode: 0o600, flag: 'wx' });
      fs.renameSync(temporary, file);
      return file;
    } catch (error) {
      try { fs.rmSync(temporary, { force: true }); } catch (_) {}
      process.stderr.write(`[astera-outbox] write failed: ${maskSecrets(error).message || 'unknown'}\n`);
      return null;
    }
  }

  recover() {
    let names = [];
    try { names = fs.readdirSync(this.dir); } catch (_) { return []; }
    const now = Date.now();
    const entries = [];
    for (const name of names) {
      const file = path.join(this.dir, name);
      if (name.endsWith('.tmp')) {
        this._removeIfExpiredByMtime(file, now);
        continue;
      }
      if (!name.endsWith('.json')) continue;
      try {
        const record = JSON.parse(fs.readFileSync(file, 'utf8'));
        const expiresAt = Date.parse(record.expires_at);
        if (!record.row || !Number.isFinite(expiresAt) || now >= expiresAt) {
          this.remove(file);
          continue;
        }
        entries.push({ file, row: record.row });
      } catch (error) {
        this._removeIfExpiredByMtime(file, now);
        process.stderr.write(`[astera-outbox] recovery skipped ${name}: ${maskSecrets(error).message || 'invalid cache record'}\n`);
      }
    }
    return entries;
  }

  stats() {
    let names = [];
    try { names = fs.readdirSync(this.dir); } catch (_) {
      return { dir: this.dir, writable: false, pending: 0, temporary: 0, expired: 0, bytes: 0 };
    }
    const now = Date.now();
    const stats = { dir: this.dir, writable: true, pending: 0, temporary: 0, expired: 0, bytes: 0 };
    for (const name of names) {
      const file = path.join(this.dir, name);
      let stat;
      try { stat = fs.statSync(file); } catch (_) { continue; }
      if (!stat.isFile()) continue;
      stats.bytes += stat.size;
      if (name.endsWith('.tmp')) {
        stats.temporary += 1;
        if (now - stat.mtimeMs >= this.ttlMs) stats.expired += 1;
        continue;
      }
      if (!name.endsWith('.json')) continue;
      stats.pending += 1;
      try {
        const record = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (now >= Date.parse(record.expires_at)) stats.expired += 1;
      } catch (_) {
        stats.expired += 1;
      }
    }
    return stats;
  }

  _removeIfExpiredByMtime(file, now) {
    try {
      if (now - fs.statSync(file).mtimeMs >= this.ttlMs) this.remove(file);
    } catch (_) {}
  }

  remove(file) {
    try {
      fs.rmSync(file, { force: true });
      return true;
    } catch (error) {
      process.stderr.write(`[astera-outbox] cleanup failed: ${maskSecrets(error).message || 'unknown'}\n`);
      return false;
    }
  }
}

module.exports = LogOutbox;
