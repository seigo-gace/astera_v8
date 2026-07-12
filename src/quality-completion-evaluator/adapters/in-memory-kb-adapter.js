"use strict";

function createInMemoryKbAdapter() {
  const records = new Map();
  return {
    async publish(record, options = {}) {
      const key = options.idempotencyKey || record.idempotency_key;
      if (records.has(key)) {
        return { status: "duplicate", kb_id: records.get(key).kb_id, idempotency_key: key };
      }
      const stored = { ...record, kb_id: `kb_${records.size + 1}`, published_at: new Date().toISOString() };
      records.set(key, stored);
      return { status: "published", kb_id: stored.kb_id, idempotency_key: key };
    },
    get size() { return records.size; },
    list() { return [...records.values()]; }
  };
}

module.exports = { createInMemoryKbAdapter };
