'use strict';
// 目的: 生文字列への部分一致を廃止し、トークン境界を確定する。
// 非AI・決定論: Sudachi(固定辞書+Viterbi)は同一入力+同一辞書version=同一出力。
// Assumption: サーバーに sudachi CLI が導入済み。

const { spawnSync } = require('node:child_process');

const SUDACHI_BIN = process.env.SUDACHI_BIN || 'sudachi';
const SUDACHI_MODE = process.env.SUDACHI_MODE || 'C';
const DICT_VERSION = process.env.SUDACHI_DICT_VERSION || 'UNSET';

function tokenize(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return { status: 'EMPTY', dict_version: DICT_VERSION, tokens: [] };
  }
  const res = spawnSync(SUDACHI_BIN, ['-m', SUDACHI_MODE, '-a'], {
    input: text,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (res.error || res.status !== 0) {
    return {
      status: 'TOKENIZER_FAILED',
      dict_version: DICT_VERSION,
      tokens: [],
      stderr: res.stderr || String(res.error),
    };
  }
  return {
    status: 'OK',
    dict_version: DICT_VERSION,
    tokens: parseSudachi(res.stdout),
  };
}

function parseSudachi(stdout) {
  const tokens = [];
  for (const line of stdout.split('\n')) {
    if (line === 'EOS' || line.trim() === '') continue;
    const cols = line.split('\t');
    if (cols.length < 3) continue;
    tokens.push({
      surface: cols[0],
      pos: cols[1].split(','),
      normalized: cols[2],
    });
  }
  return tokens;
}

module.exports = { tokenize };
