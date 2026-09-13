'use strict';

const fs = require('node:fs');
const path = require('node:path');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');
const { routeDomainTemplates } = require('../src/domain-template-router');
const { createMockJapaneseParserClient } = require('../test/helpers/japanese-parser-mcp-mock');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'judgment-materials-100-stories.json');
const ARTIFACTS_DIR = path.join(ROOT, 'artifacts', 'judgment-materials-100');

const MAIN8_ORDER = Object.freeze([
  '01_purpose',
  '02_premise',
  '03_facts',
  '04_crisis',
  '05_opposition',
  '06_comparison',
  '07_evidence_status',
  '08_reinstruction'
]);

const silentLogger = { write() {} };
const tenant = { id: 'judgment-materials-100', is_global: true, plan: 'admin' };

function genreNumber(id) {
  const m = /^G(\d+)$/i.exec(String(id || ''));
  return m ? Number(m[1]) : NaN;
}

function isAdjacentDomain(expected, actual) {
  const a = genreNumber(expected);
  const b = genreNumber(actual);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) === 1;
}

function loadStories() {
  const raw = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  return raw.stories || raw;
}

function primaryLensId(result) {
  const perTask = result?.judgment?.lens_routing?.per_task;
  if (perTask && typeof perTask === 'object') {
    for (const entry of Object.values(perTask)) {
      if (entry?.primary?.id) return entry.primary.id;
    }
  }
  for (const tr of result?.task_results || []) {
    const id = tr?.task?.domain?.primary?.id;
    if (id) return id;
  }
  const routed = result?.domain_routing?.primary?.id;
  if (routed) return routed;
  return null;
}

function claimStatuses(result) {
  const records = result?.canonical_claims?.records || [];
  return records.map((r) => r?.confirmation?.status || r?.status || 'UNKNOWN');
}

function hasFalseConfirmation(result) {
  const statuses = claimStatuses(result);
  const evidenceStarted = result?.evidence_processing_started === true;
  const hasEvidence = (result?.task_results || []).some((tr) => tr?.evidence?.source_status === 'FINAL_VALID');
  if (!evidenceStarted && !hasEvidence) {
    return statuses.some((s) => s === 'CONFIRMED');
  }
  return false;
}

function main8Ok(result) {
  if (!result?.judgment?.order) return false;
  if (result.judgment.order.length !== 8) return false;
  for (let i = 0; i < MAIN8_ORDER.length; i += 1) {
    if (result.judgment.order[i] !== MAIN8_ORDER[i]) return false;
    if (!result.judgment[MAIN8_ORDER[i]]) return false;
  }
  return true;
}

function normativeViolation(result) {
  if (result?.decision_authority !== 'EXTERNAL_ONLY') return 'decision_authority_not_external';
  if (result?.no_normative_decision_generated !== true) return 'no_normative_decision_false';
  if (result?.comparison?.selected_candidate != null) return 'selected_candidate_set';
  const ranking = result?.comparison?.candidate_ranking;
  if (Array.isArray(ranking) && ranking.length > 0) return 'candidate_ranking_nonempty';
  return null;
}

function scoreStory(story, out) {
  const result = out?.result || {};
  const type = result.type;
  const taskCount = result.analysis_task_packet?.tasks?.length ?? result.request_model?.analysis_task_packet?.tasks?.length ?? 0;
  const primary = primaryLensId(result) || routeDomainTemplates({ question: story.question }).primary?.id;
  const parser = result.instruction_understanding?.parser
    || result.request_model?.instruction_understanding?.parser
    || null;
  const lang = story.language || (/[\u3040-\u30ff\u4e00-\u9faf]/.test(story.question) ? 'ja' : 'en');

  const snapshot = {
    id: story.id,
    expected_domain: story.expected_domain,
    type,
    task_count: taskCount,
    primary_lens_id: primary,
    parser,
    decision_authority: result.decision_authority ?? result.request_model?.decision_authority,
    no_normative_decision: result.no_normative_decision_generated ?? result.request_model?.no_normative_decision_generated,
    claim_statuses: claimStatuses(result),
    unresolved: result.analysis_task_packet?.unresolved || result.request_model?.analysis_task_packet?.unresolved || [],
    hard_blockers: result.analysis_task_packet?.hard_blockers || result.request_model?.analysis_task_packet?.hard_blockers || [],
    main8_keys: result.judgment?.order || null,
    false_confirm: hasFalseConfirmation(result)
  };

  const reasons = [];
  let status = 'PASS';

  const failClosedTypes = new Set(['task_graph_blocked', 'clarification_needed']);
  const cognitiveOk = type === 'cognitive_map' && main8Ok(result) && normativeViolation(result) === null
    && snapshot.decision_authority === 'EXTERNAL_ONLY' && snapshot.no_normative_decision === true;

  const failClosedOk = failClosedTypes.has(type)
    && result.judgment === undefined
    && !main8Ok(result);

  if (lang === 'ja' && parser && parser !== 'Deterministic-Japanese-Parser-MCP') {
    reasons.push('builtin_or_wrong_parser_for_ja');
    status = 'FAIL';
  }

  if (snapshot.false_confirm) {
    reasons.push('false_confirmation_without_evidence');
    status = 'FAIL';
  }

  const normErr = type === 'cognitive_map' ? normativeViolation(result) : null;
  if (normErr) {
    reasons.push(normErr);
    status = 'FAIL';
  }

  if (type === 'cognitive_map' && taskCount === 0) {
    reasons.push('cognitive_map_with_empty_tasks');
    status = 'FAIL';
  }

  if (type === 'cognitive_map' && !main8Ok(result)) {
    reasons.push('main8_incomplete');
    status = 'FAIL';
  }

  if (!cognitiveOk && !failClosedOk) {
    if (status !== 'FAIL') {
      reasons.push(`unexpected_result_type:${type}`);
      status = 'FAIL';
    }
  }

  let domainMatch = primary === story.expected_domain;
  let domainStatus = domainMatch ? 'hit' : 'miss';
  if (!domainMatch && primary && isAdjacentDomain(story.expected_domain, primary)) {
    domainStatus = 'adjacent_warn';
    if (status === 'PASS') status = 'WARN';
    reasons.push(`domain_adjacent:expected=${story.expected_domain},actual=${primary}`);
  } else if (!domainMatch) {
    domainStatus = 'miss';
    reasons.push(`domain_miss:expected=${story.expected_domain},actual=${primary || 'null'}`);
    status = 'FAIL';
  }

  return {
    status,
    domainStatus,
    reasons,
    snapshot,
    material_preview: String(out?.material?.text || '').slice(0, 400)
  };
}

async function main() {
  if (!fs.existsSync(FIXTURE)) {
    console.error(`Missing fixture: ${FIXTURE}. Run node scripts/build-judgment-materials-100-fixture.js first.`);
    process.exit(1);
  }

  const stories = loadStories();
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

  const engine = new CanonicalAsteraEngine({
    poolSize: 2,
    logger: silentLogger,
    japaneseParserClient: createMockJapaneseParserClient()
  });

  const summary = {
    corpus: stories.length,
    ran: 0,
    pass: 0,
    fail: 0,
    warn: 0,
    domain_hit: 0,
    main8_ok: 0,
    fail_closed_ok: 0,
    false_confirm: 0,
    fail_reasons: {},
    results: []
  };

  try {
    for (const story of stories) {
      summary.ran += 1;
      let out;
      try {
        out = await engine.process({
          question: story.question,
          context: story.context || '',
          language: story.language
        }, tenant);
      } catch (error) {
        const scored = {
          status: 'FAIL',
          domainStatus: 'miss',
          reasons: [`process_throw:${error.code || error.message}`],
          snapshot: { id: story.id, expected_domain: story.expected_domain },
          material_preview: ''
        };
        summary.results.push(scored);
        summary.fail += 1;
        for (const r of scored.reasons) summary.fail_reasons[r] = (summary.fail_reasons[r] || 0) + 1;
        fs.writeFileSync(
          path.join(ARTIFACTS_DIR, `${story.id}.json`),
          JSON.stringify({ story, error: { message: error.message, code: error.code }, scored }, null, 2)
        );
        continue;
      }

      const scored = scoreStory(story, out);
      summary.results.push({ id: story.id, ...scored });

      if (scored.domainStatus === 'hit') summary.domain_hit += 1;
      if (scored.snapshot.type === 'cognitive_map' && main8Ok(out.result)) summary.main8_ok += 1;
      if (['task_graph_blocked', 'clarification_needed'].includes(scored.snapshot.type)) summary.fail_closed_ok += 1;
      if (scored.snapshot.false_confirm) summary.false_confirm += 1;

      if (scored.status === 'PASS') summary.pass += 1;
      else if (scored.status === 'WARN') summary.warn += 1;
      else summary.fail += 1;

      for (const r of scored.reasons) {
        const key = r.split(':')[0];
        summary.fail_reasons[key] = (summary.fail_reasons[key] || 0) + 1;
      }

      fs.writeFileSync(
        path.join(ARTIFACTS_DIR, `${story.id}.json`),
        JSON.stringify({
          story,
          scored,
          result: {
            type: out.result?.type,
            task_count: out.result?.analysis_task_packet?.tasks?.length,
            primary_lens_id: scored.snapshot.primary_lens_id,
            decision_authority: out.result?.decision_authority,
            no_normative_decision_generated: out.result?.no_normative_decision_generated,
            claim_statuses: scored.snapshot.claim_statuses,
            parser: scored.snapshot.parser,
            unresolved: scored.snapshot.unresolved,
            hard_blockers: scored.snapshot.hard_blockers,
            judgment_order: out.result?.judgment?.order
          }
        }, null, 2)
      );
    }
  } finally {
    await engine.destroy();
  }

  const reportPath = path.join(ARTIFACTS_DIR, 'summary.json');
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));

  const topFail = Object.entries(summary.fail_reasons)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');

  console.log('RESULT:');
  console.log(`CORPUS: ${summary.corpus}`);
  console.log(`RAN: ${summary.ran}`);
  console.log(`PASS: ${summary.pass}`);
  console.log(`FAIL: ${summary.fail}`);
  console.log(`WARN: ${summary.warn}`);
  console.log(`DOMAIN_HIT: ${summary.domain_hit}/${summary.ran}`);
  console.log(`MAIN8_OK: ${summary.main8_ok}`);
  console.log(`FAIL_CLOSED_OK: ${summary.fail_closed_ok}`);
  console.log(`FALSE_CONFIRM: ${summary.false_confirm}`);
  console.log(`TOP_FAIL_REASONS: ${topFail || 'none'}`);
  console.log(`ARTIFACTS: ${ARTIFACTS_DIR}`);

  const failSamples = summary.results.filter((r) => r.status === 'FAIL').slice(0, 5);
  if (failSamples.length) {
    console.log('SAMPLE_FAILS:');
    for (const f of failSamples) {
      console.log(`- ${f.id || f.snapshot?.id}: ${(f.reasons || []).join('; ')}`);
    }
  }

  process.exit(summary.fail > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
