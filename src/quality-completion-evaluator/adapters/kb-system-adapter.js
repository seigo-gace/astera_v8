"use strict";

function validateKbAdapter(adapter) {
  if (!adapter || typeof adapter.publish !== "function") {
    throw new TypeError("KB adapter must expose async publish(record, options)");
  }
  return adapter;
}

module.exports = { validateKbAdapter };
