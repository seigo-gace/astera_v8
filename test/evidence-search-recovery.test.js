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
const {
  DEFAULT_LEASE_DURATION_MS,
  MAX_LEASE_DURATION_MS,
  EvidenceJobManager,
  leaseDurationForDeadline
} = require('../src/evidence-search/recovery/job-manager');
const EvidenceSearchApiServer = require('../src/evidence-search/api/server');
const createEvidenceSearchModule = require('../src/evidence-search');
const {
  createJsonProjectionProvider
} = require('../src/evidence-search/providers/json-projection-provider');
const { createInternalHeaders, sha256 } = require('../src/evidence-search/api/internal-auth');

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

function recoveryRequestBody(idempotencyKey, payload = {}) {
  return JSON.stringify({
    idempotency_key: idempotencyKey,
    paid_search: { enabled: false },
    ...payload
  });
}

async function signedRecoverySearch({ api, callerId, requestId, idempotencyKey, payload }) {
  const address = api.server.address();
  const body = recoveryRequestBody(idempotencyKey, payload);
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

test('same manager rejects a concurrent idempotent request and replays the terminal result', async () => {
  const value = await runtime();
  let api;
  let releaseFirst;
  let markFirstEntered;
  let moduleCalls = 0;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const firstEntered = new Promise((resolve) => {
    markFirstEntered = resolve;
  });
  const callerId = 'caller-same-manager-concurrency';
  const idempotencyKey = 'same-manager-concurrency-operation';
  const result = Object.freeze({
    status: 'FINAL_VALID',
    evidence: [],
    quality: {
      initial: { score_bp: 10_000 },
      final: { score_bp: 10_000 },
      reinforcement_attempt_count: 0
    },
    effective_as_of: '2026-09-27T00:00:00.000Z',
    query_plan_hash: '7'.repeat(64),
    duration_ms: 0
  });
  let firstRequest;

  try {
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
          if (moduleCalls === 1) {
            markFirstEntered();
            await firstGate;
          }
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

    firstRequest = signedRecoverySearch({
      api,
      callerId,
      requestId: 'request-same-manager-A',
      idempotencyKey
    });
    await firstEntered;

    const second = await signedRecoverySearch({
      api,
      callerId,
      requestId: 'request-same-manager-B',
      idempotencyKey
    });
    assert.deepEqual({
      status: second.status,
      code: second.body.code,
      module_calls: moduleCalls
    }, {
      status: 409,
      code: 'EVIDENCE_JOB_LEASE_CONFLICT',
      module_calls: 1
    });

    releaseFirst();
    const first = await firstRequest;
    assert.equal(first.status, 200);
    assert.equal(first.body.status, 'FINAL_VALID');

    const terminalRetry = await signedRecoverySearch({
      api,
      callerId,
      requestId: 'request-same-manager-C',
      idempotencyKey
    });
    assert.deepEqual({
      status: terminalRetry.status,
      state: terminalRetry.body.status,
      same_job_id: terminalRetry.body.job_id === first.body.job_id,
      idempotent_replay: terminalRetry.body.idempotent_replay,
      module_calls: moduleCalls
    }, {
      status: 200,
      state: 'FINAL_VALID',
      same_job_id: true,
      idempotent_replay: true,
      module_calls: 1
    });
  } finally {
    releaseFirst();
    await firstRequest?.catch(() => {});
    if (api) await api.stop();
    await cleanup(value);
  }
});

test('active leases reject every owner and expired leases can be reacquired', async () => {
  const value = await runtime();
  try {
    const job = value.store.createJob({
      callerId: 'caller-lease-expiration',
      requestId: 'request-lease-expiration',
      idempotencyKey: 'lease-expiration-operation'
    });
    assert.equal(value.store.acquireLease(job.job_id, 'first-owner', 1000, 10_000), true);
    assert.equal(value.store.acquireLease(job.job_id, 'first-owner', 1000, 10_500), false);
    assert.equal(value.store.acquireLease(job.job_id, 'second-owner', 1000, 10_500), false);
    assert.equal(value.store.acquireLease(job.job_id, 'second-owner', 1000, 11_001), true);
  } finally {
    await cleanup(value);
  }
});

test('lease duration policy covers every valid search deadline with a bounded margin', () => {
  assert.deepEqual({
    default_lease: leaseDurationForDeadline(undefined),
    lease_for_8000: leaseDurationForDeadline(8000),
    lease_for_60000: leaseDurationForDeadline(60_000),
    lease_for_numeric_string: leaseDurationForDeadline('60000'),
    invalid_too_small: leaseDurationForDeadline(999),
    invalid_too_large: leaseDurationForDeadline(60_001),
    invalid_fraction: leaseDurationForDeadline(8000.5),
    max_lease: MAX_LEASE_DURATION_MS
  }, {
    default_lease: 30_000,
    lease_for_8000: 30_000,
    lease_for_60000: 65_000,
    lease_for_numeric_string: 65_000,
    invalid_too_small: 30_000,
    invalid_too_large: 30_000,
    invalid_fraction: 30_000,
    max_lease: 65_000
  });
  assert.equal(DEFAULT_LEASE_DURATION_MS, 30_000);
});

test('deadline-sized lease prevents same-worker reentry after the old lease equivalent expires', async () => {
  const value = await runtime();
  let api;
  let releaseFirst;
  let markFirstEntered;
  let moduleCalls = 0;
  const requestedLeaseDurations = [];
  const realStartedAt = Date.now();
  const logicalStartedAt = Date.now();
  const acquireLease = value.store.acquireLease.bind(value.store);
  value.store.acquireLease = (jobId, owner, durationMs) => {
    requestedLeaseDurations.push(durationMs);
    const scaledDurationMs = Number(durationMs) > 30_000 ? 10_000 : 1000;
    const logicalNow = logicalStartedAt + ((Date.now() - realStartedAt) * 10);
    return acquireLease(jobId, owner, scaledDurationMs, logicalNow);
  };
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const firstEntered = new Promise((resolve) => {
    markFirstEntered = resolve;
  });
  const callerId = 'caller-deadline-sized-lease';
  const idempotencyKey = 'deadline-sized-lease-operation';
  const result = Object.freeze({
    status: 'FINAL_VALID',
    evidence: [],
    quality: {
      initial: { score_bp: 10_000 },
      final: { score_bp: 10_000 },
      reinforcement_attempt_count: 0
    },
    effective_as_of: '2026-09-27T06:00:00.000Z',
    query_plan_hash: '8'.repeat(64),
    duration_ms: 0
  });
  let firstRequest;

  try {
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
          if (moduleCalls === 1) {
            markFirstEntered();
            await firstGate;
          }
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

    firstRequest = signedRecoverySearch({
      api,
      callerId,
      requestId: 'request-deadline-sized-A',
      idempotencyKey,
      payload: { deadline_ms: 60_000 }
    });
    await firstEntered;
    await new Promise((resolve) => setTimeout(resolve, 150));

    const second = await signedRecoverySearch({
      api,
      callerId,
      requestId: 'request-deadline-sized-B',
      idempotencyKey,
      payload: { deadline_ms: 60_000 }
    });
    assert.deepEqual({
      status: second.status,
      code: second.body.code,
      module_calls: moduleCalls,
      requested_lease_durations: requestedLeaseDurations
    }, {
      status: 409,
      code: 'EVIDENCE_JOB_LEASE_CONFLICT',
      module_calls: 1,
      requested_lease_durations: [65_000, 65_000]
    });

    releaseFirst();
    const first = await firstRequest;
    assert.equal(first.status, 200);
    assert.equal(first.body.status, 'FINAL_VALID');

    const replay = await signedRecoverySearch({
      api,
      callerId,
      requestId: 'request-deadline-sized-C',
      idempotencyKey,
      payload: { deadline_ms: 60_000 }
    });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.job_id, first.body.job_id);
    assert.equal(replay.body.idempotent_replay, true);
    assert.equal(moduleCalls, 1);
  } finally {
    releaseFirst();
    await firstRequest?.catch(() => {});
    if (api) await api.stop();
    await cleanup(value);
  }
});

test('caller cancellation releases an extended lease immediately', async () => {
  const value = await runtime();
  try {
    const started = value.manager.begin({
      callerId: 'caller-extended-lease-cancel',
      requestId: 'request-extended-lease-cancel',
      idempotencyKey: 'extended-lease-cancel-operation',
      leaseDurationMs: 65_000
    });
    const authenticated = value.manager.checkpoint(
      started.job,
      'AUTHENTICATED',
      { authenticated: true }
    );
    const cancelled = value.manager.fail(
      authenticated,
      Object.assign(new Error('caller cancelled'), {
        code: 'SEARCH_CANCELLED',
        status: 499
      })
    );
    assert.equal(cancelled.state, 'ERROR');
    assert.equal(cancelled.error_code, 'SEARCH_CANCELLED');
    const persisted = value.store.readJob(cancelled.job_id);
    assert.equal(persisted.lease_owner, null);
    assert.equal(persisted.lease_until, null);
  } finally {
    await cleanup(value);
  }
});

const RECOVERY_EFFECTIVE_AS_OF = '2026-09-27T05:00:00.000Z';
const RECOVERY_PAYLOAD = Object.freeze({
  question: 'Node.js 22 crash recovery evidence',
  domain_lens: { id: 'G29', taxonomy_version: '1.0.0' },
  conditions: [{
    condition_id: 'core_claim',
    class: 'CORE',
    field: 'fields.claim',
    operator: 'EQ',
    expected_value: 'Node.js 22 is supported',
    required: true
  }],
  search: { free_projection: true, free_current: true, free_general_web: true },
  maximum_results: 16,
  deadline_ms: 8000
});

function recoveryRecord({ id, authority, role, family, capability = 'projection_search' }) {
  return {
    canonical_record_id: id,
    canonical_url: `https://example.test/${id}`,
    authority_id: authority,
    publisher_id: authority,
    publisher_name: authority,
    source_role: role,
    source_family_id: family,
    capability_id: capability,
    title: `Node.js 22 crash recovery evidence from ${authority}`,
    excerpt: `${authority} independently confirms Node.js 22 support.`,
    language: 'en',
    updated_at: RECOVERY_EFFECTIVE_AS_OF,
    version: '22.0.0',
    revision_id: `${id}-revision-1`,
    retrieval_trace: { current_pointer_verified: true },
    rights: { access: 'public', reuse: 'allowed' },
    fields: { domain_id: 'G29', claim: 'Node.js 22 is supported' },
    lineage_fingerprint: {
      authority_id: authority,
      publisher_id: authority,
      origin_record_id: id,
      publication_event_id: `${id}-publication`
    }
  };
}

function recoveryProvider(options, counter, counters) {
  const provider = createJsonProjectionProvider(options);
  return {
    ...provider,
    async search(...args) {
      counters[counter] += 1;
      return provider.search(...args);
    }
  };
}

function recoveryModuleFixture(options = {}) {
  const counters = {
    module: 0,
    initial_provider: 0,
    reinforcement_provider: 0,
    initial_evaluator: 0,
    final_evaluator: 0
  };
  const providers = [
    recoveryProvider({
      provider_id: 'recovery-projection-primary',
      source_class: 'FREE_PROJECTION',
      source_family_id: 'recovery-family-primary',
      capabilities: ['NO_REINFORCEMENT'],
      domains: ['G29'],
      records: [recoveryRecord({
        id: 'recovery-primary-record',
        authority: 'recovery-authority-primary',
        role: 'PRIMARY',
        family: 'recovery-family-primary'
      })]
    }, 'initial_provider', counters),
    recoveryProvider({
      provider_id: 'recovery-official-current',
      source_class: 'FREE_OFFICIAL_LIVE',
      source_family_id: 'recovery-family-official',
      capabilities: ['NO_REINFORCEMENT'],
      domains: ['G29'],
      records: [recoveryRecord({
        id: 'recovery-official-record',
        authority: 'recovery-authority-official',
        role: 'OFFICIAL',
        family: 'recovery-family-official'
      })]
    }, 'initial_provider', counters),
    recoveryProvider({
      provider_id: 'recovery-independent-reinforcement',
      source_class: 'FREE_OFFICIAL_LIVE',
      source_family_id: 'recovery-family-independent',
      capabilities: ['REINFORCEMENT_ONLY'],
      domains: ['G29'],
      records: [recoveryRecord({
        id: 'recovery-independent-record',
        authority: 'recovery-authority-independent',
        role: 'OFFICIAL',
        family: 'recovery-family-independent',
        capability: 'independent_origin'
      })]
    }, 'reinforcement_provider', counters)
  ];
  const actualModule = createEvidenceSearchModule({
    providers,
    informationQualityEvaluator(request) {
      if (request.phase === 'INITIAL') {
        counters.initial_evaluator += 1;
        return {
          status: options.initialStatus || 'REINFORCEMENT_REQUIRED',
          score_bp: options.initialScoreBp ?? 8500
        };
      }
      counters.final_evaluator += 1;
      return { status: 'FINAL_VALID', score_bp: 9600 };
    }
  });
  const module = Object.freeze({
    async execute(request) {
      counters.module += 1;
      return actualModule.execute(request);
    }
  });
  return { module, counters };
}

function resetRecoveryCounters(counters) {
  for (const key of Object.keys(counters)) counters[key] = 0;
}

async function createCrashedRecoveryJob({
  value,
  module,
  crashStage,
  callerId,
  idempotencyKey,
  payload = RECOVERY_PAYLOAD
}) {
  const body = recoveryRequestBody(idempotencyKey, payload);
  const started = value.manager.begin({
    callerId,
    requestId: `request-crash-${crashStage.toLowerCase()}`,
    idempotencyKey
  });
  let activeJob = value.manager.checkpoint(
    started.job,
    'AUTHENTICATED',
    {
      request_id: started.job.request_id,
      caller_id: callerId,
      body_sha256: sha256(body),
      execution_time: RECOVERY_EFFECTIVE_AS_OF,
      domain_lens: payload.domain_lens,
      free_projection: true,
      free_current: true
    },
    { effective_as_of: RECOVERY_EFFECTIVE_AS_OF }
  );
  if (crashStage !== 'AUTHENTICATED') {
    const crash = Object.assign(new Error(`simulated crash after ${crashStage}`), {
      code: 'SIMULATED_PROCESS_CRASH'
    });
    await assert.rejects(
      module.execute({
        schema_version: 'astera.evidence-search.module-request.v1',
        operation: 'SEARCH_EVIDENCE',
        context: {
          caller_id: callerId,
          request_id: started.job.request_id,
          execution_time: RECOVERY_EFFECTIVE_AS_OF,
          effective_as_of: RECOVERY_EFFECTIVE_AS_OF,
          lifecycle: async (state, checkpointValue, patch) => {
            activeJob = value.manager.checkpoint(activeJob, state, checkpointValue, patch);
            if (state === crashStage) throw crash;
          }
        },
        payload: {
          ...payload,
          idempotency_key: idempotencyKey,
          caller_id: callerId,
          request_id: started.job.request_id,
          paid_search: { enabled: false }
        }
      }),
      (error) => error === crash
    );
  }
  const crashed = value.store.readJob(started.job.job_id);
  assert.equal(crashed.state, crashStage);
  value.store.db.prepare(
    'UPDATE evidence_jobs SET lease_until = ? WHERE job_id = ?'
  ).run('1970-01-01T00:00:00.000Z', crashed.job_id);
  return { body, job: value.store.readJob(crashed.job_id) };
}

async function startRecoveryApi({ value, module, logger = { write() {}, async flush() {} } }) {
  const api = new EvidenceSearchApiServer({
    port: 0,
    host: '127.0.0.1',
    logger,
    internalSecret: INTERNAL_SECRET,
    jobManager: value.manager,
    closeJobManagerOnStop: false,
    module
  });
  api.start();
  await once(api.server, 'listening');
  return api;
}

test('invalid search deadline uses the lease fallback and remains an invalid request', async () => {
  const value = await runtime();
  const fixture = recoveryModuleFixture();
  const requestedLeaseDurations = [];
  const acquireLease = value.store.acquireLease.bind(value.store);
  value.store.acquireLease = (jobId, owner, durationMs, now) => {
    requestedLeaseDurations.push(durationMs);
    return acquireLease(jobId, owner, durationMs, now);
  };
  let api;
  try {
    api = await startRecoveryApi({ value, module: fixture.module });
    const response = await signedRecoverySearch({
      api,
      callerId: 'caller-invalid-deadline-lease',
      requestId: 'request-invalid-deadline-lease',
      idempotencyKey: 'invalid-deadline-lease-operation',
      payload: { ...RECOVERY_PAYLOAD, deadline_ms: 60_001 }
    });
    const job = value.store.readJob(response.body.jobId);
    assert.deepEqual({
      status: response.status,
      code: response.body.code,
      requested_lease_durations: requestedLeaseDurations,
      db_state: job.state,
      lease_owner: job.lease_owner,
      lease_until: job.lease_until,
      initial_provider: fixture.counters.initial_provider,
      initial_evaluator: fixture.counters.initial_evaluator
    }, {
      status: 400,
      code: 'INVALID_SEARCH_REQUEST',
      requested_lease_durations: [30_000],
      db_state: 'ERROR',
      lease_owner: null,
      lease_until: null,
      initial_provider: 0,
      initial_evaluator: 0
    });
  } finally {
    if (api) await api.stop();
    await cleanup(value);
  }
});

const RECOVERY_EXPECTED_RERUNS = Object.freeze({
  AUTHENTICATED: {
    initial_provider: 2,
    initial_evaluator: 1,
    reinforcement_provider: 1,
    final_evaluator: 1
  },
  PLANNED: {
    initial_provider: 2,
    initial_evaluator: 1,
    reinforcement_provider: 1,
    final_evaluator: 1
  },
  INITIAL_SEARCH_COMPLETED: {
    initial_provider: 0,
    initial_evaluator: 1,
    reinforcement_provider: 1,
    final_evaluator: 1
  },
  INITIAL_JUDGED: {
    initial_provider: 0,
    initial_evaluator: 0,
    reinforcement_provider: 1,
    final_evaluator: 1
  },
  REINFORCEMENT_COMPLETED: {
    initial_provider: 0,
    initial_evaluator: 0,
    reinforcement_provider: 0,
    final_evaluator: 1
  },
  FINAL_JUDGED: {
    initial_provider: 0,
    initial_evaluator: 0,
    reinforcement_provider: 0,
    final_evaluator: 0
  }
});

test('request-driven durable recovery resumes every nonterminal checkpoint stage', async (t) => {
  for (const [stage, expectedReruns] of Object.entries(RECOVERY_EXPECTED_RERUNS)) {
    await t.test(stage, async () => {
      const value = await runtime();
      const fixture = recoveryModuleFixture();
      let api;
      try {
        const callerId = `caller-resume-${stage.toLowerCase()}`;
        const idempotencyKey = `resume-${stage.toLowerCase()}`;
        const crashed = await createCrashedRecoveryJob({
          value,
          module: fixture.module,
          crashStage: stage,
          callerId,
          idempotencyKey
        });
        resetRecoveryCounters(fixture.counters);
        api = await startRecoveryApi({ value, module: fixture.module });

        const response = await signedRecoverySearch({
          api,
          callerId,
          requestId: `request-resume-${stage.toLowerCase()}`,
          idempotencyKey,
          payload: RECOVERY_PAYLOAD
        });
        const terminal = value.store.readJob(crashed.job.job_id);
        const terminalArtifact = value.store.listArtifacts(crashed.job.job_id)
          .find((artifact) => artifact.stage === 'FINAL_VALID');
        const terminalCheckpoint = terminalArtifact
          ? value.spool.read(terminalArtifact)
          : null;

        assert.deepEqual({
          response_status: response.status,
          result_status: response.body.status,
          same_job_id: response.body.job_id === crashed.job.job_id,
          db_state: terminal.state,
          terminal_artifact: terminalCheckpoint?.stage,
          lease_owner: terminal.lease_owner,
          lease_until: terminal.lease_until,
          module_calls: fixture.counters.module,
          initial_provider: fixture.counters.initial_provider,
          initial_evaluator: fixture.counters.initial_evaluator,
          reinforcement_provider: fixture.counters.reinforcement_provider,
          final_evaluator: fixture.counters.final_evaluator
        }, {
          response_status: 200,
          result_status: 'FINAL_VALID',
          same_job_id: true,
          db_state: 'FINAL_VALID',
          terminal_artifact: 'FINAL_VALID',
          lease_owner: null,
          lease_until: null,
          module_calls: 1,
          ...expectedReruns
        });

        const replay = await signedRecoverySearch({
          api,
          callerId,
          requestId: `request-resume-replay-${stage.toLowerCase()}`,
          idempotencyKey,
          payload: RECOVERY_PAYLOAD
        });
        assert.equal(replay.status, 200);
        assert.equal(replay.body.job_id, crashed.job.job_id);
        assert.equal(replay.body.idempotent_replay, true);
        assert.equal(fixture.counters.module, 1);
      } finally {
        if (api) await api.stop();
        await cleanup(value);
      }
    });
  }
});

test('FINAL_JUDGED recovery does not require a skipped reinforcement checkpoint', async () => {
  const value = await runtime();
  const fixture = recoveryModuleFixture({
    initialStatus: 'REJECTED_BLOCKING',
    initialScoreBp: 7000
  });
  let api;
  try {
    const callerId = 'caller-resume-final-without-reinforcement';
    const idempotencyKey = 'resume-final-without-reinforcement';
    const crashed = await createCrashedRecoveryJob({
      value,
      module: fixture.module,
      crashStage: 'FINAL_JUDGED',
      callerId,
      idempotencyKey
    });
    assert.equal(
      value.store.listArtifacts(crashed.job.job_id)
        .some((artifact) => artifact.stage === 'REINFORCEMENT_COMPLETED'),
      false
    );
    resetRecoveryCounters(fixture.counters);
    api = await startRecoveryApi({ value, module: fixture.module });

    const response = await signedRecoverySearch({
      api,
      callerId,
      requestId: 'request-resume-final-without-reinforcement',
      idempotencyKey,
      payload: RECOVERY_PAYLOAD
    });
    assert.deepEqual({
      response_status: response.status,
      result_status: response.body.status,
      same_job_id: response.body.job_id === crashed.job.job_id,
      db_state: value.store.readJob(crashed.job.job_id).state,
      module_calls: fixture.counters.module,
      initial_provider: fixture.counters.initial_provider,
      initial_evaluator: fixture.counters.initial_evaluator,
      reinforcement_provider: fixture.counters.reinforcement_provider,
      final_evaluator: fixture.counters.final_evaluator
    }, {
      response_status: 200,
      result_status: 'REJECTED_BLOCKING',
      same_job_id: true,
      db_state: 'REJECTED',
      module_calls: 1,
      initial_provider: 0,
      initial_evaluator: 0,
      reinforcement_provider: 0,
      final_evaluator: 0
    });
  } finally {
    if (api) await api.stop();
    await cleanup(value);
  }
});

test('request mismatch leaves recovery state intact and the correct request can resume', async () => {
  const value = await runtime();
  const fixture = recoveryModuleFixture();
  let api;
  try {
    const callerId = 'caller-recovery-request-mismatch';
    const idempotencyKey = 'recovery-request-mismatch';
    const crashed = await createCrashedRecoveryJob({
      value,
      module: fixture.module,
      crashStage: 'PLANNED',
      callerId,
      idempotencyKey
    });
    const protectedArtifacts = new Map(
      value.store.listArtifacts(crashed.job.job_id)
        .map((artifact) => [artifact.stage, artifact.ciphertext_sha256])
    );
    resetRecoveryCounters(fixture.counters);
    api = await startRecoveryApi({ value, module: fixture.module });

    const mismatch = await signedRecoverySearch({
      api,
      callerId,
      requestId: 'request-recovery-mismatch',
      idempotencyKey,
      payload: { ...RECOVERY_PAYLOAD, question: 'modified recovery payload' }
    });
    assert.deepEqual({
      status: mismatch.status,
      code: mismatch.body.code,
      module_calls: fixture.counters.module,
      initial_provider: fixture.counters.initial_provider,
      initial_evaluator: fixture.counters.initial_evaluator,
      reinforcement_provider: fixture.counters.reinforcement_provider,
      final_evaluator: fixture.counters.final_evaluator,
      db_state: value.store.readJob(crashed.job.job_id).state,
      error_artifact: value.store.listArtifacts(crashed.job.job_id)
        .some((artifact) => artifact.stage === 'ERROR'),
      lease_owner: value.store.readJob(crashed.job.job_id).lease_owner,
      lease_until: value.store.readJob(crashed.job.job_id).lease_until
    }, {
      status: 409,
      code: 'EVIDENCE_RECOVERY_REQUEST_MISMATCH',
      module_calls: 0,
      initial_provider: 0,
      initial_evaluator: 0,
      reinforcement_provider: 0,
      final_evaluator: 0,
      db_state: 'PLANNED',
      error_artifact: false,
      lease_owner: null,
      lease_until: null
    });
    assert.deepEqual(
      new Map(value.store.listArtifacts(crashed.job.job_id)
        .map((artifact) => [artifact.stage, artifact.ciphertext_sha256])),
      protectedArtifacts
    );

    const retry = await signedRecoverySearch({
      api,
      callerId,
      requestId: 'request-recovery-mismatch-correct-retry',
      idempotencyKey,
      payload: RECOVERY_PAYLOAD
    });
    assert.deepEqual({
      status: retry.status,
      result_status: retry.body.status,
      same_job_id: retry.body.job_id === crashed.job.job_id,
      db_state: value.store.readJob(crashed.job.job_id).state,
      module_calls: fixture.counters.module,
      initial_provider: fixture.counters.initial_provider,
      initial_evaluator: fixture.counters.initial_evaluator,
      reinforcement_provider: fixture.counters.reinforcement_provider,
      final_evaluator: fixture.counters.final_evaluator
    }, {
      status: 200,
      result_status: 'FINAL_VALID',
      same_job_id: true,
      db_state: 'FINAL_VALID',
      module_calls: 1,
      initial_provider: 2,
      initial_evaluator: 1,
      reinforcement_provider: 1,
      final_evaluator: 1
    });
  } finally {
    if (api) await api.stop();
    await cleanup(value);
  }
});

test('recovery rejects a recomputed plan that differs from persisted plan identity', async () => {
  const value = await runtime();
  const fixture = recoveryModuleFixture();
  let api;
  try {
    const callerId = 'caller-recovery-plan-mismatch';
    const idempotencyKey = 'recovery-plan-mismatch';
    const crashed = await createCrashedRecoveryJob({
      value,
      module: fixture.module,
      crashStage: 'PLANNED',
      callerId,
      idempotencyKey
    });
    const originalPlanHash = crashed.job.query_plan_hash;
    const protectedArtifacts = new Map(
      value.store.listArtifacts(crashed.job.job_id)
        .map((artifact) => [artifact.stage, artifact.ciphertext_sha256])
    );
    value.store.db.prepare(
      'UPDATE evidence_jobs SET query_plan_hash = ? WHERE job_id = ?'
    ).run('f'.repeat(64), crashed.job.job_id);
    resetRecoveryCounters(fixture.counters);
    api = await startRecoveryApi({ value, module: fixture.module });

    const response = await signedRecoverySearch({
      api,
      callerId,
      requestId: 'request-recovery-plan-mismatch',
      idempotencyKey,
      payload: RECOVERY_PAYLOAD
    });
    assert.deepEqual({
      status: response.status,
      code: response.body.code,
      module_calls: fixture.counters.module,
      initial_provider: fixture.counters.initial_provider,
      initial_evaluator: fixture.counters.initial_evaluator,
      reinforcement_provider: fixture.counters.reinforcement_provider,
      final_evaluator: fixture.counters.final_evaluator,
      db_state: value.store.readJob(crashed.job.job_id).state,
      error_artifact: value.store.listArtifacts(crashed.job.job_id)
        .some((artifact) => artifact.stage === 'ERROR'),
      lease_owner: value.store.readJob(crashed.job.job_id).lease_owner,
      lease_until: value.store.readJob(crashed.job.job_id).lease_until
    }, {
      status: 409,
      code: 'EVIDENCE_RECOVERY_PLAN_MISMATCH',
      module_calls: 1,
      initial_provider: 0,
      initial_evaluator: 0,
      reinforcement_provider: 0,
      final_evaluator: 0,
      db_state: 'PLANNED',
      error_artifact: false,
      lease_owner: null,
      lease_until: null
    });
    assert.deepEqual(
      new Map(value.store.listArtifacts(crashed.job.job_id)
        .map((artifact) => [artifact.stage, artifact.ciphertext_sha256])),
      protectedArtifacts
    );

    value.store.db.prepare(
      'UPDATE evidence_jobs SET query_plan_hash = ? WHERE job_id = ?'
    ).run(originalPlanHash, crashed.job.job_id);
    resetRecoveryCounters(fixture.counters);
    const retry = await signedRecoverySearch({
      api,
      callerId,
      requestId: 'request-recovery-plan-mismatch-correct-retry',
      idempotencyKey,
      payload: RECOVERY_PAYLOAD
    });
    assert.equal(retry.status, 200);
    assert.equal(retry.body.status, 'FINAL_VALID');
    assert.equal(retry.body.job_id, crashed.job.job_id);
    assert.deepEqual(fixture.counters, {
      module: 1,
      initial_provider: 2,
      reinforcement_provider: 1,
      initial_evaluator: 1,
      final_evaluator: 1
    });
  } finally {
    if (api) await api.stop();
    await cleanup(value);
  }
});

test('request mismatch remains authoritative when recovery lease cleanup fails', async () => {
  const value = await runtime();
  const fixture = recoveryModuleFixture();
  const records = [];
  let api;
  try {
    const callerId = 'caller-recovery-cleanup-failure';
    const idempotencyKey = 'recovery-cleanup-failure';
    const crashed = await createCrashedRecoveryJob({
      value,
      module: fixture.module,
      crashStage: 'PLANNED',
      callerId,
      idempotencyKey
    });
    value.store.releaseLease = () => {
      throw Object.assign(new Error('injected recovery lease cleanup failure'), {
        code: 'INJECTED_RECOVERY_CLEANUP_FAILURE'
      });
    };
    resetRecoveryCounters(fixture.counters);
    api = await startRecoveryApi({
      value,
      module: fixture.module,
      logger: {
        write(record) {
          records.push(record);
        },
        async flush() {}
      }
    });

    const response = await signedRecoverySearch({
      api,
      callerId,
      requestId: 'request-recovery-cleanup-failure',
      idempotencyKey,
      payload: { ...RECOVERY_PAYLOAD, question: 'modified recovery cleanup payload' }
    });
    const cleanupRecord = records.find(
      (record) => record.type === 'evidence_job_recovery_cleanup_failed'
    );
    assert.deepEqual({
      status: response.status,
      code: response.body.code,
      db_state: value.store.readJob(crashed.job.job_id).state,
      error_artifact: value.store.listArtifacts(crashed.job.job_id)
        .some((artifact) => artifact.stage === 'ERROR'),
      module_calls: fixture.counters.module,
      cleanup_log: cleanupRecord ? {
        request_id: cleanupRecord.payload.request_id,
        job_id: cleanupRecord.payload.job_id,
        error_code: cleanupRecord.payload.error_code
      } : null
    }, {
      status: 409,
      code: 'EVIDENCE_RECOVERY_REQUEST_MISMATCH',
      db_state: 'PLANNED',
      error_artifact: false,
      module_calls: 0,
      cleanup_log: {
        request_id: 'request-recovery-cleanup-failure',
        job_id: crashed.job.job_id,
        error_code: 'INJECTED_RECOVERY_CLEANUP_FAILURE'
      }
    });
  } finally {
    if (api) await api.stop();
    await cleanup(value);
  }
});

test('recovery fails closed when a required checkpoint is corrupt', async () => {
  const value = await runtime();
  const fixture = recoveryModuleFixture();
  let api;
  try {
    const callerId = 'caller-recovery-corrupt-checkpoint';
    const idempotencyKey = 'recovery-corrupt-checkpoint';
    const crashed = await createCrashedRecoveryJob({
      value,
      module: fixture.module,
      crashStage: 'INITIAL_JUDGED',
      callerId,
      idempotencyKey
    });
    const requiredArtifact = value.store.listArtifacts(crashed.job.job_id)
      .find((artifact) => artifact.stage === 'INITIAL_SEARCH_COMPLETED');
    fs.appendFileSync(requiredArtifact.file_path, Buffer.from('corrupt-recovery-checkpoint'));
    resetRecoveryCounters(fixture.counters);
    api = await startRecoveryApi({ value, module: fixture.module });

    const response = await signedRecoverySearch({
      api,
      callerId,
      requestId: 'request-recovery-corrupt-checkpoint',
      idempotencyKey,
      payload: RECOVERY_PAYLOAD
    });
    assert.deepEqual({
      status: response.status,
      code: response.body.code,
      module_calls: fixture.counters.module,
      initial_provider: fixture.counters.initial_provider,
      initial_evaluator: fixture.counters.initial_evaluator,
      reinforcement_provider: fixture.counters.reinforcement_provider,
      final_evaluator: fixture.counters.final_evaluator,
      db_state: value.store.readJob(crashed.job.job_id).state
    }, {
      status: 500,
      code: 'RECOVERY_ARTIFACT_INVALID',
      module_calls: 0,
      initial_provider: 0,
      initial_evaluator: 0,
      reinforcement_provider: 0,
      final_evaluator: 0,
      db_state: 'ERROR'
    });

    const replay = await signedRecoverySearch({
      api,
      callerId,
      requestId: 'request-recovery-corrupt-checkpoint-replay',
      idempotencyKey,
      payload: RECOVERY_PAYLOAD
    });
    assert.equal(replay.status, 500);
    assert.equal(replay.body.code, 'RECOVERY_ARTIFACT_INVALID');
    assert.equal(replay.body.idempotent_replay, true);
    assert.equal(fixture.counters.module, 0);
  } finally {
    if (api) await api.stop();
    await cleanup(value);
  }
});

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

async function observeErrorTerminalRetry({ name, errorFactory, expectedStatus, expectedCode }) {
  const value = await runtime();
  let api;
  let moduleCalls = 0;
  try {
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
          throw errorFactory();
        }
      }
    });
    api.start();
    await once(api.server, 'listening');
    const callerId = `caller-error-replay-${name}`;
    const idempotencyKey = `error-replay-${name}`;
    const first = await signedRecoverySearch({
      api,
      callerId,
      requestId: `request-error-replay-first-${name}`,
      idempotencyKey
    });
    const stored = value.store.readJob(first.body.jobId);
    const errorArtifact = value.store.listArtifacts(stored.job_id)
      .find((artifact) => artifact.stage === 'ERROR');
    const checkpoint = value.spool.read(errorArtifact);
    const recoverable = value.manager.recoverable()
      .some((entry) => entry.job.job_id === stored.job_id);
    const second = await signedRecoverySearch({
      api,
      callerId,
      requestId: `request-error-replay-second-${name}`,
      idempotencyKey
    });

    return Object.freeze({
      first_status: first.status,
      first_code: first.body.code,
      second_status: second.status,
      second_code: second.body.code,
      second_idempotent_replay: second.body.idempotent_replay,
      same_job_id: second.body.jobId === stored.job_id,
      module_calls: moduleCalls,
      db_state: stored.state,
      lease_owner: stored.lease_owner,
      recoverable,
      artifact_stage: errorArtifact.stage,
      artifact_value: checkpoint.value,
      expected_status: expectedStatus,
      expected_code: expectedCode
    });
  } finally {
    if (api) await api.stop();
    await cleanup(value);
  }
}

const errorReplayCases = [
  {
    name: 'cancelled',
    expectedStatus: 499,
    expectedCode: 'SEARCH_CANCELLED',
    message: 'evidence search cancelled by caller',
    errorFactory() {
      return Object.assign(new Error('evidence search cancelled by caller'), {
        code: 'SEARCH_CANCELLED',
        status: 499
      });
    }
  },
  {
    name: 'deadline',
    expectedStatus: 504,
    expectedCode: 'SEARCH_DEADLINE_EXCEEDED',
    message: 'evidence search deadline exceeded',
    errorFactory() {
      return Object.assign(new Error('evidence search deadline exceeded'), {
        code: 'SEARCH_DEADLINE_EXCEEDED'
      });
    }
  },
  {
    name: 'generic',
    expectedStatus: 500,
    expectedCode: 'INTERNAL_ERROR',
    message: 'injected generic internal failure',
    errorFactory() {
      return new Error('injected generic internal failure');
    }
  }
];

for (const replayCase of errorReplayCases) {
  test(`terminal ERROR replays ${replayCase.name} failure without rerunning the module`, async () => {
    const observed = await observeErrorTerminalRetry(replayCase);
    assert.deepEqual(observed, {
      first_status: replayCase.expectedStatus,
      first_code: replayCase.expectedCode,
      second_status: replayCase.expectedStatus,
      second_code: replayCase.expectedCode,
      second_idempotent_replay: true,
      same_job_id: true,
      module_calls: 1,
      db_state: 'ERROR',
      lease_owner: null,
      recoverable: false,
      artifact_stage: 'ERROR',
      artifact_value: {
        error_code: replayCase.expectedCode,
        message: replayCase.message,
        failed_state: 'AUTHENTICATED',
        status: replayCase.expectedStatus
      },
      expected_status: replayCase.expectedStatus,
      expected_code: replayCase.expectedCode
    });
  });
}

const legacyErrorReplayCases = [
  {
    name: 'cancelled',
    storedCode: 'SEARCH_CANCELLED',
    expectedCode: 'SEARCH_CANCELLED',
    expectedStatus: 499
  },
  {
    name: 'generic',
    storedCode: 'EVIDENCE_SEARCH_ERROR',
    expectedCode: 'INTERNAL_ERROR',
    expectedStatus: 500
  },
  {
    name: 'unknown',
    storedCode: 'LEGACY_UNKNOWN_FAILURE',
    expectedCode: 'LEGACY_UNKNOWN_FAILURE',
    expectedStatus: 500
  }
];

for (const legacyCase of legacyErrorReplayCases) {
  test(`legacy ERROR artifact without status replays ${legacyCase.name} failure fail-closed`, async () => {
    const value = await runtime();
    let api;
    let moduleCalls = 0;
    try {
      const callerId = `caller-legacy-error-${legacyCase.name}`;
      const idempotencyKey = `legacy-error-${legacyCase.name}`;
      const started = value.manager.begin({
        callerId,
        requestId: `request-legacy-error-original-${legacyCase.name}`,
        idempotencyKey
      });
      const authenticated = value.manager.checkpoint(
        started.job,
        'AUTHENTICATED',
        { authenticated: true }
      );
      const artifact = value.spool.write({
        callerId,
        jobId: authenticated.job_id,
        stage: 'ERROR',
        schemaVersion: 'astera.evidence-search.checkpoint.v1',
        value: {
          error_code: legacyCase.storedCode,
          message: `legacy ${legacyCase.name} failure`,
          failed_state: 'AUTHENTICATED'
        }
      });
      value.store.recordArtifact(artifact);
      value.store.transition(
        authenticated.job_id,
        authenticated.state_version,
        'ERROR',
        { error_code: legacyCase.storedCode }
      );
      value.store.releaseLease(authenticated.job_id, value.manager.workerId);

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
            throw new Error('legacy ERROR replay must not rerun the module');
          }
        }
      });
      api.start();
      await once(api.server, 'listening');
      const response = await signedRecoverySearch({
        api,
        callerId,
        requestId: `request-legacy-error-retry-${legacyCase.name}`,
        idempotencyKey
      });

      assert.deepEqual({
        status: response.status,
        code: response.body.code,
        job_id: response.body.jobId,
        idempotent_replay: response.body.idempotent_replay,
        module_calls: moduleCalls
      }, {
        status: legacyCase.expectedStatus,
        code: legacyCase.expectedCode,
        job_id: authenticated.job_id,
        idempotent_replay: true,
        module_calls: 0
      });
    } finally {
      if (api) await api.stop();
      await cleanup(value);
    }
  });
}
