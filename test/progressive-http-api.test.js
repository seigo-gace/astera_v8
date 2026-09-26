'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const AsteraServer = require('../src/server');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestStream({ port, path, body }) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let firstChunkAt = null;
    let data = '';
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      method: 'POST',
      path,
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      res.on('data', (chunk) => {
        if (firstChunkAt === null) firstChunkAt = Date.now();
        data += chunk.toString('utf8');
      });
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: data,
        first_chunk_ms: firstChunkAt === null ? null : firstChunkAt - startedAt
      }));
    });
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}

class ProgressiveStubEngine {
  async destroy() {}

  async processProgressive(input, caller, executionContext = {}) {
    const materialId = 'mat_progressive_test';
    const initial = {
      result: { phase: 'INITIAL_FAST_PATH', revision: 1, material_id: materialId },
      material: {
        phase: 'INITIAL_FAST_PATH',
        revision: 1,
        material_id: materialId,
        text: '01 本当の目的\n- 初期判断材料\n---\n08 主役AI／利用者への再指示\n- 未確認を保持'
      },
      runtime: {
        engine: 'test-fast-path',
        external_network_wait: false,
        duration_ms: 1
      }
    };
    await executionContext.onRevision(initial);
    await sleep(60);
    if (executionContext.signal?.aborted) {
      const error = new Error('Request cancelled');
      error.code = 'REQUEST_CANCELLED';
      throw error;
    }
    const final = {
      result: { phase: 'FINAL_ENRICHED', revision: 2, material_id: materialId },
      material: {
        phase: 'FINAL_ENRICHED',
        revision: 2,
        material_id: materialId,
        text: '01 本当の目的\n- 完成判断材料\n---\n08 主役AI／利用者への再指示\n- 根拠補強済み'
      },
      runtime: { engine: 'test-final', progressive: true }
    };
    await executionContext.onRevision(final);
    return { initial, final };
  }
}

test('progressive HTTP path flushes usable initial material before final enrichment', async () => {
  const oldLocal = process.env.ASTERA_LOCAL_NO_AUTH;
  process.env.ASTERA_LOCAL_NO_AUTH = '1';
  const logger = {
    tgsEnabled: false,
    write() {},
    status() { return { enabled: false, project_id: 'P002', pending_deliveries: 0, outbox: null }; },
    async flush() { return true; }
  };
  const server = new AsteraServer({
    port: 0,
    host: '127.0.0.1',
    logger,
    engine: new ProgressiveStubEngine()
  });
  server.start();
  await new Promise((resolve) => server.server.once('listening', resolve));
  const port = server.server.address().port;

  try {
    const response = await requestStream({
      port,
      path: '/v2/process/stream',
      body: { question: '判断材料を返せ', language: 'ja', output_language: 'ja' }
    });
    assert.equal(response.status, 200);
    assert.match(response.headers['content-type'], /text\/event-stream/);
    assert.ok(response.first_chunk_ms !== null && response.first_chunk_ms < 1000, `first chunk=${response.first_chunk_ms}ms`);
    assert.match(response.body, /event: material/);
    assert.match(response.body, /INITIAL_FAST_PATH/);
    assert.match(response.body, /FINAL_ENRICHED/);
    assert.match(response.body, /event: complete/);
    assert.ok(response.body.indexOf('INITIAL_FAST_PATH') < response.body.indexOf('FINAL_ENRICHED'));
  } finally {
    await server.stop();
    if (oldLocal === undefined) delete process.env.ASTERA_LOCAL_NO_AUTH;
    else process.env.ASTERA_LOCAL_NO_AUTH = oldLocal;
  }
});
