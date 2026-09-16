'use strict';

const fs = require('node:fs');
const path = require('node:path');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');
const { bootstrapRuntimeEnv } = require('../src/evidence-search/api/runtime-client');
const { JapaneseParserMCPClient, isJapaneseParserConfigured, DEFAULT_DJPMCP } = require('../src/japanese-parser-mcp-client');
const { createMockJapaneseParserClient } = require('../test/helpers/japanese-parser-mcp-mock');
const { loadCorpus, FIXTURE } = require('./astera-effect-stories-holdout-v1-corpus');
const { evaluateStory, RUBRIC } = require('../src/astera-effect-rubric');
const { pairedStoryResult, summarizePairs } = require('../src/astera-effect-pair');

const ROOT = path.resolve(__dirname, '..');
const ARTIFACTS_ROOT = path.join(ROOT, 'artifacts', 'astera-effect-stories-holdout-v1');

const silentLogger = { write() {} };
const caller = { id: 'astera-effect-stories-holdout-v1', is_global: true, plan: 'admin' };

function parseArgs(argv) {
  const out = { mockMcp: true };
  for (const arg of argv.slice(2)) {
    if (arg === '--live-mcp') out.mockMcp = false;
    if (arg === '--mock-mcp') out.mockMcp = true;
  }
  return out;
}

function resolveParserClient(useMock) {
  if (useMock) return createMockJapaneseParserClient();
  const command = process.env.ASTERA_JAPANESE_PARSER_COMMAND || DEFAULT_DJPMCP;
  if (isJapaneseParserConfigured({ mode: 'stdio', command })) {
    return new JapaneseParserMCPClient({ mode: 'stdio', command });
  }
  return createMockJapaneseParserClient();
}

function createEngine(mockMcp) {
  bootstrapRuntimeEnv();
  return new CanonicalAsteraEngine({
    poolSize: 2,
    logger: silentLogger,
    japaneseParserClient: resolveParserClient(mockMcp),
    japaneseParserOptions: { command: process.env.ASTERA_JAPANESE_PARSER_COMMAND || DEFAULT_DJPMCP }
  });
}

async function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(FIXTURE)) {
    console.error(`Missing fixture ${FIXTURE}`);
    process.exit(1);
  }
  const stories = loadCorpus();
  const outDir = path.join(ARTIFACTS_ROOT, 'run');
  fs.mkdirSync(outDir, { recursive: true });

  const engine = createEngine(args.mockMcp);
  const pairRows = [];
  const summary = {
    fixture: FIXTURE,
    corpus: stories.length,
    ran: 0,
    IMPROVED: 0,
    UNCHANGED: 0,
    DEGRADED: 0,
    results: []
  };

  try {
    for (const story of stories) {
      summary.ran += 1;
      const input = {
        question: story.user_input,
        context: story.context || '',
        language: 'ja',
        deadline_ms: Number(process.env.ASTERA_EFFECT_PARSER_DEADLINE_MS || 8000)
      };
      let out = null;
      try {
        out = await engine.process(input, caller);
      } catch (error) {
        out = { result: { type: 'error' }, material: { text: '' }, process_error: error.message };
      }
      const evaluation = evaluateStory(story, out);
      const pair = pairedStoryResult(story, out);
      pairRows.push(pair);
      summary[evaluation.story_outcome.toUpperCase()] = (summary[evaluation.story_outcome.toUpperCase()] || 0) + 1;
      const row = {
        story_id: story.story_id,
        holdout_source: story.holdout_source,
        outcome: evaluation.story_outcome,
        pair_outcome: pair.pair_outcome,
        IMPROVEMENT_DELTA: evaluation.IMPROVEMENT_DELTA,
        violations: evaluation.violations,
        delta: evaluation.delta
      };
      summary.results.push(row);
      fs.writeFileSync(path.join(outDir, `${story.story_id}.json`), JSON.stringify({ story, evaluation, pair }, null, 2));
    }
  } finally {
    await engine.destroy();
  }

  summary.pair = summarizePairs(pairRows);
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
