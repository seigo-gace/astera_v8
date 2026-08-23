'use strict';

// Deprecated compatibility import only.
// Automatic Evidence Search now runs inside the single Canonical pipeline via
// AsteraEngine.resolveEvidenceForTask(); this file must never own another
// process() implementation.
module.exports = require('./astera-engine');
