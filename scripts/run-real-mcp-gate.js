'use strict';

const CanonicalAsteraEngine = require('../src/canonical-astera-engine');
const { JapaneseParserMCPClient, isJapaneseParserConfigured, DEFAULT_DJPMCP } = require('../src/japanese-parser-mcp-client');

const tenant = { id: 'real-mcp-gate', is_global: true, plan: 'admin' };
const silentLogger = { write() {} };

const CASES = [
  {
    id: 'B',
    question: '新方式は従来より20%速いと言われている。事実確認も含め判断材料だけ欲しい。',
    assert(out) {
      const text = out.material.text;
      const s07 = (text.split('---')[6] || '').trim();
      const domainClaims = (out.result.task_results || []).flatMap((r) => r.canonical?.records || [])
        .filter((rec) => !['OUTPUT_POLICY', 'USER_GOAL', 'PRESERVE', 'USER_DEADLINE', 'USER_CONSTRAINT', 'VERIFICATION_TARGET'].includes(String(rec.claim?.predicate || '')));
      if (domainClaims.length < 1) throw new Error('expected domain claim');
      if (/外部Evidence検索: 不要（NOT_REQUIRED）/u.test(text)) throw new Error('fixed NOT_REQUIRED boilerplate leaked');
      const searchRequired = (out.result.task_results || []).some((r) => (r.canonical?.search_plan?.queries || []).length > 0);
      if (!searchRequired) throw new Error('expected search plan queries');
      if (!/07 根拠成立状態/.test(text)) throw new Error('missing section 07');
      if (!s07) throw new Error('empty section 07');
    }
  }
];

async function main() {
  const command = process.env.ASTERA_JAPANESE_PARSER_COMMAND || DEFAULT_DJPMCP;
  const configured = isJapaneseParserConfigured({ mode: 'stdio', command });
  console.log(`REAL_MCP configured=${configured}`);
  if (!configured) {
    console.error('REAL_MCP_FAIL: Japanese Parser MCP is not configured (mock substitute forbidden).');
    process.exit(2);
  }
  const engine = new CanonicalAsteraEngine({
    poolSize: 2,
    logger: silentLogger,
    japaneseParserClient: new JapaneseParserMCPClient({ mode: 'stdio', command }),
    japaneseParserOptions: { command }
  });
  try {
    for (const testCase of CASES) {
      const out = await engine.process({ question: testCase.question, language: 'ja' }, tenant);
      testCase.assert(out);
      console.log(`REAL_MCP_CASE_${testCase.id}_PASS type=${out.result.type} main8_sections=${(out.material.text.match(/^---$/gm) || []).length + 1}`);
    }
    console.log('REAL_MCP_GATE_PASS');
  } finally {
    await engine.destroy();
  }
}

main().catch((error) => {
  console.error(`REAL_MCP_FAIL: ${error.message}`);
  process.exit(1);
});
