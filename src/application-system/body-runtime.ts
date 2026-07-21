import type { AsteraCoreSystemOptions } from '../system/astera-core-system.js';
import type { StructuredLogSink } from '../part/operational-contracts.js';
import { createCoreExecutionLogHook } from '../feature/core-observability.js';
import { createAsteraBodyApplicationSystem, AsteraBodyApplicationSystem } from './astera-body-application-system.js';
import { AsteraInternalApiApplicationSystem } from './internal-api-application-system.js';

export interface AsteraBodyRuntimeOptions extends AsteraCoreSystemOptions {
  readonly serviceKey: string;
  readonly logger?: StructuredLogSink;
  readonly host?: string;
  readonly port?: number;
}

export class AsteraBodyRuntime {
  readonly body: AsteraBodyApplicationSystem;
  readonly api: AsteraInternalApiApplicationSystem;
  #closed = false;

  constructor(body: AsteraBodyApplicationSystem, api: AsteraInternalApiApplicationSystem) {
    this.body = body;
    this.api = api;
  }

  start(): ReturnType<AsteraInternalApiApplicationSystem['start']> {
    return this.api.start();
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    await this.api.stop();
  }
}

export async function createAsteraBodyRuntime(options: AsteraBodyRuntimeOptions): Promise<AsteraBodyRuntime> {
  const { serviceKey, logger, host, port, hooks, ...bodyOptions } = options;
  const executionLogHook = logger ? createCoreExecutionLogHook(logger) : undefined;
  const body = await createAsteraBodyApplicationSystem({
    ...bodyOptions,
    hooks: {
      ...(hooks ?? {}),
      onExecutionCompleted: async (result) => {
        await hooks?.onExecutionCompleted?.(result);
        await executionLogHook?.(result);
      }
    }
  });
  const api = new AsteraInternalApiApplicationSystem({
    body,
    serviceKey,
    ...(host !== undefined ? { host } : {}),
    ...(port !== undefined ? { port } : {}),
    ...(logger ? { logger } : {})
  });
  return new AsteraBodyRuntime(body, api);
}
