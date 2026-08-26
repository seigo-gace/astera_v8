'use strict';

const MAX_CANONICAL_CONCURRENCY = 8;

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function canonicalConcurrency(value, fallback = MAX_CANONICAL_CONCURRENCY) {
  return Math.min(
    MAX_CANONICAL_CONCURRENCY,
    positiveInteger(value, Math.min(MAX_CANONICAL_CONCURRENCY, positiveInteger(fallback, MAX_CANONICAL_CONCURRENCY)))
  );
}

module.exports = {
  MAX_CANONICAL_CONCURRENCY,
  positiveInteger,
  canonicalConcurrency
};
