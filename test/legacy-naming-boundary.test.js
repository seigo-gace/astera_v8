'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const AsteraEngine = require('../src/astera-engine');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');
const LegacyEnginePath = require('../src/kagura-engine');
const CanonicalAsteraEngineBase = require('../src/canonical-astera-engine-base');
const AsteraServerBase = require('../src/server-base');

test('Canonical runtime names use Astera while the Kagura import remains a name-only compatibility shim', () => {
  assert.equal(AsteraEngine.name, 'AsteraEngine');
  assert.strictEqual(LegacyEnginePath, CanonicalAsteraEngine);
  assert.equal(AsteraServerBase.name, 'AsteraServerBase');
  assert.strictEqual(Object.getPrototypeOf(CanonicalAsteraEngineBase.prototype), AsteraEngine.prototype);
});
