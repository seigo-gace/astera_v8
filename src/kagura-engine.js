'use strict';

// Compatibility entry point. The canonical implementation is kept separate so
// server/start call sites do not own or duplicate cognition-runtime policy.
module.exports = require('./canonical-v4-engine');
