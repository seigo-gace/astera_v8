'use strict';

class LLMAdapter {
  constructor(options = {}) {
    this.options = options;
  }

  async generate() {
    throw new Error('generate() must be implemented by adapter');
  }
}

module.exports = LLMAdapter;
