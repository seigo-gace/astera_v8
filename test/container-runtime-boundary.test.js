'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  detectContainerRuntime,
  assertContainerRuntime
} = require('../src/runtime/container-boundary');

function fakeFs({ markers = [], proc = {} } = {}) {
  const markerSet = new Set(markers);
  return {
    existsSync(filePath) {
      return markerSet.has(filePath);
    },
    readFileSync(filePath) {
      if (Object.hasOwn(proc, filePath)) return proc[filePath];
      const error = new Error(`ENOENT: ${filePath}`);
      error.code = 'ENOENT';
      throw error;
    }
  };
}

test('direct host runtime is rejected with a stable error code', () => {
  const io = fakeFs();
  const state = detectContainerRuntime(io);
  assert.equal(state.containerized, false);
  assert.throws(
    () => assertContainerRuntime(io),
    (error) => error?.code === 'ASTERA_CONTAINER_RUNTIME_REQUIRED'
      && /inside a container/i.test(error.message)
  );
});

test('Docker and Podman marker files satisfy the container boundary', () => {
  const docker = assertContainerRuntime(fakeFs({ markers: ['/.dockerenv'] }));
  const podman = assertContainerRuntime(fakeFs({ markers: ['/run/.containerenv'] }));
  assert.equal(docker.containerized, true);
  assert.ok(docker.evidence.includes('marker:/.dockerenv'));
  assert.equal(podman.containerized, true);
  assert.ok(podman.evidence.includes('marker:/run/.containerenv'));
});

test('container cgroup/mount evidence is accepted without an environment-variable bypass', () => {
  const state = assertContainerRuntime(fakeFs({
    proc: {
      '/proc/1/cgroup': '0::/kubepods.slice/kubepods-burstable.slice/containerd-123.scope'
    }
  }));
  assert.equal(state.containerized, true);
  assert.ok(state.evidence.includes('proc:/proc/1/cgroup'));
});

test('active compose definitions do not bind host application source into /app', () => {
  const root = path.join(__dirname, '..');
  for (const fileName of ['docker-compose.yml', 'docker-compose.personal.yml', 'docker-compose.evidence.yml']) {
    const source = fs.readFileSync(path.join(root, fileName), 'utf8');
    assert.doesNotMatch(source, /(?:source:\s*(?:\.|\/[^\n]+)\s*\n\s*target:\s*\/app\b|-[ \t]*(?:\.|\/[^:\n]+):\/app\b)/m, `${fileName} must not bind host source into /app`);
  }
});

test('Docker image owns the application source and runs as the non-root node user', () => {
  const dockerfile = fs.readFileSync(path.join(__dirname, '..', 'Dockerfile'), 'utf8');
  assert.match(dockerfile, /^COPY src \.\/src$/m);
  assert.match(dockerfile, /^USER node$/m);
  assert.match(dockerfile, /^CMD \["node", "start\.js"\]$/m);
});
