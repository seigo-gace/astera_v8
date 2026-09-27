'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { EvidenceJobStore } = require('../src/evidence-search/recovery/job-store');
const { DurableEvidenceSpool } = require('../src/evidence-search/recovery/durable-spool');
const { EvidenceJobManager } = require('../src/evidence-search/recovery/job-manager');
const EvidenceSearchApiServer = require('../src/evidence-search/api/server');
const { createInternalHeaders } = require('../src/evidence-search/api/internal-auth');

const INTERNAL_SECRET = 'recovery-test-internal-secret-0000000000000000';

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
      callerId: 'caller-recovery',
      requestId: 'request-recovery',
      idempotencyKey: 'idempotency-recovery'
    });
    let job = started.job;
    job = value.manager.checkpoint(job, 'AUTHENTICATED', {
      request_id: job.request_id,
      caller_id: job.caller_id
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
      callerId: 'caller-idempotency',
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
        callerId: 'caller-idempotency',
        requestId: 'request-second',
        idempotencyKey: 'same-operation'
      }),
      (error) => error.code === 'EVIDENCE_JOB_LEASE_CONFLICT'
    );

    const same = value.store.createJob({
      callerId: 'caller-idempotency',
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
      callerId: 'caller-corruption',
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

test('terminal replay fails closed instead of replaying FINAL_JUDGED after terminal artifact corruption', async () => {
  const value = await runtime();
  let api;
  let moduleCalls = 0;
  try {
    const callerId = 'caller-terminal-replay-corruption';
    const idempotencyKey = 'terminal-replay-corruption-operation';
    const started = value.manager.begin({
      callerId,
      requestId: 'request-terminal-original',
      idempotencyKey
    });
    let job = started.job;
    job = value.manager.checkpoint(job, 'AUTHENTICATED', {
      request_id: job.request_id,
      caller_id: job.caller_id
    });
    job = value.manager.checkpoint(job, 'PLANNED', {
      query_plan_hash: 'b'.repeat(64)
    }, {
      effective_as_of: '2026-09-27T00:00:00.000Z',
      query_plan_hash: 'b'.repeat(64)
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
      evidence: [{ candidate_id: 'terminal-candidate' }],
      quality: {
        initial: { status: 'REINFORCEMENT_REQUIRED', score_bp: 8200 },
        final: { status: 'FINAL_VALID', score_bp: 9600 },
        reinforcement_attempt_count: 1
      },
      effective_as_of: '2026-09-27T00:00:00.000Z',
      query_plan_hash: 'b'.repeat(64)
    });
    assert.equal(terminal.state, 'FINAL_VALID');

    api = new EvidenceSearchApiServer({
      port: 0,
      host: '127.0.0.1',
      logger: { write() {}, async flush() {} },
      internalSecret: INTERNAL_SECRET,
      jobManager: value.manager,
      closeJobManagerOnStop: false,
      module: {
        async execute() {
          moduleCalls += 1;
          throw new Error('terminal replay must not execute the search module');
        }
      }
    });
    const validReplay = api._terminalReplay(terminal);
    assert.equal(validReplay.status, 'FINAL_VALID');
    assert.equal(validReplay.idempotent_replay, true);
    assert.equal(validReplay.evidence.length, 1);

    const terminalArtifact = value.store.listArtifacts(job.job_id)
      .find((artifact) => artifact.stage === 'FINAL_VALID');
    assert.ok(terminalArtifact);
    fs.appendFileSync(terminalArtifact.file_path, Buffer.from('corrupted-terminal'));

    const fallback = value.manager.readLatestValidCheckpoint(job.job_id);
    assert.equal(fallback.artifact.stage, 'FINAL_JUDGED');
    assert.equal(fallback.checkpoint.value.status, 'FINAL_VALID');
    assert.equal(fallback.failures[0].stage, 'FINAL_VALID');
    assert.equal(fallback.failures[0].code, 'RECOVERY_ARTIFACT_INVALID');

    api.start();
    await once(api.server, 'listening');
    const address = api.server.address();
    const requestBody = JSON.stringify({
      idempotency_key: idempotencyKey,
      paid_search: { enabled: false }
    });
    const headers = createInternalHeaders({
      body: requestBody,
      secret: INTERNAL_SECRET,
      service: 'astera-main',
      callerId,
      requestId: 'request-terminal-replay'
    });
    const response = await fetch(
      `http://127.0.0.1:${address.port}/internal/v1/evidence/search`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: requestBody
      }
    );
    const replay = await response.json();

    assert.equal(
      response.status,
      500,
      `corrupted terminal artifact must fail closed; received HTTP ${response.status}, idempotent_replay=${replay.idempotent_replay}, replay_status=${replay.status}, evidence_array=${Array.isArray(replay.evidence)}, quality_object=${Boolean(replay.quality)}`
    );
    assert.equal(replay.code, 'RECOVERY_ARTIFACT_INVALID');
    assert.equal(moduleCalls, 0);
    assert.equal(value.store.readJob(job.job_id).state, 'FINAL_VALID');
  } finally {
    if (api) await api.stop();
    await cleanup(value);
  }
});

test('terminal replay rejects a terminal-stage payload missing result contract fields', async () => {
  const value = await runtime();
  try {
    const started = value.manager.begin({
      callerId: 'caller-malformed-terminal',
      requestId: 'request-malformed-terminal',
      idempotencyKey: 'malformed-terminal-operation'
    });
    const terminal = value.manager.complete(started.job, {
      status: 'FINAL_VALID',
      effective_as_of: '2026-09-27T00:00:00.000Z',
      query_plan_hash: 'c'.repeat(64)
    });
    assert.equal(terminal.state, 'FINAL_VALID');
    const latest = value.manager.readLatestValidCheckpoint(terminal.job_id);
    assert.equal(latest.artifact.stage, 'FINAL_VALID');

    const api = new EvidenceSearchApiServer({
      port: 0,
      host: '127.0.0.1',
      logger: { write() {}, async flush() {} },
      internalSecret: INTERNAL_SECRET,
      jobManager: value.manager,
      closeJobManagerOnStop: false,
      module: { async execute() {} }
    });
    assert.throws(
      () => api._terminalReplay(terminal),
      (error) => error.code === 'RECOVERY_ARTIFACT_INVALID'
    );
  } finally {
    await cleanup(value);
  }
});

test('job store rejects backward transitions and stale CAS versions', async () => {
  const value = await runtime();
  try {
    const started = value.manager.begin({
      callerId: 'caller-cas',
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

test('checkpoint transition failure does not leave a future recovery artifact', async () => {
  const value = await runtime();
  try {
    const started = value.manager.begin({
      callerId: 'caller-checkpoint-skew',
      requestId: 'request-checkpoint-skew',
      idempotencyKey: 'checkpoint-skew-operation'
    });
    const authenticated = value.manager.checkpoint(
      started.job,
      'AUTHENTICATED',
      { authenticated: true }
    );
    const transitionError = Object.assign(new Error('injected PLANNED transition conflict'), {
      code: 'EVIDENCE_JOB_CAS_CONFLICT'
    });
    const transition = value.store.transition.bind(value.store);
    value.store.transition = (...args) => {
      if (args[2] === 'PLANNED') throw transitionError;
      return transition(...args);
    };

    let checkpointError;
    try {
      value.manager.checkpoint(authenticated, 'PLANNED', { query_plan_hash: 'd'.repeat(64) });
    } catch (error) {
      checkpointError = error;
    }

    const stored = value.store.readJob(authenticated.job_id);
    const artifacts = value.store.listArtifacts(authenticated.job_id);
    const latest = value.manager.readLatestValidCheckpoint(authenticated.job_id);
    const plannedFile = value.spool.artifactPath(
      authenticated.caller_id,
      authenticated.job_id,
      'PLANNED'
    );
    value.store.releaseLease(authenticated.job_id, value.manager.workerId);
    const recoverable = value.manager.recoverable()
      .find((entry) => entry.job.job_id === authenticated.job_id);

    assert.deepEqual({
      transition_error: checkpointError?.code,
      db_state: stored.state,
      artifact_stages: artifacts.map((artifact) => artifact.stage),
      planned_file_exists: fs.existsSync(plannedFile),
      latest_stage: latest.artifact?.stage,
      recoverable_state: recoverable?.job.state,
      recoverable_latest_stage: recoverable?.latest.artifact?.stage
    }, {
      transition_error: 'EVIDENCE_JOB_CAS_CONFLICT',
      db_state: 'AUTHENTICATED',
      artifact_stages: ['AUTHENTICATED'],
      planned_file_exists: false,
      latest_stage: 'AUTHENTICATED',
      recoverable_state: 'AUTHENTICATED',
      recoverable_latest_stage: 'AUTHENTICATED'
    });
  } finally {
    await cleanup(value);
  }
});

test('complete transition failure does not leave a terminal recovery artifact', async () => {
  const value = await runtime();
  try {
    const started = value.manager.begin({
      callerId: 'caller-complete-skew',
      requestId: 'request-complete-skew',
      idempotencyKey: 'complete-skew-operation'
    });
    const authenticated = value.manager.checkpoint(
      started.job,
      'AUTHENTICATED',
      { authenticated: true }
    );
    const transitionError = Object.assign(new Error('injected terminal transition conflict'), {
      code: 'EVIDENCE_JOB_CAS_CONFLICT'
    });
    const transition = value.store.transition.bind(value.store);
    value.store.transition = (...args) => {
      if (args[2] === 'FINAL_VALID') throw transitionError;
      return transition(...args);
    };

    let completeError;
    try {
      value.manager.complete(authenticated, {
        status: 'FINAL_VALID',
        evidence: [],
        quality: {
          initial: { score_bp: 10_000 },
          final: { score_bp: 10_000 },
          reinforcement_attempt_count: 0
        },
        effective_as_of: '2026-09-27T00:00:00.000Z',
        query_plan_hash: 'e'.repeat(64)
      });
    } catch (error) {
      completeError = error;
    }

    const stored = value.store.readJob(authenticated.job_id);
    const artifacts = value.store.listArtifacts(authenticated.job_id);
    const latest = value.manager.readLatestValidCheckpoint(authenticated.job_id);
    const terminalFile = value.spool.artifactPath(
      authenticated.caller_id,
      authenticated.job_id,
      'FINAL_VALID'
    );

    assert.deepEqual({
      transition_error: completeError?.code,
      db_state: stored.state,
      artifact_stages: artifacts.map((artifact) => artifact.stage),
      terminal_file_exists: fs.existsSync(terminalFile),
      latest_stage: latest.artifact?.stage,
      lease_owner: stored.lease_owner
    }, {
      transition_error: 'EVIDENCE_JOB_CAS_CONFLICT',
      db_state: 'AUTHENTICATED',
      artifact_stages: ['AUTHENTICATED'],
      terminal_file_exists: false,
      latest_stage: 'AUTHENTICATED',
      lease_owner: value.manager.workerId
    });
  } finally {
    await cleanup(value);
  }
});

test('API converts a complete transition failure to ERROR without retaining a terminal artifact', async () => {
  const value = await runtime();
  let api;
  try {
    const transitionError = Object.assign(new Error('injected terminal transition conflict'), {
      code: 'EVIDENCE_JOB_CAS_CONFLICT'
    });
    const transition = value.store.transition.bind(value.store);
    value.store.transition = (...args) => {
      if (args[2] === 'FINAL_VALID') throw transitionError;
      return transition(...args);
    };
    api = new EvidenceSearchApiServer({
      port: 0,
      host: '127.0.0.1',
      logger: { write() {}, async flush() {} },
      internalSecret: INTERNAL_SECRET,
      jobManager: value.manager,
      closeJobManagerOnStop: false,
      module: {
        async execute() {
          return {
            status: 'OK',
            operation: 'SEARCH_EVIDENCE',
            result: {
              status: 'FINAL_VALID',
              evidence: [],
              quality: {
                initial: { score_bp: 10_000 },
                final: { score_bp: 10_000 },
                reinforcement_attempt_count: 0
              },
              effective_as_of: '2026-09-27T00:00:00.000Z',
              query_plan_hash: 'f'.repeat(64),
              duration_ms: 0
            }
          };
        }
      }
    });
    api.start();
    await once(api.server, 'listening');
    const address = api.server.address();
    const callerId = 'caller-api-complete-skew';
    const requestBody = JSON.stringify({
      idempotency_key: 'api-complete-skew-operation',
      paid_search: { enabled: false }
    });
    const headers = createInternalHeaders({
      body: requestBody,
      secret: INTERNAL_SECRET,
      service: 'astera-main',
      callerId,
      requestId: 'request-api-complete-skew'
    });
    const response = await fetch(
      `http://127.0.0.1:${address.port}/internal/v1/evidence/search`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: requestBody
      }
    );
    const body = await response.json();
    const stored = value.store.readJob(body.jobId);
    const artifacts = value.store.listArtifacts(body.jobId);
    const terminalFile = value.spool.artifactPath(callerId, body.jobId, 'FINAL_VALID');

    assert.deepEqual({
      response_status: response.status,
      response_code: body.code,
      db_state: stored.state,
      error_code: stored.error_code,
      lease_owner: stored.lease_owner,
      artifact_stages: artifacts.map((artifact) => artifact.stage),
      terminal_file_exists: fs.existsSync(terminalFile)
    }, {
      response_status: 409,
      response_code: 'EVIDENCE_JOB_CAS_CONFLICT',
      db_state: 'ERROR',
      error_code: 'EVIDENCE_JOB_CAS_CONFLICT',
      lease_owner: null,
      artifact_stages: ['AUTHENTICATED', 'ERROR'],
      terminal_file_exists: false
    });
  } finally {
    if (api) await api.stop();
    await cleanup(value);
  }
});

test('checkpoint preserves the transition error and reports compensation failures', async () => {
  const value = await runtime();
  try {
    const started = value.manager.begin({
      callerId: 'caller-compensation-failure',
      requestId: 'request-compensation-failure',
      idempotencyKey: 'compensation-failure-operation'
    });
    const authenticated = value.manager.checkpoint(
      started.job,
      'AUTHENTICATED',
      { authenticated: true }
    );
    const transitionError = Object.assign(new Error('injected PLANNED transition conflict'), {
      code: 'EVIDENCE_JOB_CAS_CONFLICT'
    });
    const metadataCleanupError = Object.assign(new Error('injected metadata cleanup failure'), {
      code: 'INJECTED_METADATA_CLEANUP_FAILURE'
    });
    const fileCleanupError = Object.assign(new Error('injected file cleanup failure'), {
      code: 'INJECTED_FILE_CLEANUP_FAILURE'
    });
    const transition = value.store.transition.bind(value.store);
    value.store.transition = (...args) => {
      if (args[2] === 'PLANNED') throw transitionError;
      return transition(...args);
    };
    value.store.removeArtifact = () => {
      throw metadataCleanupError;
    };
    value.spool.remove = () => {
      throw fileCleanupError;
    };

    let checkpointError;
    try {
      value.manager.checkpoint(authenticated, 'PLANNED', { query_plan_hash: '0'.repeat(64) });
    } catch (error) {
      checkpointError = error;
    }

    assert.equal(checkpointError, transitionError);
    assert.deepEqual(
      checkpointError.cleanup_errors,
      [metadataCleanupError, fileCleanupError]
    );
    assert.equal(value.store.readJob(authenticated.job_id).state, 'AUTHENTICATED');
    assert.equal(
      value.manager.readLatestValidCheckpoint(authenticated.job_id).artifact.stage,
      'PLANNED'
    );
  } finally {
    await cleanup(value);
  }
});

test('job failure propagates an ERROR artifact spool failure after transitioning and releasing the lease', async () => {
  const value = await runtime();
  try {
    const started = value.manager.begin({
      callerId: 'caller-fail-spool-write',
      requestId: 'request-fail-spool-write',
      idempotencyKey: 'fail-spool-write-operation'
    });
    const authenticated = value.manager.checkpoint(
      started.job,
      'AUTHENTICATED',
      { authenticated: true }
    );
    assert.equal(value.store.readJob(authenticated.job_id).lease_owner, value.manager.workerId);

    const spoolError = Object.assign(new Error('injected ERROR artifact spool failure'), {
      code: 'INJECTED_SPOOL_WRITE_FAILURE'
    });
    value.spool.write = () => {
      throw spoolError;
    };
    const originalError = Object.assign(new Error('caller cancelled'), {
      code: 'SEARCH_CANCELLED'
    });

    assert.throws(
      () => value.manager.fail(authenticated, originalError),
      (error) => error === spoolError
    );

    const failed = value.store.readJob(authenticated.job_id);
    assert.equal(failed.state, 'ERROR');
    assert.equal(failed.error_code, 'SEARCH_CANCELLED');
    assert.equal(failed.lease_owner, null);
    assert.equal(failed.lease_until, null);
    assert.equal(
      value.store.listArtifacts(authenticated.job_id)
        .some((artifact) => artifact.stage === 'ERROR'),
      false
    );
  } finally {
    await cleanup(value);
  }
});

test('job failure persists its ERROR artifact and returns the failed job on the normal path', async () => {
  const value = await runtime();
  try {
    const started = value.manager.begin({
      callerId: 'caller-normal-fail',
      requestId: 'request-normal-fail',
      idempotencyKey: 'normal-fail-operation'
    });
    const authenticated = value.manager.checkpoint(
      started.job,
      'AUTHENTICATED',
      { authenticated: true }
    );
    const originalError = Object.assign(new Error('provider failed'), {
      code: 'PROVIDER_FAILED'
    });

    const failed = value.manager.fail(authenticated, originalError);

    assert.equal(failed.state, 'ERROR');
    assert.equal(failed.error_code, 'PROVIDER_FAILED');
    const persisted = value.store.readJob(authenticated.job_id);
    assert.equal(persisted.lease_owner, null);
    assert.equal(persisted.lease_until, null);
    const artifact = value.store.listArtifacts(authenticated.job_id)
      .find((item) => item.stage === 'ERROR');
    assert.ok(artifact);
    const checkpoint = value.spool.read(artifact);
    assert.equal(checkpoint.stage, 'ERROR');
    assert.equal(checkpoint.value.error_code, 'PROVIDER_FAILED');
    assert.equal(checkpoint.value.failed_state, 'AUTHENTICATED');
  } finally {
    await cleanup(value);
  }
});

test('job failure prioritizes an ERROR state transition error over an artifact error and still releases the lease', () => {
  const artifactError = Object.assign(new Error('artifact persistence failed'), {
    code: 'ARTIFACT_PERSISTENCE_FAILED'
  });
  const transitionError = Object.assign(new Error('ERROR state transition failed'), {
    code: 'EVIDENCE_JOB_CAS_CONFLICT'
  });
  let releaseCalls = 0;
  const manager = new EvidenceJobManager({
    workerId: 'error-precedence-worker',
    spool: {
      write() {
        throw artifactError;
      }
    },
    store: {
      readJob() {
        return {
          job_id: 'error-precedence-job',
          caller_id: 'error-precedence-caller',
          state: 'AUTHENTICATED',
          state_version: 1
        };
      },
      transition() {
        throw transitionError;
      },
      releaseLease() {
        releaseCalls += 1;
        return true;
      }
    }
  });

  assert.throws(
    () => manager.fail(
      { job_id: 'error-precedence-job' },
      Object.assign(new Error('search failed'), { code: 'PROVIDER_FAILED' })
    ),
    (error) => error === transitionError
  );
  assert.equal(releaseCalls, 1);
});

async function signedRecoverySearch({ api, callerId, requestId, idempotencyKey }) {
  const address = api.server.address();
  const body = JSON.stringify({
    idempotency_key: idempotencyKey,
    paid_search: { enabled: false }
  });
  const headers = createInternalHeaders({
    body,
    secret: INTERNAL_SECRET,
    service: 'astera-main',
    callerId,
    requestId
  });
  const response = await fetch(
    `http://127.0.0.1:${address.port}/internal/v1/evidence/search`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body
    }
  );
  return Object.freeze({ status: response.status, body: await response.json() });
}

async function observeTerminalReleaseFailure(terminalState) {
  const value = await runtime();
  const records = [];
  let api;
  let moduleCalls = 0;
  let releaseCalls = 0;
  const callerId = `caller-terminal-release-${terminalState.toLowerCase()}`;
  const firstRequestId = `request-terminal-release-first-${terminalState.toLowerCase()}`;
  const idempotencyKey = `terminal-release-${terminalState.toLowerCase()}`;
  const result = Object.freeze({
    status: terminalState,
    evidence: [],
    quality: {
      initial: { score_bp: terminalState === 'FINAL_VALID' ? 10_000 : 0 },
      final: { score_bp: terminalState === 'FINAL_VALID' ? 10_000 : 0 },
      reinforcement_attempt_count: 0
    },
    effective_as_of: '2026-09-27T00:00:00.000Z',
    query_plan_hash: terminalState === 'FINAL_VALID' ? '1'.repeat(64) : '2'.repeat(64),
    duration_ms: 0
  });

  try {
    value.store.releaseLease = () => {
      releaseCalls += 1;
      throw Object.assign(new Error('injected terminal lease release failure'), {
        code: 'INJECTED_LEASE_RELEASE_FAILURE'
      });
    };
    api = new EvidenceSearchApiServer({
      port: 0,
      host: '127.0.0.1',
      logger: {
        write(record) {
          records.push(record);
        },
        async flush() {}
      },
      internalSecret: INTERNAL_SECRET,
      jobManager: value.manager,
      closeJobManagerOnStop: false,
      module: {
        async execute() {
          moduleCalls += 1;
          return {
            status: 'OK',
            operation: 'SEARCH_EVIDENCE',
            result
          };
        }
      }
    });
    api.start();
    await once(api.server, 'listening');

    const first = await signedRecoverySearch({
      api,
      callerId,
      requestId: firstRequestId,
      idempotencyKey
    });
    const jobId = first.body.job_id || first.body.jobId;
    const stored = value.store.readJob(jobId);
    const artifacts = value.store.listArtifacts(jobId);
    const cleanupRecord = records.find(
      (record) => record.type === 'evidence_job_terminal_cleanup_failed'
    );
    const second = await signedRecoverySearch({
      api,
      callerId,
      requestId: `request-terminal-release-second-${terminalState.toLowerCase()}`,
      idempotencyKey
    });

    return Object.freeze({
      first_response_status: first.status,
      first_result_status: first.body.status,
      first_result_payload_unchanged:
        JSON.stringify(first.body.evidence) === JSON.stringify(result.evidence)
        && JSON.stringify(first.body.quality) === JSON.stringify(result.quality)
        && !Object.hasOwn(first.body, 'cleanup_error'),
      db_state: stored.state,
      terminal_artifact_persisted: artifacts.some(
        (artifact) => artifact.stage === terminalState
      ),
      lease_residual: stored.lease_owner === value.manager.workerId,
      release_calls: releaseCalls,
      cleanup_log: cleanupRecord ? {
        severity: cleanupRecord.severity,
        request_id: cleanupRecord.payload.request_id,
        job_id: cleanupRecord.payload.job_id,
        terminal_state: cleanupRecord.payload.terminal_state,
        error_code: cleanupRecord.payload.error_code
      } : null,
      second_response_status: second.status,
      second_result_status: second.body.status,
      second_idempotent_replay: second.body.idempotent_replay,
      same_job_id: second.body.job_id === jobId,
      module_calls: moduleCalls
    });
  } finally {
    if (api) await api.stop();
    await cleanup(value);
  }
}

for (const terminalState of ['FINAL_VALID', 'REJECTED']) {
  test(`terminal ${terminalState} result survives lease release failure and replays idempotently`, async () => {
    const observed = await observeTerminalReleaseFailure(terminalState);
    assert.deepEqual(observed, {
      first_response_status: 200,
      first_result_status: terminalState,
      first_result_payload_unchanged: true,
      db_state: terminalState,
      terminal_artifact_persisted: true,
      lease_residual: true,
      release_calls: 1,
      cleanup_log: {
        severity: 'error',
        request_id: `request-terminal-release-first-${terminalState.toLowerCase()}`,
        job_id: observed.cleanup_log?.job_id,
        terminal_state: terminalState,
        error_code: 'INJECTED_LEASE_RELEASE_FAILURE'
      },
      second_response_status: 200,
      second_result_status: terminalState,
      second_idempotent_replay: true,
      same_job_id: true,
      module_calls: 1
    });
    assert.match(observed.cleanup_log.job_id, /^evj_/);
  });
}

test('ERROR commit lease release failure preserves the original search error response', async () => {
  const value = await runtime();
  const records = [];
  let api;
  try {
    value.store.releaseLease = () => {
      throw Object.assign(new Error('injected ERROR lease release failure'), {
        code: 'INJECTED_FAIL_RELEASE_FAILURE'
      });
    };
    api = new EvidenceSearchApiServer({
      port: 0,
      host: '127.0.0.1',
      logger: {
        write(record) {
          records.push(record);
        },
        async flush() {}
      },
      internalSecret: INTERNAL_SECRET,
      jobManager: value.manager,
      closeJobManagerOnStop: false,
      module: {
        async execute() {
          throw Object.assign(new Error('evidence search cancelled by caller'), {
            code: 'SEARCH_CANCELLED',
            status: 499
          });
        }
      }
    });
    api.start();
    await once(api.server, 'listening');

    const response = await signedRecoverySearch({
      api,
      callerId: 'caller-error-release-failure',
      requestId: 'request-error-release-failure',
      idempotencyKey: 'error-release-failure'
    });
    const stored = value.store.readJob(response.body.jobId);
    const artifacts = value.store.listArtifacts(stored.job_id);
    const failureRecord = records.find(
      (record) => record.type === 'evidence_job_failure_record_failed'
    );

    assert.deepEqual({
      response_status: response.status,
      response_code: response.body.code,
      db_state: stored.state,
      db_error_code: stored.error_code,
      error_artifact_persisted: artifacts.some((artifact) => artifact.stage === 'ERROR'),
      lease_residual: stored.lease_owner === value.manager.workerId,
      failure_log_error_code: failureRecord?.payload.error_code
    }, {
      response_status: 499,
      response_code: 'SEARCH_CANCELLED',
      db_state: 'ERROR',
      db_error_code: 'SEARCH_CANCELLED',
      error_artifact_persisted: true,
      lease_residual: true,
      failure_log_error_code: 'INJECTED_FAIL_RELEASE_FAILURE'
    });
  } finally {
    if (api) await api.stop();
    await cleanup(value);
  }
});
