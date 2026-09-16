'use strict';

const fs = require('node:fs');
const path = require('node:path');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');
const { bootstrapRuntimeEnv } = require('../src/evidence-search/api/runtime-client');
const { JapaneseParserMCPClient, isJapaneseParserConfigured, DEFAULT_DJPMCP } = require('../src/japanese-parser-mcp-client');
const { createMockJapaneseParserClient } = require('../test/helpers/japanese-parser-mcp-mock');
const { loadCorpus, FIXTURE } = require('./astera-effect-stories-v1-corpus');
const { evaluateStory, RUBRIC } = require('../src/astera-effect-rubric');
const { pairedStoryResult, summarizePairs } = require('../src/astera-effect-pair');

const ROOT = path.resolve(__dirname, '..');
const ARTIFACTS_ROOT = path.join(ROOT, 'artifacts', 'astera-effect-stories-v1');

const silentLogger = { write() {} };
const caller = { id: 'astera-effect-stories-v1', is_global: true, plan: 'admin' };

function parseArgs(argv) {
  const out = { phase: 'first', mockMcp: false, storyId: null };
  for (const arg of argv.slice(2)) {
    if (arg === '--phase=final' || arg === '--final') out.phase = 'final';
    if (arg === '--phase=first' || arg === '--first') out.phase = 'first';
    if (arg === '--mock-mcp') out.mockMcp = true;
    if (arg.startsWith('--story-id=')) out.storyId = arg.slice('--story-id='.length).trim() || null;
  }
  return out;
}

function resolveParserClient(useMock) {
  if (useMock) return createMockJapaneseParserClient();
  const command = process.env.ASTERA_JAPANESE_PARSER_COMMAND || DEFAULT_DJPMCP;
  if (isJapaneseParserConfigured({ mode: 'stdio', command })) {
    return new JapaneseParserMCPClient({ mode: 'stdio', command });
  }
  return null;
}

function createEngine(mockMcp) {
  bootstrapRuntimeEnv();
  const parserClient = resolveParserClient(mockMcp);
  return new CanonicalAsteraEngine({
    poolSize: 2,
    logger: silentLogger,
    japaneseParserClient: parserClient || createMockJapaneseParserClient(),
    japaneseParserOptions: { command: process.env.ASTERA_JAPANESE_PARSER_COMMAND || DEFAULT_DJPMCP }
  });
}

function artifactsDir(phase) {
  return path.join(ARTIFACTS_ROOT, phase === 'final' ? 'final-run' : 'first-run');
}

function emptyAggregate() {
  return {
    BASELINE_TOTAL: 0,
    ASTERA_TOTAL: 0,
    IMPROVEMENT_DELTA: 0,
    IMPROVED_STORIES: 0,
    UNCHANGED_STORIES: 0,
    DEGRADED_STORIES: 0,
    HALLUCINATION_COUNT: 0,
    CONSTRAINT_LOSS_COUNT: 0,
    FALSE_CONFIRMATION_COUNT: 0,
    FINAL_DECISION_VIOLATION_COUNT: 0,
    TASK_DECOMPOSITION_FAILURE_COUNT: 0,
    UNCERTAINTY_LOSS_COUNT: 0,
    UNSUPPORTED_CONFIRMED_COUNT: 0,
    WIN: 0,
    TIE: 0,
    LOSS: 0,
    rubric_baseline: Object.fromEntries(RUBRIC.map((r) => [r.id, 0])),
    rubric_astera: Object.fromEntries(RUBRIC.map((r) => [r.id, 0])),
    rubric_delta: Object.fromEntries(RUBRIC.map((r) => [r.id, 0]))
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(FIXTURE)) {
    console.error(`Missing fixture ${FIXTURE}`);
    process.exit(1);
  }

  let stories = loadCorpus();
  if (args.storyId) {
    stories = stories.filter((s) => String(s.story_id) === args.storyId);
    if (!stories.length) {
      console.error(`Unknown story_id ${args.storyId}`);
      process.exit(1);
    }
  }

  const outDir = artifactsDir(args.phase);
  fs.mkdirSync(outDir, { recursive: true });

  const engine = createEngine(args.mockMcp);
  const summary = {
    phase: args.phase,
    mock_mcp: args.mockMcp,
    fixture: FIXTURE,
    corpus: stories.length,
    ran: 0,
    process_errors: 0,
    evidence_need_created: 0,
    ...emptyAggregate(),
    examples_improved: [],
    results: [],
    pair_rows: []
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
      let processError = null;
      try {
        out = await engine.process(input, caller);
      } catch (error) {
        processError = error;
        summary.process_errors += 1;
      }

      const result = out?.result || {};
      const tasks = result?.analysis_task_packet?.tasks || [];
      const taskHasEvidenceNeed = (t) => {
        const need = t.evidence_need;
        if (Array.isArray(need)) return need.length > 0;
        if (need && typeof need === 'object') return Object.keys(need).length > 0;
        return false;
      };
      const hasEvidenceNeed = tasks.some(taskHasEvidenceNeed)
        || tasks.some((t) => (t.canonical_plan?.search_plan?.queries || []).length > 0);
      if (hasEvidenceNeed) summary.evidence_need_created += 1;

      const evaluation = processError
        ? {
            story_outcome: 'degraded',
            BASELINE_TOTAL: 0,
            ASTERA_TOTAL: 0,
            IMPROVEMENT_DELTA: -30,
            added_value: {},
            violations: { process_throw: processError.message },
            process_error: { message: processError.message, code: processError.code }
          }
        : evaluateStory(story, out);
      const pair = processError ? { pair_outcome: 'LOSS', paired_delta: -1 } : pairedStoryResult(story, out);
      summary.pair_rows.push(pair);

      summary.BASELINE_TOTAL += evaluation.BASELINE_TOTAL ?? 0;
      summary.ASTERA_TOTAL += evaluation.ASTERA_TOTAL ?? 0;
      summary.IMPROVEMENT_DELTA += evaluation.IMPROVEMENT_DELTA ?? 0;

      if (evaluation.story_outcome === 'improved') summary.IMPROVED_STORIES += 1;
      else if (evaluation.story_outcome === 'degraded') summary.DEGRADED_STORIES += 1;
      else summary.UNCHANGED_STORIES += 1;

      const v = evaluation.violations || {};
      if (v.hallucination) summary.HALLUCINATION_COUNT += 1;
      if (v.constraint_loss) summary.CONSTRAINT_LOSS_COUNT += 1;
      if (v.false_confirmation) summary.FALSE_CONFIRMATION_COUNT += 1;
      if (v.final_decision_violation) summary.FINAL_DECISION_VIOLATION_COUNT += 1;
      if (v.task_decomposition_failure) summary.TASK_DECOMPOSITION_FAILURE_COUNT += 1;
      if (v.uncertainty_loss) summary.UNCERTAINTY_LOSS_COUNT += 1;
      if (v.unsupported_confirmed) summary.UNSUPPORTED_CONFIRMED_COUNT += 1;
      summary[pair.pair_outcome] = (summary[pair.pair_outcome] || 0) + 1;

      if (evaluation.baseline_scores && evaluation.astera_scores && evaluation.delta) {
        for (const r of RUBRIC) {
          summary.rubric_baseline[r.id] += evaluation.baseline_scores[r.id] ?? 0;
          summary.rubric_astera[r.id] += evaluation.astera_scores[r.id] ?? 0;
          summary.rubric_delta[r.id] += evaluation.delta[r.id] ?? 0;
        }
      }

      if (evaluation.story_outcome === 'improved' && summary.examples_improved.length < 12) {
        summary.examples_improved.push({
          story_id: story.story_id,
          scenario_kind: story.scenario_kind,
          user_input: story.user_input,
          IMPROVEMENT_DELTA: evaluation.IMPROVEMENT_DELTA,
          added_value: evaluation.added_value
        });
      }

      const artifact = {
        story_id: story.story_id,
        scenario_kind: story.scenario_kind,
        coverage_domain: story.coverage_domain,
        input,
        baseline: { material_excerpt: evaluation.baseline_text_excerpt },
        astera: {
          type: result.type,
          material_excerpt: evaluation.astera_text_excerpt,
          task_count: tasks.length,
          evidence_need_created: hasEvidenceNeed
        },
        evaluation,
        process_error: evaluation.process_error || null
      };

      fs.writeFileSync(path.join(outDir, `${story.story_id}.json`), JSON.stringify(artifact, null, 2));
      summary.results.push({
        story_id: story.story_id,
        outcome: evaluation.story_outcome,
        pair_outcome: pair.pair_outcome,
        paired_delta: pair.paired_delta,
        IMPROVEMENT_DELTA: evaluation.IMPROVEMENT_DELTA,
        ASTERA_TOTAL: evaluation.ASTERA_TOTAL,
        BASELINE_TOTAL: evaluation.BASELINE_TOTAL,
        violations: v,
        evaluation,
        rubric_delta: evaluation.delta
      });
    }
  } finally {
    await engine.destroy();
  }

  summary.pair_summary = summarizePairs(summary.pair_rows);
  delete summary.pair_rows;

  const reportName = args.phase === 'final' ? 'summary-final-run.json' : 'summary-first-run.json';
  fs.writeFileSync(path.join(outDir, reportName), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(ARTIFACTS_ROOT, reportName), JSON.stringify(summary, null, 2));

  console.log('RESULT:');
  console.log(`PHASE: ${summary.phase}`);
  console.log(`CORPUS: ${summary.corpus}`);
  console.log(`BASELINE_TOTAL: ${summary.BASELINE_TOTAL}`);
  console.log(`ASTERA_TOTAL: ${summary.ASTERA_TOTAL}`);
  console.log(`IMPROVEMENT_DELTA: ${summary.IMPROVEMENT_DELTA}`);
  console.log(`IMPROVED: ${summary.IMPROVED_STORIES} UNCHANGED: ${summary.UNCHANGED_STORIES} DEGRADED: ${summary.DEGRADED_STORIES}`);
  console.log(`WIN: ${summary.WIN} TIE: ${summary.TIE} LOSS: ${summary.LOSS}`);
  console.log(`EVIDENCE_NEED_CREATED: ${summary.evidence_need_created}`);
  console.log(`HALLUCINATION: ${summary.HALLUCINATION_COUNT} CONSTRAINT_LOSS: ${summary.CONSTRAINT_LOSS_COUNT} FALSE_CONFIRMATION: ${summary.FALSE_CONFIRMATION_COUNT} UNSUPPORTED_CONFIRMED: ${summary.UNSUPPORTED_CONFIRMED_COUNT}`);
  console.log(`ARTIFACTS: ${outDir}`);

  const criticalFail = summary.HALLUCINATION_COUNT > 0
    || summary.CONSTRAINT_LOSS_COUNT > 0
    || summary.FALSE_CONFIRMATION_COUNT > 0
    || summary.FINAL_DECISION_VIOLATION_COUNT > 0
    || summary.IMPROVEMENT_DELTA <= 0;

  process.exit(criticalFail ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
