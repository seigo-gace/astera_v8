'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const TERMINAL_STATES = new Set([
  'FINAL_VALID',
  'REJECTED',
  'ERROR'
]);

const STATE_ORDER = Object.freeze([
  'RECEIVED',
  'AUTHENTICATED',
  'PLANNED',
  'INITIAL_SEARCH_COMPLETED',
  'INITIAL_JUDGED',
  'REINFORCEMENT_COMPLETED',
  'FINAL_JUDGED',
  'FINAL_VALID',
  'REJECTED',
  'ERROR'
]);

function nowIso(now = Date.now()) {
  return new Date(now).toISOString();
}

function loadDatabaseSync() {
  try {
    const { DatabaseSync } = require('node:sqlite');
    if (typeof DatabaseSync !== 'function') throw new Error('DatabaseSync unavailable');
    return DatabaseSync;
  } catch (cause) {
    const error = new Error('Evidence job store requires node:sqlite and does not support JSON fallback');
    error.code = 'EVIDENCE_STORE_UNAVAILABLE';
    error.cause = cause;
    throw error;
  }
}

function safeString(value, field, maximum = 512) {
  const text = String(value || '').trim();
  if (!text || text.length > maximum) {
    const error = new Error(`${field} is required and must be at most ${maximum} characters`);
    error.code = 'EVIDENCE_JOB_INVALID';
    throw error;
  }
  return text;
}

function assertState(state) {
  if (!STATE_ORDER.includes(state)) {
    const error = new Error(`invalid evidence job state: ${state}`);
    error.code = 'EVIDENCE_JOB_STATE_INVALID';
    throw error;
  }
}

function canTransition(from, to) {
  if (from === to) return true;
  if (TERMINAL_STATES.has(from)) return false;
  if (to === 'ERROR' || to === 'REJECTED') return true;
  return STATE_ORDER.indexOf(to) > STATE_ORDER.indexOf(from);
}

class EvidenceJobStore {
  constructor(filePath = process.env.ASTERA_EVIDENCE_DB || '/data/evidence-search.db') {
    const DatabaseSync = loadDatabaseSync();
    this.filePath = path.resolve(filePath);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(this.filePath);
    this.db.exec('PRAGMA journal_mode=WAL');
    this.db.exec('PRAGMA synchronous=FULL');
    this.db.exec('PRAGMA foreign_keys=ON');
    this.db.exec('PRAGMA busy_timeout=5000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS evidence_jobs (
        job_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        request_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        state TEXT NOT NULL,
        state_version INTEGER NOT NULL DEFAULT 0,
        effective_as_of TEXT,
        query_plan_hash TEXT,
        initial_score_bp INTEGER,
        final_score_bp INTEGER,
        reinforcement_attempt_count INTEGER NOT NULL DEFAULT 0,
        lease_owner TEXT,
        lease_until TEXT,
        error_code TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        UNIQUE(tenant_id, idempotency_key)
      );

      CREATE INDEX IF NOT EXISTS idx_evidence_jobs_tenant_request
        ON evidence_jobs(tenant_id, request_id);
      CREATE INDEX IF NOT EXISTS idx_evidence_jobs_state_lease
        ON evidence_jobs(state, lease_until);

      CREATE TABLE IF NOT EXISTS evidence_artifacts (
        job_id TEXT NOT NULL,
        stage TEXT NOT NULL,
        file_path TEXT NOT NULL,
        ciphertext_sha256 TEXT NOT NULL,
        plaintext_sha256 TEXT NOT NULL,
        schema_version TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(job_id, stage),
        FOREIGN KEY(job_id) REFERENCES evidence_jobs(job_id) ON DELETE CASCADE
      );
    `);
    this.statements = {
      insertJob: this.db.prepare(`
        INSERT INTO evidence_jobs(
          job_id, tenant_id, request_id, idempotency_key,
          state, state_version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'RECEIVED', 0, ?, ?)
      `),
      readJob: this.db.prepare('SELECT * FROM evidence_jobs WHERE job_id = ?'),
      readByIdempotency: this.db.prepare(
        'SELECT * FROM evidence_jobs WHERE tenant_id = ? AND idempotency_key = ?'
      ),
      transition: this.db.prepare(`
        UPDATE evidence_jobs SET
          state = ?,
          state_version = state_version + 1,
          effective_as_of = COALESCE(?, effective_as_of),
          query_plan_hash = COALESCE(?, query_plan_hash),
          initial_score_bp = COALESCE(?, initial_score_bp),
          final_score_bp = COALESCE(?, final_score_bp),
          reinforcement_attempt_count = COALESCE(?, reinforcement_attempt_count),
          error_code = COALESCE(?, error_code),
          updated_at = ?,
          completed_at = CASE WHEN ? IN ('FINAL_VALID','REJECTED','ERROR') THEN ? ELSE completed_at END
        WHERE job_id = ? AND state_version = ?
      `),
      upsertArtifact: this.db.prepare(`
        INSERT INTO evidence_artifacts(
          job_id, stage, file_path, ciphertext_sha256,
          plaintext_sha256, schema_version, size_bytes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(job_id, stage) DO UPDATE SET
          file_path = excluded.file_path,
          ciphertext_sha256 = excluded.ciphertext_sha256,
          plaintext_sha256 = excluded.plaintext_sha256,
          schema_version = excluded.schema_version,
          size_bytes = excluded.size_bytes,
          created_at = excluded.created_at
      `),
      listArtifacts: this.db.prepare(
        'SELECT * FROM evidence_artifacts WHERE job_id = ? ORDER BY created_at ASC, stage ASC'
      ),
      acquireLease: this.db.prepare(`
        UPDATE evidence_jobs SET
          lease_owner = ?,
          lease_until = ?,
          updated_at = ?
        WHERE job_id = ?
          AND state NOT IN ('FINAL_VALID','REJECTED','ERROR')
          AND (lease_until IS NULL OR lease_until < ? OR lease_owner = ?)
      `),
      releaseLease: this.db.prepare(`
        UPDATE evidence_jobs SET lease_owner = NULL, lease_until = NULL, updated_at = ?
        WHERE job_id = ? AND lease_owner = ?
      `),
      listRecoverable: this.db.prepare(`
        SELECT * FROM evidence_jobs
        WHERE state NOT IN ('FINAL_VALID','REJECTED','ERROR')
          AND (lease_until IS NULL OR lease_until < ?)
        ORDER BY updated_at ASC
        LIMIT ?
      `)
    };
  }

  transaction(callback) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = callback();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  createJob({ tenantId, requestId, idempotencyKey, jobId = `evj_${crypto.randomUUID()}` }) {
    const tenant = safeString(tenantId, 'tenantId', 128);
    const request = safeString(requestId, 'requestId', 128);
    const idempotency = safeString(idempotencyKey || requestId, 'idempotencyKey', 256);
    const id = safeString(jobId, 'jobId', 128);
    const timestamp = nowIso();

    return this.transaction(() => {
      const existing = this.statements.readByIdempotency.get(tenant, idempotency);
      if (existing) return Object.freeze({ ...existing, reused: true });
      this.statements.insertJob.run(
        id,
        tenant,
        request,
        idempotency,
        timestamp,
        timestamp
      );
      return Object.freeze({ ...this.statements.readJob.get(id), reused: false });
    });
  }

  readJob(jobId) {
    const row = this.statements.readJob.get(safeString(jobId, 'jobId', 128));
    return row ? Object.freeze({ ...row }) : null;
  }

  transition(jobId, expectedVersion, nextState, patch = {}) {
    assertState(nextState);
    const id = safeString(jobId, 'jobId', 128);
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
      throw Object.assign(new Error('expectedVersion must be a non-negative safe integer'), {
        code: 'EVIDENCE_JOB_VERSION_INVALID'
      });
    }

    return this.transaction(() => {
      const current = this.statements.readJob.get(id);
      if (!current) {
        throw Object.assign(new Error(`evidence job not found: ${id}`), {
          code: 'EVIDENCE_JOB_NOT_FOUND'
        });
      }
      if (current.state_version !== expectedVersion) {
        throw Object.assign(new Error('evidence job state version conflict'), {
          code: 'EVIDENCE_JOB_CAS_CONFLICT'
        });
      }
      if (!canTransition(current.state, nextState)) {
        throw Object.assign(new Error(`invalid state transition ${current.state} -> ${nextState}`), {
          code: 'EVIDENCE_JOB_TRANSITION_INVALID'
        });
      }

      const timestamp = nowIso();
      const result = this.statements.transition.run(
        nextState,
        patch.effective_as_of ?? null,
        patch.query_plan_hash ?? null,
        patch.initial_score_bp ?? null,
        patch.final_score_bp ?? null,
        patch.reinforcement_attempt_count ?? null,
        patch.error_code ?? null,
        timestamp,
        nextState,
        timestamp,
        id,
        expectedVersion
      );
      if (result.changes !== 1) {
        throw Object.assign(new Error('evidence job transition lost CAS race'), {
          code: 'EVIDENCE_JOB_CAS_CONFLICT'
        });
      }
      return Object.freeze({ ...this.statements.readJob.get(id) });
    });
  }

  recordArtifact(record) {
    const timestamp = nowIso();
    this.statements.upsertArtifact.run(
      safeString(record.job_id, 'job_id', 128),
      safeString(record.stage, 'stage', 128),
      safeString(record.file_path, 'file_path', 4096),
      safeString(record.ciphertext_sha256, 'ciphertext_sha256', 64),
      safeString(record.plaintext_sha256, 'plaintext_sha256', 64),
      safeString(record.schema_version, 'schema_version', 128),
      Number(record.size_bytes),
      record.created_at || timestamp
    );
    return Object.freeze({ ...record, created_at: record.created_at || timestamp });
  }

  listArtifacts(jobId) {
    return Object.freeze(
      this.statements.listArtifacts.all(safeString(jobId, 'jobId', 128))
        .map((row) => Object.freeze({ ...row }))
    );
  }

  acquireLease(jobId, owner, durationMs = 30_000, now = Date.now()) {
    const id = safeString(jobId, 'jobId', 128);
    const leaseOwner = safeString(owner, 'owner', 128);
    const nowText = nowIso(now);
    const until = nowIso(now + Math.max(1000, Number(durationMs)));
    const result = this.statements.acquireLease.run(
      leaseOwner,
      until,
      nowText,
      id,
      nowText,
      leaseOwner
    );
    return result.changes === 1;
  }

  releaseLease(jobId, owner) {
    const result = this.statements.releaseLease.run(
      nowIso(),
      safeString(jobId, 'jobId', 128),
      safeString(owner, 'owner', 128)
    );
    return result.changes === 1;
  }

  listRecoverable(limit = 100, now = Date.now()) {
    return Object.freeze(
      this.statements.listRecoverable.all(nowIso(now), Math.max(1, Math.min(1000, Number(limit))))
        .map((row) => Object.freeze({ ...row }))
    );
  }

  close() {
    this.db.close();
  }
}

module.exports = {
  EvidenceJobStore,
  STATE_ORDER,
  TERMINAL_STATES,
  canTransition
};
