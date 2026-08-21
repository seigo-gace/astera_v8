'use strict';

const ServerBase = require('./server-base');
const CanonicalAsteraEngine = require('./canonical-astera-engine');

function isLoopbackAddress(address = '') {
  return /^(127(?:\.\d{1,3}){3}|::1|::ffff:127(?:\.\d{1,3}){3})$/i.test(String(address || ''));
}

function isLoopbackHost(host = '') {
  return ['127.0.0.1', 'localhost', '::1'].includes(String(host || '').toLowerCase());
}

class AsteraServer extends ServerBase {
  constructor(options = {}) {
    const engine = options.engine || new CanonicalAsteraEngine({
      poolSize: Number(options.poolSize || 4),
      logger: options.logger
    });
    super({ ...options, engine });
  }

  async _authenticate(req) {
    const key = req.headers['x-api-key'];
    const localNoAuthRequested = (process.env.ASTERA_LOCAL_NO_AUTH || process.env.KAGURA_LOCAL_NO_AUTH) === '1';
    const localNoAuthAllowed = localNoAuthRequested
      && process.env.NODE_ENV !== 'production'
      && isLoopbackHost(this.host)
      && isLoopbackAddress(req.socket?.remoteAddress);

    if (!key && localNoAuthAllowed) {
      return { id: 'local-dev', plan: 'admin', status: 'active', is_global: true };
    }
    return this.tenants.resolve(key);
  }
}

module.exports = AsteraServer;
module.exports.isLoopbackAddress = isLoopbackAddress;
module.exports.isLoopbackHost = isLoopbackHost;
