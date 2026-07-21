import type { CoreExecutionRequest, CoreExecutionResult } from '../part/core-contracts.js';
import type { AsteraCoreSystemOptions } from '../system/astera-core-system.js';
import { createAsteraCoreSystem, AsteraCoreSystem } from '../system/astera-core-system.js';

export class AsteraBodyApplicationSystem {
  readonly #coreSystem: AsteraCoreSystem;

  constructor(coreSystem: AsteraCoreSystem) {
    this.#coreSystem = coreSystem;
  }

  process(request: CoreExecutionRequest): Promise<CoreExecutionResult> {
    return this.#coreSystem.execute(request);
  }

  close(): Promise<void> {
    return this.#coreSystem.close();
  }
}

export async function createAsteraBodyApplicationSystem(options: AsteraCoreSystemOptions): Promise<AsteraBodyApplicationSystem> {
  return new AsteraBodyApplicationSystem(await createAsteraCoreSystem(options));
}
