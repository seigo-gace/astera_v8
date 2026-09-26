'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const AsteraEngine = require('../src/astera-engine');

class CancelProbeEngine extends AsteraEngine {
  constructor() {
    super({ evidenceSearchClient: null });
    this.finalProcessCalls = 0;
  }

  processInitial() {
    return {
      result: { phase: 'INITIAL_FAST_PATH', revision: 1, material_id: 'mat_cancel_probe' },
      material: { phase: 'INITIAL_FAST_PATH', revision: 1, material_id: 'mat_cancel_probe', text: 'initial' },
      runtime: { duration_ms: 1 }
    };
  }

  async process() {
    this.finalProcessCalls += 1;
    return {
      result: { type: 'cognitive_map' },
      material: { text: 'final' },
      runtime: { engine: 'cancel-probe-final' }
    };
  }
}

test('progressive cancellation immediately after initial revision prevents final processing', async () => {
  const controller = new AbortController();
  const engine = new CancelProbeEngine();
  const revisions = [];

  await assert.rejects(
    engine.processProgressive(
      { question: '判断材料を返せ' },
      { id: 'cancel-test' },
      {
        signal: controller.signal,
        onRevision: async (revision) => {
          revisions.push(revision?.result?.phase || null);
          if (revisions.length === 1) controller.abort();
        }
      }
    ),
    (error) => error && error.code === 'REQUEST_CANCELLED'
  );

  assert.deepEqual(revisions, ['INITIAL_FAST_PATH']);
  assert.equal(engine.finalProcessCalls, 0);
});
