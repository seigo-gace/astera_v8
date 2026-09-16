'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadCorpus, FIXTURE } = require('./astera-effect-stories-unseen-v1-corpus');
const { baselineMaterial, asteraMaterialText, evaluateStory } = require('../src/astera-effect-rubric');
const { pairedStoryResult } = require('../src/astera-effect-pair');

const ROOT = path.resolve(__dirname, '..');
const ARTIFACTS = path.join(ROOT, 'artifacts', 'astera-effect-ablation');

const ABLATION_IDS = ['US-003', 'US-005', 'US-009', 'US-012'];

function projectMaterial(stage, story, fullOut) {
  const result = fullOut?.result || {};
  const base = baselineMaterial(story);
  if (stage === 'raw') {
    return { material: { text: base }, result: { type: 'baseline_only' } };
  }
  if (stage === 'decomposition') {
    return {
      material: { text: `${base}\n${JSON.stringify(result.analysis_task_packet?.tasks || [])}` },
      result: { ...result, judgment: {}, canonical_claims: null, comparison: {}, task_results: [] }
    };
  }
  if (stage === 'canonical_lens') {
    return {
      material: { text: `${base}\n${JSON.stringify(result.canonical_claims || {})}` },
      result: { ...result, judgment: {}, task_results: [] }
    };
  }
  if (stage === 'evidence') {
    const ev = (result.task_results || []).map((tr) => tr.evidence).filter(Boolean);
    return {
      material: { text: `${asteraMaterialText(fullOut)}\n${JSON.stringify(ev)}` },
      result: { ...result, judgment: result.judgment || {} }
    };
  }
  return fullOut;
}

async function main() {
  if (!fs.existsSync(FIXTURE)) {
    console.error(`Missing ${FIXTURE}`);
    process.exit(1);
  }
  const stories = loadCorpus().filter((s) => ABLATION_IDS.includes(s.story_id));
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const stages = ['raw', 'decomposition', 'canonical_lens', 'evidence', 'full'];
  const report = { stories: [], stages };

  for (const story of stories) {
    const storyReport = { story_id: story.story_id, by_stage: {} };
    const fullOut = {
      material: { text: baselineMaterial(story) },
      result: {
        type: 'cognitive_map',
        decision_authority: 'EXTERNAL_ONLY',
        no_normative_decision_generated: true,
        analysis_task_packet: { user_goal: story.user_input, tasks: [{ id: 'T01', purpose: story.user_input, source_span: { text: story.user_input } }] },
        canonical_claims: { undetermined_count: 1, records: [] },
        judgment: { order: ['01_purpose'], '01_purpose': { summary: story.user_input.slice(0, 80), items: [] } }
      }
    };
    for (const stage of stages) {
      const projected = projectMaterial(stage, story, fullOut);
      const evaluation = evaluateStory(story, projected);
      storyReport.by_stage[stage] = {
        IMPROVEMENT_DELTA: evaluation.IMPROVEMENT_DELTA,
        outcome: evaluation.story_outcome,
        pair: pairedStoryResult(story, projected).pair_outcome
      };
    }
    report.stories.push(storyReport);
  }

  fs.writeFileSync(path.join(ARTIFACTS, 'summary.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
