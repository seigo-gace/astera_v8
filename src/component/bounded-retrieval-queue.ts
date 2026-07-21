import { compareLexical } from '../part/canonical.js';
import { RetrievalCoordinator } from '../feature/retrieval.js';
import type { RetrievalAdapter, RuntimeExecutionSpec } from '../part/ports.js';
import type { CandidateRecord, QueryRecord } from '../part/types.js';

interface RetrievalJob {
  readonly index: number;
  readonly query: QueryRecord;
}

export class BoundedRetrievalQueue {
  readonly #coordinator: InstanceType<typeof RetrievalCoordinator>;
  readonly #concurrency: number;

  constructor(adapter: RetrievalAdapter, spec: RuntimeExecutionSpec) {
    this.#coordinator = new RetrievalCoordinator({ adapter, limits: spec.limits });
    this.#concurrency = spec.limits.retrievalConcurrency;
  }

  async retrieveAll(queries: readonly QueryRecord[], requestId: string, signal?: AbortSignal): Promise<readonly CandidateRecord[]> {
    if (queries.length === 0) return Object.freeze([]);
    const jobs: RetrievalJob[] = queries.map((query, index) => ({ index, query }));
    const output: CandidateRecord[][] = Array.from({ length: jobs.length }, () => []);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(this.#concurrency, jobs.length) }, async () => {
      while (true) {
        if (signal?.aborted) throw signal.reason ?? new Error('RETRIEVAL_ABORTED');
        const current = cursor;
        cursor += 1;
        const job = jobs[current];
        if (!job) return;
        output[job.index] = await this.#coordinator.retrieve(job.query, requestId, { signal }) as CandidateRecord[];
      }
    });
    await Promise.all(workers);
    return Object.freeze(output.flat().sort((left, right) => {
      const queryOrder = compareLexical(left.query_id, right.query_id);
      if (queryOrder !== 0) return queryOrder;
      return compareLexical(left.candidate_id ?? '', right.candidate_id ?? '');
    }));
  }
}
