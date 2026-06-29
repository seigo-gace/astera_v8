'use strict';

class RateLimiter {
  constructor({ maxBuckets = 10_000 } = {}) {
    this.buckets = new Map();
    this.maxBuckets = maxBuckets;
  }

  _prune(now = Date.now()) {
    if (this.buckets.size < this.maxBuckets) return;
    for (const [key, bucket] of this.buckets.entries()) {
      if (now >= bucket.resetAt) this.buckets.delete(key);
      if (this.buckets.size < this.maxBuckets) break;
    }
  }

  check({ key, limit, windowMs = 60_000 }) {
    const now = Date.now();
    this._prune(now);
    const bucketKey = `${key}:${windowMs}`;
    let bucket = this.buckets.get(bucketKey);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      this.buckets.set(bucketKey, bucket);
    }
    bucket.count += 1;
    return {
      allowed: bucket.count <= limit,
      remaining: Math.max(0, limit - bucket.count),
      resetAt: new Date(bucket.resetAt).toISOString(),
      limit
    };
  }
}

module.exports = RateLimiter;
