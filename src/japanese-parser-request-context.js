'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');

const storage = new AsyncLocalStorage();

function runWithJapaneseParserRequest(request, fn) {
  return storage.run(request, fn);
}

function getJapaneseParserRequest() {
  return storage.getStore() || null;
}

module.exports = {
  runWithJapaneseParserRequest,
  getJapaneseParserRequest
};
