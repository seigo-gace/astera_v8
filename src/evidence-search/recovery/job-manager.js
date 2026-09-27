'use strict';

const crypto = require('node:crypto');

const CHECKPOINT_SCHEMA = 'astera.evidence-search.checkpoint.v1';
const MIN_SEARCH_DEADLINE_MS = 1000;
const MAX_SEARCH_DEADLINE_MS = 60_000;
const DEFAULT_LEASE_DURATION_MS = 30_000;
const LEASE_SAFETY_MARGIN_MS = 5000;
const MAX_LEASE_DURATION_MS = MAX_SEARCH_DEADLINE_MS + LEASE_SAFETY_MARGIN_MS;

const LIFECYCLE_TO_JOB_STATE = Object.freeze({
  AUTHENTICATED: 'AUTHENTICATED',
  PLANNED: 'PLANNED',
  INITIAL_SEARCH_COMPLETED: 'INITIAL_SEARCH_COMPLETED',
  INITIAL_JUDGED: 'INITIAL_JUDGED',
  REINFORCEMENT_COMPLETED: 'REINFORCEMENT_COMPLETED',
  FINAL_JUDGED: 'FINAL_JUDGED'
});

const RECOVERY_STAGE_ORDER = Object.freeze([
  'AUTHENTICATED',
  'PLANNED',
  'INITIAL_SEARCH_COMPLETED',
  'INITIAL_JUDGED',
  'REINFORCEMENT_COMPLETED',
  'FINAL_JUDGED'
]);

function recoveryArtifactError(stage, cause) {
  const error = new Error(`required recovery checkpoint is missing or invalid: ${stage}`);
  error.code = 'RECOVERY_ARTIFACT_INVALID';
  if (cause) error.cause = cause;
  return error;
}

function terminalStateFromResult(status) {
  return status === 'FINAL_VALID' ? 'FINAL_VALID' : 'REJECTED';
}

function leaseDurationForDeadline(value) {
  const deadlineMs = Number(value);
  if (
    !Number.isSafeInteger(deadlineMs)
    || deadlineMs < MIN_SEARCH_DEADLINE_MS
    || deadlineMs > MAX_SEARCH_DEADLINE_MS
  ) {
    return DEFAULT_LEASE_DURATION_MS;
  }
  return Math.min(
    MAX_LEASE_DURATION_MS,
    Math.max(DEFAULT_LEASE_DURATION_MS, deadlineMs + LEASE_SAFETY_MARGIN_MS)
  );
}

class EvidenceJobManager {
  constructor({ store, spool, workerId = `worker_${process.pid}_${crypto.randomUUID()}` }) {
    if (!store) throw new TypeError('EvidenceJobManager requires store');
    if (!spool) throw new TypeError('EvidenceJobManager requires spool');
    this.store = store;
    this.spool = spool;
    this.workerId = String(workerId);
  }

  begin({
    callerId,
    requestId,
    idempotencyKey,
    leaseDurationMs = DEFAULT_LEASE_DURATION_MS
  }) {
    const job = this.store.createJob({
      callerId,
      requestId,
      idempotencyKey: idempotencyKey || requestId
    });
    if (job.reused && ['FINAL_VALID', 'REJECTED', 'ERROR'].includes(job.state)) {
      return Object.freeze({ job, reusedTerminal: true, reusedNonterminal: false });
    }
    if (!this.store.acquireLease(job.job_id, this.workerId, leaseDurationMs)) {
      const error = new Error('evidence job is already leased by another worker');
      error.code = 'EVIDENCE_JOB_LEASE_CONFLICT';
      throw error;
    }
    return Object.freeze({
      job: this.store.readJob(job.job_id),
      reusedTerminal: false,
      reusedNonterminal: job.reused === true
    });
  }

  _transitionWithArtifactCompensation(artifact, transition) {
    try {
      return transition();
    } catch (transitionError) {
      const cleanupErrors = [];
      try {
        this.store.removeArtifact(artifact.job_id, artifact.stage);
      } catch (error) {
        cleanupErrors.push(error);
      }
      try {
        this.spool.remove(artifact);
      } catch (error) {
        cleanupErrors.push(error);
      }
      if (cleanupErrors.length > 0) {
        Object.defineProperty(transitionError, 'cleanup_errors', {
          configurable: true,
          enumerable: true,
          value: Object.freeze(cleanupErrors)
        });
      }
      throw transitionError;
    }
  }

  checkpoint(job, lifecycleState, value, patch = {}) {
    const nextState = LIFECYCLE_TO_JOB_STATE[lifecycleState];
    if (!nextState) {
      const error = new Error(`unsupported evidence lifecycle checkpoint: ${lifecycleState}`);
      error.code = 'EVIDENCE_CHECKPOINT_STATE_INVALID';
      throw error;
    }
    const current = this.store.readJob(job.job_id);
    if (!current) {
      const error = new Error(`evidence job not found: ${job.job_id}`);
      error.code = 'EVIDENCE_JOB_NOT_FOUND';
      throw error;
    }
    if (current.state === nextState) return current;

    const artifact = this.spool.write({
      callerId: current.caller_id,
      jobId: current.job_id,
      stage: nextState,
      schemaVersion: CHECKPOINT_SCHEMA,
      value
    });
    this.store.recordArtifact(artifact);
    return this._transitionWithArtifactCompensation(
      artifact,
      () => this.store.transition(
        current.job_id,
        current.state_version,
        nextState,
        patch
      )
    );
  }

  lifecycle(job) {
    return async (state, value, patch = {}) => {
      return this.checkpoint(job, state, value, patch);
    };
  }

  complete(job, result, options = {}) {
    const current = this.store.readJob(job.job_id);
    if (!current) {
      const error = new Error(`evidence job not found: ${job.job_id}`);
      error.code = 'EVIDENCE_JOB_NOT_FOUND';
      throw error;
    }
    const terminalState = terminalStateFromResult(result.status);
    const artifact = this.spool.write({
      callerId: current.caller_id,
      jobId: current.job_id,
      stage: terminalState,
      schemaVersion: CHECKPOINT_SCHEMA,
      value: result
    });
    this.store.recordArtifact(artifact);
    const completed = this._transitionWithArtifactCompensation(
      artifact,
      () => this.store.transition(
        current.job_id,
        current.state_version,
        terminalState,
        {
          effective_as_of: result.effective_as_of || null,
          query_plan_hash: result.query_plan_hash || null,
          initial_score_bp: result.quality?.initial?.score_bp ?? null,
          final_score_bp: result.quality?.final?.score_bp ?? null,
          reinforcement_attempt_count:
            result.quality?.reinforcement_attempt_count ?? 0
        }
      )
    );
    try {
      this.store.releaseLease(current.job_id, this.workerId);
    } catch (error) {
      if (typeof options?.onTerminalCleanupFailure === 'function') {
        try {
          options.onTerminalCleanupFailure(Object.freeze({
            error,
            job: completed
          }));
        } catch {}
      }
    }
    return completed;
  }

  release(job) {
    const current = this.store.readJob(job.job_id);
    if (!current) {
      const error = new Error(`evidence job not found: ${job.job_id}`);
      error.code = 'EVIDENCE_JOB_NOT_FOUND';
      throw error;
    }
    if (!this.store.releaseLease(current.job_id, this.workerId)) {
      const error = new Error('evidence job lease is not owned by this worker');
      error.code = 'EVIDENCE_JOB_LEASE_RELEASE_FAILED';
      throw error;
    }
    return this.store.readJob(current.job_id);
  }

  fail(job, error, options = {}) {
    const current = this.store.readJob(job.job_id);
    if (!current || ['FINAL_VALID', 'REJECTED', 'ERROR'].includes(current.state)) {
      return current;
    }
    const errorCode = options?.errorCode || error.code || 'EVIDENCE_SEARCH_ERROR';
    const requestedStatus = Number(options?.status ?? error.status);
    const errorStatus = requestedStatus >= 400 && requestedStatus <= 599
      ? requestedStatus
      : null;
    let artifactError = null;
    try {
      const artifact = this.spool.write({
        callerId: current.caller_id,
        jobId: current.job_id,
        stage: 'ERROR',
        schemaVersion: CHECKPOINT_SCHEMA,
        value: {
          error_code: errorCode,
          message: error.message,
          failed_state: current.state,
          ...(errorStatus ? { status: errorStatus } : {})
        }
      });
      this.store.recordArtifact(artifact);
    } catch (error) {
      artifactError = error;
    }

    let failed = null;
    let transitionError = null;
    try {
      failed = this.store.transition(
        current.job_id,
        current.state_version,
        'ERROR',
        { error_code: errorCode }
      );
    } catch (error) {
      transitionError = error;
    }

    let releaseError = null;
    try {
      this.store.releaseLease(current.job_id, this.workerId);
    } catch (error) {
      releaseError = error;
    }

    if (transitionError) throw transitionError;
    if (releaseError) throw releaseError;
    if (artifactError) throw artifactError;
    return failed;
  }

  readLatestValidCheckpoint(jobId) {
    const artifacts = [...this.store.listArtifacts(jobId)].reverse();
    const failures = [];
    for (const artifact of artifacts) {
      try {
        return Object.freeze({ artifact, checkpoint: this.spool.read(artifact), failures });
      } catch (error) {
        failures.push(Object.freeze({
          stage: artifact.stage,
          code: error.code || 'RECOVERY_ARTIFACT_INVALID'
        }));
      }
    }
    return Object.freeze({ artifact: null, checkpoint: null, failures });
  }

  readRecoverySnapshot(jobId) {
    const job = this.store.readJob(jobId);
    if (!job) {
      const error = new Error(`evidence job not found: ${jobId}`);
      error.code = 'EVIDENCE_JOB_NOT_FOUND';
      throw error;
    }
    const stateIndex = RECOVERY_STAGE_ORDER.indexOf(job.state);
    if (stateIndex < 0) {
      return Object.freeze({ job, state: job.state, stages: Object.freeze({}) });
    }

    const artifacts = new Map(
      this.store.listArtifacts(job.job_id).map((artifact) => [artifact.stage, artifact])
    );
    const stages = {};
    const readRequired = (stage) => {
      const artifact = artifacts.get(stage);
      if (!artifact) throw recoveryArtifactError(stage);
      try {
        const checkpoint = this.spool.read(artifact);
        if (!checkpoint || typeof checkpoint.value !== 'object' || checkpoint.value === null) {
          throw recoveryArtifactError(stage);
        }
        stages[stage] = checkpoint.value;
      } catch (cause) {
        if (
          cause?.code === 'RECOVERY_ARTIFACT_INVALID'
          && String(cause.message || '').includes(stage)
        ) {
          throw cause;
        }
        throw recoveryArtifactError(stage, cause);
      }
    };

    for (const stage of RECOVERY_STAGE_ORDER.slice(0, Math.min(stateIndex + 1, 4))) {
      readRequired(stage);
    }
    if (job.state === 'REINFORCEMENT_COMPLETED') {
      readRequired('REINFORCEMENT_COMPLETED');
    } else if (
      job.state === 'FINAL_JUDGED'
      && stages.INITIAL_JUDGED?.status === 'REINFORCEMENT_REQUIRED'
    ) {
      readRequired('REINFORCEMENT_COMPLETED');
    }
    if (job.state === 'FINAL_JUDGED') readRequired('FINAL_JUDGED');

    return Object.freeze({
      job,
      state: job.state,
      stages: Object.freeze(stages)
    });
  }

  recoverable(limit = 100) {
    return this.store.listRecoverable(limit).map((job) => Object.freeze({
      job,
      latest: this.readLatestValidCheckpoint(job.job_id)
    }));
  }

  close() {
    this.store.close();
  }
}

module.exports = {
  CHECKPOINT_SCHEMA,
  DEFAULT_LEASE_DURATION_MS,
  EvidenceJobManager,
  LEASE_SAFETY_MARGIN_MS,
  LIFECYCLE_TO_JOB_STATE,
  MAX_LEASE_DURATION_MS,
  MAX_SEARCH_DEADLINE_MS,
  MIN_SEARCH_DEADLINE_MS,
  RECOVERY_STAGE_ORDER,
  leaseDurationForDeadline,
  terminalStateFromResult
};
