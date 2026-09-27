'use strict';

const crypto = require('node:crypto');

const CHECKPOINT_SCHEMA = 'astera.evidence-search.checkpoint.v1';

const LIFECYCLE_TO_JOB_STATE = Object.freeze({
  AUTHENTICATED: 'AUTHENTICATED',
  PLANNED: 'PLANNED',
  INITIAL_SEARCH_COMPLETED: 'INITIAL_SEARCH_COMPLETED',
  INITIAL_JUDGED: 'INITIAL_JUDGED',
  REINFORCEMENT_COMPLETED: 'REINFORCEMENT_COMPLETED',
  FINAL_JUDGED: 'FINAL_JUDGED'
});

function terminalStateFromResult(status) {
  return status === 'FINAL_VALID' ? 'FINAL_VALID' : 'REJECTED';
}

class EvidenceJobManager {
  constructor({ store, spool, workerId = `worker_${process.pid}_${crypto.randomUUID()}` }) {
    if (!store) throw new TypeError('EvidenceJobManager requires store');
    if (!spool) throw new TypeError('EvidenceJobManager requires spool');
    this.store = store;
    this.spool = spool;
    this.workerId = String(workerId);
  }

  begin({ callerId, requestId, idempotencyKey }) {
    const job = this.store.createJob({
      callerId,
      requestId,
      idempotencyKey: idempotencyKey || requestId
    });
    if (job.reused && ['FINAL_VALID', 'REJECTED'].includes(job.state)) {
      return Object.freeze({ job, reusedTerminal: true });
    }
    if (!this.store.acquireLease(job.job_id, this.workerId)) {
      const error = new Error('evidence job is already leased by another worker');
      error.code = 'EVIDENCE_JOB_LEASE_CONFLICT';
      throw error;
    }
    return Object.freeze({ job: this.store.readJob(job.job_id), reusedTerminal: false });
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

  fail(job, error) {
    const current = this.store.readJob(job.job_id);
    if (!current || ['FINAL_VALID', 'REJECTED', 'ERROR'].includes(current.state)) {
      return current;
    }
    let artifactError = null;
    try {
      const artifact = this.spool.write({
        callerId: current.caller_id,
        jobId: current.job_id,
        stage: 'ERROR',
        schemaVersion: CHECKPOINT_SCHEMA,
        value: {
          error_code: error.code || 'EVIDENCE_SEARCH_ERROR',
          message: error.message,
          failed_state: current.state
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
        { error_code: error.code || 'EVIDENCE_SEARCH_ERROR' }
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
  EvidenceJobManager,
  LIFECYCLE_TO_JOB_STATE,
  terminalStateFromResult
};
