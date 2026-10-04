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

test('TGserver ZERO integration uses canonical Development Probe and central reader boundary', () => {
  const root = path.join(__dirname, '..');
  const oldQuery = path.join(root, '.github', 'astera-legacy-tgserver-query.json');
  const oldReader = path.join(root, '.github', 'workflows', 'astera-legacy-tgserver-log-read.yml');
  assert.equal(fs.existsSync(oldQuery), false, 'project-local TGserver search query must be removed');
  assert.equal(fs.existsSync(oldReader), false, 'project-local TGserver search workflow must be removed');

  const probe = fs.readFileSync(path.join(root, '.github', 'workflows', 'dev-probe.yml'), 'utf8');
  const verify = fs.readFileSync(path.join(root, '.github', 'workflows', 'verify.yml'), 'utf8');

  assert.match(probe, /github\.event\.issue\.user\.login\s*==\s*github\.repository_owner/);
  assert.match(probe, /startsWith\(github\.event\.issue\.title, '\[DEV-PROBE\]'\)/);
  assert.match(probe, /uses:\s*\.\/\.github\/workflows\/verify\.yml/);
  assert.match(probe, /retention-days:\s*3/);
  assert.doesNotMatch(probe, /github\.event\.issue\.body/);
  assert.doesNotMatch(probe, /LEGACY_TGSERVER_URL|CF_ACCESS_CLIENT|CF-Access-Client|\/search|\/ingest/);
  assert.doesNotMatch(probe, /secrets\./);
  assert.match(verify, /workflow_call:/);
});
