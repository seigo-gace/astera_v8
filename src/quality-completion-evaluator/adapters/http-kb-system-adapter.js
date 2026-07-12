"use strict";

function createHttpKbSystemAdapter(options = {}) {
  const baseUrl = options.baseUrl || process.env.KB_SYSTEM_URL;
  const endpoint = options.endpoint || process.env.KB_SYSTEM_ENDPOINT || "/v1/kb/records";
  const token = options.token || process.env.KB_SYSTEM_TOKEN;
  const timeoutMs = Number(options.timeoutMs || process.env.KB_SYSTEM_TIMEOUT_MS || 15000);
  if (!baseUrl) throw new Error("KB_SYSTEM_URL is required");

  return {
    async publish(record, publishOptions = {}) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(new URL(endpoint, baseUrl), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": publishOptions.idempotencyKey || record.idempotency_key,
            ...(token ? { authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify(record),
          signal: controller.signal
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          const error = new Error(body.message || `KB System returned HTTP ${response.status}`);
          error.code = body.code || "KB_SYSTEM_HTTP_ERROR";
          throw error;
        }
        return body;
      } finally {
        clearTimeout(timer);
      }
    }
  };
}

module.exports = { createHttpKbSystemAdapter };
