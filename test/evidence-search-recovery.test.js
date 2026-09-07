'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { EvidenceJobStore } = require('../src/evidence-search/recovery/job-store');
const { DurableEvidenceSpool } = require('../src/evidence-search/recovery/durable-spool');
const { EvidenceJobManager } = require('../src/evidence-search/recovery/job-manager');

async function runtime() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'astera-evidence-recovery-'));
  const store = new EvidenceJobStore(path.join(root, 'evidence-search.db'));
  const spool = new DurableEvidenceSpool({
    root: path.join(root, 'spool'),
    key: crypto.randomBytes(32)
  });
  const manager = new EvidenceJobManager({
    store,
    spool,
    workerId: 'recovery-test-worker'
  });
  return { root, store, spool, manager };
}

async function cleanup(value) {
  try { value.manager.close(); } catch {}
  await fsp.rm(value.root, { recursive: true, force: true });
}

test('job state, encrypted checkpoints, and terminal result survive reopen', async () => {
  const value = await runtime();
  const key = Buffer.from(value.spool.key);
  try {
    const started = value.manager.begin({
      tenantId: 'tenant-recovery',
      requestId: 'request-recovery',
      idempotencyKey: 'idempotency-recovery'
    });
    let job = started.job;
    job = value.manager.checkpoint(job, 'AUTHENTICATED', {
      request_id: job.request_id,
      tenant_id: job.tenant_id
    });
    job = value.manager.checkpoint(job, 'PLANNED', {
      query_plan_hash: 'a'.repeat(64)
    }, {
      effective_as_of: '2026-07-18T03:00:00.000Z',
      query_plan_hash: 'a'.repeat(64)
    });
    job = value.manager.checkpoint(job, 'INITIAL_SEARCH_COMPLETED', {
      candidate_count: 2
    });
    job = value.manager.checkpoint(job, 'INITIAL_JUDGED', {
      status: 'REINFORCEMENT_REQUIRED',
      score_bp: 8200
    }, {
      initial_score_bp: 8200
    });
    job = value.manager.checkpoint(job, 'REINFORCEMENT_COMPLETED', {
      new_corroboration_count: 1
    }, {
      reinforcement_attempt_count: 1
    });
    job = value.manager.checkpoint(job, 'FINAL_JUDGED', {
      status: 'FINAL_VALID',
      score_bp: 9600
    }, {
      final_score_bp: 9600,
      reinforcement_attempt_count: 1
    });
    const terminal = value.manager.complete(job, {
      status: 'FINAL_VALID',
      effective_as_of: '2026-07-18T03:00:00.000Z',
      query_plan_hash: 'a'.repeat(64),
      quality: {
        initial: { score_bp: 8200 },
        final: { score_bp: 9600 },
        reinforcement_attempt_count: 1
      },
      evidence: [{ candidate_id: 'candidate-1' }]
    });
    assert.equal(terminal.state, 'FINAL_VALID');
    assert.equal(terminal.initial_score_bp, 8200);
    assert.equal(terminal.final_score_bp, 9600);

    const latest = value.manager.readLatestValidCheckpoint(job.job_id);
    assert.equal(latest.artifact.stage, 'FINAL_VALID');
    assert.equal(latest.checkpoint.value.status, 'FINAL_VALID');
    assert.equal(latest.checkpoint.value.evidence.length, 1);

    value.manager.close();
    const reopenedStore = new EvidenceJobStore(path.join(value.root, 'evidence-search.db'));
    const reopenedSpool = new DurableEvidenceSpool({
      root: path.join(value.root, 'spool'),
      key
    });
    const reopened = new EvidenceJobManager({
      store: reopenedStore,
      spool: reopenedSpool,
      workerId: 'reopened-worker'
    });
    value.manager = reopened;
    const stored = reopenedStore.readJob(job.job_id);
    assert.equal(stored.state, 'FINAL_VALID');
    const restored = reopened.readLatestValidCheckpoint(job.job_id);
    assert.equal(restored.checkpoint.value.status, 'FINAL_VALID');
  } finally {
    await cleanup(value);
  }
});

test('idempotency reuses one job and lease prevents concurrent execution', async () => {
  const value = await runtime();
  try {
    const first = value.manager.begin({
      tenantId: 'tenant-idempotency',
      requestId: 'request-first',
      idempotencyKey: 'same-operation'
    });
    assert.equal(first.job.reused, undefined);

    const competingManager = new EvidenceJobManager({
      store: value.store,
      spool: value.spool,
      workerId: 'competing-worker'
    });
    assert.throws(
      () => competingManager.begin({
        tenantId: 'tenant-idempotency',
        requestId: 'request-second',
        idempotencyKey: 'same-operation'
      }),
      (error) => error.code === 'EVIDENCE_JOB_LEASE_CONFLICT'
    );

    const same = value.store.createJob({
      tenantId: 'tenant-idempotency',
      requestId: 'request-third',
      idempotencyKey: 'same-operation'
    });
    assert.equal(same.job_id, first.job.job_id);
    assert.equal(same.reused, true);
  } finally {
    await cleanup(value);
  }
});

test('recovery skips a corrupted newest checkpoint and returns the previous valid stage', async () => {
  const value = await runtime();
  try {
    const started = value.manager.begin({
      tenantId: 'tenant-corruption',
      requestId: 'request-corruption',
      idempotencyKey: 'corruption-operation'
    });
    let job = started.job;
    job = value.manager.checkpoint(job, 'AUTHENTICATED', { step: 1 });
    job = value.manager.checkpoint(job, 'PLANNED', { step: 2 });
    const artifacts = value.store.listArtifacts(job.job_id);
    const newest = artifacts.find((artifact) => artifact.stage === 'PLANNED');
    fs.appendFileSync(newest.file_path, Buffer.from('tampered'));

    const latest = value.manager.readLatestValidCheckpoint(job.job_id);
    assert.equal(latest.artifact.stage, 'AUTHENTICATED');
    assert.equal(latest.checkpoint.value.step, 1);
    assert.equal(latest.failures.length, 1);
    assert.equal(latest.failures[0].stage, 'PLANNED');
    assert.equal(latest.failures[0].code, 'RECOVERY_ARTIFACT_INVALID');
  } finally {
    await cleanup(value);
  }
});

test('job store rejects backward transitions and stale CAS versions', async () => {
  const value = await runtime();
  try {
    const started = value.manager.begin({
      tenantId: 'tenant-cas',
      requestId: 'request-cas',
      idempotencyKey: 'cas-operation'
    });
    const authenticated = value.manager.checkpoint(
      started.job,
      'AUTHENTICATED',
      { authenticated: true }
    );
    assert.throws(
      () => value.store.transition(
        authenticated.job_id,
        authenticated.state_version,
        'RECEIVED'
      ),
      (error) => error.code === 'EVIDENCE_JOB_TRANSITION_INVALID'
    );
    assert.throws(
      () => value.store.transition(
        authenticated.job_id,
        authenticated.state_version - 1,
        'PLANNED'
      ),
      (error) => error.code === 'EVIDENCE_JOB_CAS_CONFLICT'
    );
  } finally {
    await cleanup(value);
  }
});
