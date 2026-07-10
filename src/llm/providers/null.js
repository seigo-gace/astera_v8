'use strict';

const LLMAdapter = require('../adapter-base');

class NullAdapter extends LLMAdapter {
  async generate(prompt) {
    return {
      provider: 'null',
      model: 'rule-based',
      text: [
        'Astera v8 NullAdapter result:',
        '外部LLMは呼び出していません。',
        '下記の認知前処理済みプロンプトを任意のLLMへ渡してください。',
        '',
        prompt.slice(0, 4000)
      ].join('\n')
    };
  }
}

module.exports = NullAdapter;
