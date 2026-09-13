'use strict';

const { createMockJapaneseParserClient, mockJapaneseParserResultFromSentences } = require('./japanese-parser-mcp-mock');

function defaultMockJapaneseParserClient() {
  return createMockJapaneseParserClient({
    resolveResult: (text) => mockJapaneseParserResultFromSentences(text)
  });
}

module.exports = {
  defaultMockJapaneseParserClient
};
