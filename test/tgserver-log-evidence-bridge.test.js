'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const TgsClient = require('../src/logging/tgs-client');

test('TGserver delivery emits bounded searchable evidence metadata', async () => {
  const requests = [];
  const client = new TgsClient({
    url: 'http://127.0.0.1:3000/ingest',
    projectId: 'P002',
    retries: 1,
    metadata: {
      repo: 'seigo-gace/astera_v8',
      branch: 'fix/flow-recovery-convergence-20261001',
      workflow: 'Astera Verify',
      run_id: '37127986153',
      module: 'core'
    },
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return { ok: true, status: 200 };
    }
  });

  const delivered = await client.deliver({
    at: '2026-10-03T00:00:00.000Z',
    source: 'astera-v8',
    severity: 'info',
    type: 'runtime_probe',
    text: 'test',
    payload: {}
  });

  assert.equal(delivered, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].project_id, 'P002');
  assert.equal(requests[0].source, 'astera-v8');
  assert.equal(requests[0].repo, 'seigo-gace/astera_v8');
  assert.equal(requests[0].branch, 'fix/flow-recovery-convergence-20261001');
  assert.equal(requests[0].workflow, 'Astera Verify');
  assert.equal(requests[0].run_id, '37127986153');
  assert.equal(requests[0].module, 'core');
});

test('TGserver metadata drops invalid bounded values instead of breaking log delivery', async () => {
  const requests = [];
  const client = new TgsClient({
    retries: 1,
    metadata: {
      source: 'astera-v8',
      repo: 'seigo-gace/astera_v8',
      branch: 'bad\nbranch',
      workflow: 'x'.repeat(257),
      run_id: '123',
      module: 'core'
    },
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return { ok: true, status: 200 };
    }
  });

  assert.equal(await client.deliver({ at: new Date().toISOString(), severity: 'warn', type: 'probe', source: 'astera-v8' }), true);
  assert.equal(requests[0].branch, undefined);
  assert.equal(requests[0].workflow, undefined);
  assert.equal(requests[0].run_id, '123');
});

test('GitHub read bridge exposes the legacy TGserver searchable metadata contract', () => {
  const root = path.join(__dirname, '..');
  const query = JSON.parse(fs.readFileSync(path.join(root, '.github', 'astera-legacy-tgserver-query.json'), 'utf8'));
  const expected = ['query','project_id','severity','from','to','source','repo','branch','workflow','run_id','module'];
  assert.deepEqual(Object.keys(query), expected);
  assert.equal(query.project_id, 'P002');

  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'astera-legacy-tgserver-log-read.yml'), 'utf8');
  for (const field of ['source','repo','branch','workflow','run_id','module']) assert.match(workflow, new RegExp(`['\"]?${field}['\"]?`));
  assert.match(workflow, /POST_\/search/);
  assert.match(workflow, /retention-days:\s*3/);
  assert.match(workflow, /REDACTED/);
  assert.match(workflow, /TOPIC_ID_FIXED=FALSE/);
  assert.match(workflow, /VNEXT_USED=FALSE/);
});
