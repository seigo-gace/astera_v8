'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const AsteraEngine = require('../src/astera-engine');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');
const LegacyEnginePath = require('../src/kagura-engine');
const CanonicalAsteraEngineBase = require('../src/canonical-astera-engine-base');

test('Astera is the public runtime name and Kagura is only a compatibility import', () => {
  assert.equal(AsteraEngine.name, 'AsteraEngine');
  assert.strictEqual(LegacyEnginePath, AsteraEngine);
  assert.strictEqual(Object.getPrototypeOf(AsteraEngine.prototype), CanonicalAsteraEngine.prototype);
  assert.strictEqual(Object.getPrototypeOf(CanonicalAsteraEngine.prototype), CanonicalAsteraEngineBase.prototype);
});
