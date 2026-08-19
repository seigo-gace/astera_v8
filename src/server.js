'use strict';

const ServerBase = require('./server-base');
const CanonicalAsteraEngine = require('./canonical-astera-engine');

class AsteraServer extends ServerBase {
  constructor(options = {}) {
    const engine = options.engine || new CanonicalAsteraEngine({
      poolSize: Number(options.poolSize || 4),
      logger: options.logger
    });
    super({ ...options, engine });
  }
}

module.exports = AsteraServer;
