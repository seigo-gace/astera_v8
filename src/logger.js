'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { stringify, maskSecrets } = require('./safe-json');

class Logger {
  constructor({ dir = process.env.ASTERA_LOG_DIR || process.env.KAGURA_LOG_DIR || 'astera-logs' } = {}) {
    this.dir = dir;
    fs.mkdirSync(this.dir, { recursive: true });
  }

  write({ tenantId = 'unknown', type = 'event', payload = {} }) {
    const safeTenant = String(tenantId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const file = path.join(this.dir, `${safeTenant}.jsonl`);
    const row = { at: new Date().toISOString(), type, payload: maskSecrets(payload) };
    fs.appendFileSync(file, `${stringify(row)}\n`);
    return row;
  }
}

module.exports = Logger;
