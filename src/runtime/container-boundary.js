'use strict';

const fs = require('node:fs');

const CONTAINER_MARKERS = Object.freeze([
  '/.dockerenv',
  '/run/.containerenv'
]);

const PROC_HINT_FILES = Object.freeze([
  '/proc/1/cgroup',
  '/proc/self/cgroup',
  '/proc/1/mountinfo',
  '/proc/self/mountinfo'
]);

const CONTAINER_HINT = /(?:docker|containerd|kubepods|libpod|podman|cri-o|crio|lxc)/i;

function safeExists(existsSync, filePath) {
  try {
    return existsSync(filePath) === true;
  } catch {
    return false;
  }
}

function safeRead(readFileSync, filePath) {
  try {
    return String(readFileSync(filePath, 'utf8') || '');
  } catch {
    return '';
  }
}

function detectContainerRuntime(options = {}) {
  const existsSync = options.existsSync || fs.existsSync;
  const readFileSync = options.readFileSync || fs.readFileSync;
  const evidence = [];

  for (const marker of CONTAINER_MARKERS) {
    if (safeExists(existsSync, marker)) evidence.push(`marker:${marker}`);
  }

  for (const filePath of PROC_HINT_FILES) {
    const value = safeRead(readFileSync, filePath);
    if (value && CONTAINER_HINT.test(value)) evidence.push(`proc:${filePath}`);
  }

  return Object.freeze({
    containerized: evidence.length > 0,
    evidence: Object.freeze([...new Set(evidence)].sort())
  });
}

function assertContainerRuntime(options = {}) {
  const state = detectContainerRuntime(options);
  if (state.containerized) return state;

  const error = new Error(
    'Astera server entrypoints must run inside a container. Direct host Node execution and host-resident runtime placement are prohibited.'
  );
  error.code = 'ASTERA_CONTAINER_RUNTIME_REQUIRED';
  error.runtime_state = state;
  throw error;
}

module.exports = {
  CONTAINER_MARKERS,
  PROC_HINT_FILES,
  detectContainerRuntime,
  assertContainerRuntime
};
