import { AsyncResource } from 'node:async_hooks';
import { Worker } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import type { MetricsSink, RuntimeExecutionSpec } from '../part/ports.js';
import type { RuntimeMetric } from '../part/types.js';
import type { TextDescriptor, WorkerResponseEnvelope, WorkerTaskName } from '../part/worker-protocol.js';

interface QueuedTask<T> {
  readonly id: string;
  readonly task: WorkerTaskName;
  readonly payload: unknown;
  readonly cancellationBuffer: SharedArrayBuffer;
  readonly resource: AsyncResource;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
  readonly queuedAt: number;
  startedAt?: number;
  settled: boolean;
  timeout?: NodeJS.Timeout;
  terminateTimer?: NodeJS.Timeout;
}

interface WorkerSlot {
  worker: Worker;
  current: QueuedTask<unknown> | null;
  generation: number;
}

export interface WorkerPoolBootstrap {
  readonly taxonomyMaster: unknown;
  readonly issuerEntries: readonly unknown[];
  readonly issuerVersion: string;
  readonly aliasEntries: readonly unknown[];
  readonly aliasVersion: string;
}

function byteLengthOfJson(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value, (_key, item: unknown) => {
      if (item instanceof SharedArrayBuffer) return { sharedArrayBuffer: item.byteLength };
      if (item instanceof ArrayBuffer) return { arrayBuffer: item.byteLength };
      return item;
    }), 'utf8');
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function sharedUtf8Descriptor(text: string): TextDescriptor {
  const bytes = Buffer.from(text, 'utf8');
  const buffer = new SharedArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return Object.freeze({ kind: 'SHARED_UTF8', buffer, byteLength: bytes.byteLength });
}

export function textDescriptor(
  text: string,
  spec: RuntimeExecutionSpec,
  fileChunk?: Readonly<{ path: string; start: number; byteLength: number }> | null
): TextDescriptor {
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes <= spec.limits.sharedTextThresholdBytes && bytes <= spec.limits.maxWorkerPayloadBytes) {
    return Object.freeze({ kind: 'INLINE', text });
  }
  if (spec.workerTransferMode === 'SHARED_ARRAY_BUFFER') return sharedUtf8Descriptor(text);
  if (!fileChunk) throw new Error('LARGE_PAYLOAD_REQUIRES_TBD05_TRANSFER_SOURCE');
  return Object.freeze({ kind: 'FILE_CHUNK', path: fileChunk.path, start: fileChunk.start, byteLength: fileChunk.byteLength });
}

async function emitMetric(sink: MetricsSink, metric: RuntimeMetric): Promise<void> {
  await sink(Object.freeze(metric));
}

export class V8WorkerPool {
  readonly #spec: RuntimeExecutionSpec;
  readonly #bootstrapDescriptor: TextDescriptor;
  readonly #metricsSink: MetricsSink;
  readonly #slots: WorkerSlot[] = [];
  readonly #queue: QueuedTask<unknown>[] = [];
  #taskCounter = 0;
  #closed = false;

  constructor(spec: RuntimeExecutionSpec, bootstrap: WorkerPoolBootstrap) {
    this.#spec = spec;
    this.#metricsSink = spec.metricsSink;
    this.#bootstrapDescriptor = sharedUtf8Descriptor(JSON.stringify(bootstrap));
    for (let index = 0; index < spec.limits.workerCount; index += 1) this.#slots.push(this.#createSlot(0));
  }

  get workerCount(): number { return this.#slots.length; }
  get queuedCount(): number { return this.#queue.length; }

  execute<T>(task: WorkerTaskName, payload: unknown): Promise<T> {
    if (this.#closed) return Promise.reject(new Error('WORKER_POOL_CLOSED'));
    if (this.#queue.length >= this.#spec.limits.workerQueueLimit) return Promise.reject(new Error('WORKER_QUEUE_LIMIT_EXCEEDED'));
    if (byteLengthOfJson(payload) > this.#spec.limits.maxWorkerPayloadBytes) return Promise.reject(new Error('WORKER_PAYLOAD_LIMIT_EXCEEDED'));
    const id = `task-${String(++this.#taskCounter).padStart(12, '0')}`;
    return new Promise<T>((resolve, reject) => {
      const queued: QueuedTask<T> = {
        id,
        task,
        payload,
        cancellationBuffer: new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT),
        resource: new AsyncResource(`AsteraV8Task:${task}`),
        resolve,
        reject,
        queuedAt: performance.now(),
        settled: false
      };
      this.#queue.push(queued as QueuedTask<unknown>);
      this.#drain();
    });
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    const error = new Error('WORKER_POOL_CLOSED');
    while (this.#queue.length > 0) this.#rejectTask(this.#queue.shift()!, error);
    await Promise.all(this.#slots.map(async (slot) => {
      if (slot.current) this.#rejectTask(slot.current, error);
      await slot.worker.terminate();
    }));
  }

  #createSlot(generation: number): WorkerSlot {
    const workerUrl = import.meta.url.endsWith('.ts')
      ? new URL('../../dist/component/v8-worker.js', import.meta.url)
      : new URL('./v8-worker.js', import.meta.url);
    const worker = new Worker(workerUrl, {
      workerData: { bootstrapDescriptor: this.#bootstrapDescriptor }
    });
    const slot: WorkerSlot = { worker, current: null, generation };
    worker.on('message', (message: WorkerResponseEnvelope) => this.#onMessage(slot, message));
    worker.on('error', (error: unknown) => this.#onWorkerFailure(slot, error instanceof Error ? error : new Error(String(error))));
    worker.on('exit', (code) => {
      if (!this.#closed && code !== 0) this.#onWorkerFailure(slot, new Error(`WORKER_EXIT:${code}`));
    });
    return slot;
  }

  #replaceSlot(slot: WorkerSlot): void {
    const index = this.#slots.indexOf(slot);
    if (index < 0 || this.#closed) return;
    const replacement = this.#createSlot(slot.generation + 1);
    this.#slots[index] = replacement;
    this.#drain();
  }

  #drain(): void {
    if (this.#closed) return;
    for (const slot of this.#slots) {
      if (slot.current || this.#queue.length === 0) continue;
      const task = this.#queue.shift()!;
      slot.current = task;
      task.startedAt = performance.now();
      task.timeout = setTimeout(() => this.#onTimeout(slot, task), this.#spec.limits.workerTimeoutMs);
      slot.worker.postMessage({ id: task.id, task: task.task, payload: task.payload, cancellationBuffer: task.cancellationBuffer });
      void emitMetric(this.#metricsSink, {
        type: 'V8_TASK_STARTED',
        at: new Date().toISOString(),
        task: task.task,
        task_id: task.id,
        queue_wait_ms: task.startedAt - task.queuedAt,
        worker_generation: slot.generation
      });
    }
  }

  #onMessage(slot: WorkerSlot, message: WorkerResponseEnvelope): void {
    const task = slot.current;
    if (!task || task.id !== message.id) return;
    this.#clearTimers(task);
    slot.current = null;
    const duration = performance.now() - (task.startedAt ?? performance.now());
    if (message.ok) this.#resolveTask(task, message.result);
    else this.#rejectTask(task, new Error(message.error));
    void emitMetric(this.#metricsSink, {
      type: 'V8_TASK_COMPLETED',
      at: new Date().toISOString(),
      task: task.task,
      task_id: task.id,
      duration_ms: duration,
      ok: message.ok,
      worker_generation: slot.generation
    });
    this.#drain();
  }

  #onTimeout(slot: WorkerSlot, task: QueuedTask<unknown>): void {
    if (slot.current !== task || task.settled) return;
    Atomics.store(new Int32Array(task.cancellationBuffer), 0, 1);
    this.#rejectTask(task, new Error(`WORKER_TIMEOUT:${task.task}`));
    task.terminateTimer = setTimeout(() => {
      if (slot.current !== task) return;
      slot.current = null;
      void slot.worker.terminate().finally(() => this.#replaceSlot(slot));
    }, this.#spec.limits.workerCancelGraceMs);
    void emitMetric(this.#metricsSink, {
      type: 'V8_TASK_TIMEOUT',
      at: new Date().toISOString(),
      task: task.task,
      task_id: task.id,
      worker_generation: slot.generation
    });
  }

  #onWorkerFailure(slot: WorkerSlot, error: Error): void {
    const task = slot.current;
    slot.current = null;
    if (task) {
      this.#clearTimers(task);
      this.#rejectTask(task, error);
    }
    void slot.worker.terminate().finally(() => this.#replaceSlot(slot));
  }

  #clearTimers(task: QueuedTask<unknown>): void {
    if (task.timeout) clearTimeout(task.timeout);
    if (task.terminateTimer) clearTimeout(task.terminateTimer);
  }

  #resolveTask(task: QueuedTask<unknown>, value: unknown): void {
    if (task.settled) return;
    task.settled = true;
    task.resource.runInAsyncScope(task.resolve, undefined, value);
    task.resource.emitDestroy();
  }

  #rejectTask(task: QueuedTask<unknown>, reason: unknown): void {
    if (task.settled) return;
    task.settled = true;
    task.resource.runInAsyncScope(task.reject, undefined, reason);
    task.resource.emitDestroy();
  }
}
