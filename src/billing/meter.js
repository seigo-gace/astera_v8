'use strict';

class UsageMeter {
  constructor(store) {
    this.store = store;
  }

  record({ tenant, route, units = 1, status = 'ok', meta = {} }) {
    if (!tenant || tenant.is_global) return null;
    return this.store.recordUsage({ tenantId: tenant.id, route, units, status, meta });
  }
}

module.exports = { UsageMeter };
