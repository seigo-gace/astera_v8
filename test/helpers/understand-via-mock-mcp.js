'use strict';

const { enrichRequest } = require('../../src/deterministic-task-decomposer');
const { requestFromParser, japaneseFastSkeleton } = require('../../src/canonical-v4-engine');
const { mockJapaneseParserResultFromSentences } = require('./japanese-parser-mcp-mock');

function understandViaMockMcp(question, context = '') {
  const text = String(question || '');
  const mockResult = mockJapaneseParserResultFromSentences(text);
  const fast = japaneseFastSkeleton({ question: text, context });
  const prepared = requestFromParser(fast, mockResult, text);
  return enrichRequest(prepared, { question: text, context });
}

module.exports = {
  understandViaMockMcp
};
