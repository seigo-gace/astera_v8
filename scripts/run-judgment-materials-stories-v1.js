'use strict';

const fs = require('node:fs');
const path = require('node:path');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');
const AsteraEngine = require('../src/astera-engine');
const EvidenceSearchClient = require('../src/evidence-search/api/client');
const { JapaneseParserMCPClient, isJapaneseParserConfigured, DEFAULT_DJPMCP } = require('../src/japanese-parser-mcp-client');
const { createMockJapaneseParserClient } = require('../test/helpers/japanese-parser-mcp-mock');
const { buildCorpus, FIXTURE } = require('./judgment-materials-stories-v1-corpus');
const { routeDomainTemplates } = require('../src/domain-template-router');

const ROOT = path.resolve(__dirname, '..');
const ARTIFACTS_DIR = path.join(ROOT, 'artifacts', 'judgment-materials-stories-v1');

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

const CRITERIA = Object.freeze([
  'A_intent_purpose',
  'B_task_decomposition',
  'C_premise',
  'D_claim',
  'E_evidence_need',
  'F_authority',
  'G_support_counter',
  'H_contradiction',
  'I_uncertainty',
  'J_risk',
  'K_comparison',
  'L_no_false_confirmation',
  'M_no_final_decision',
  'N_main8_integrity',
  'O_fail_closed'
]);

const silentLogger = { write() {} };
const tenant = { id: 'judgment-materials-stories-v1', is_global: true, plan: 'admin' };

function parseArgs(argv) {
  const out = { phase: 'first', mockMcp: false, mockRegression: false };
  for (const arg of argv.slice(2)) {
    if (arg === '--phase=final' || arg === '--final') out.phase = 'final';
    if (arg === '--phase=first' || arg === '--first') out.phase = 'first';
    if (arg === '--mock-mcp') out.mockMcp = true;
    if (arg === '--mock-regression') out.mockRegression = true;
  }
  return out;
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
  return result?.domain_routing?.primary?.id || null;
}

function resolvedDomain(story, result) {
  const fromResult = primaryLensId(result);
  if (fromResult) return fromResult;
  const question = story?.user_story || '';
  const context = story?.known_context || '';
  return routeDomainTemplates({ question, context }).primary?.id || null;
}

function claimStatuses(result) {
  return (result?.canonical_claims?.records || []).map(
    (r) => r?.confirmation?.status || r?.status || 'UNKNOWN'
  );
}

function hasFalseConfirmation(result) {
  const statuses = claimStatuses(result);
  const evidenceStarted = result?.evidence_processing_started === true;
  const hasEvidence = (result?.task_results || []).some(
    (tr) => tr?.evidence?.source_status === 'FINAL_VALID'
  );
  if (!evidenceStarted && !hasEvidence) {
    return statuses.some((s) => s === 'CONFIRMED');
  }
  return false;
}

function main8Ok(result) {
  if (!result?.judgment?.order || result.judgment.order.length !== 8) return false;
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
  const text = JSON.stringify(result?.judgment || {});
  if (/\b(winner|採用案|勝者|A案採用|B案が優れ)\b/i.test(text)) return 'winner_language_in_judgment';
  return null;
}

function extractActual(story, result, materialText) {
  const packet = result?.analysis_task_packet || result?.request_model?.analysis_task_packet || {};
  const tasks = packet.tasks || [];
  const claims = result?.canonical_claims?.records || [];
  const evidenceNeeds = tasks.flatMap((t) => t.evidence_need || []);
  const evidenceResults = (result?.task_results || []).map((tr) => ({
    task_id: tr.task?.id,
    search_state: tr.evidence?.search_state,
    source_status: tr.evidence?.source_status,
    payment_executed: tr.evidence?.payment_executed === true
  }));
  return {
    type: result?.type,
    domain: resolvedDomain(story, result),
    tasks: tasks.map((t) => ({ id: t.id, action: t.action, objective: t.objective })),
    claims: claims.map((c) => ({
      id: c.claim?.claim_id,
      status: c.confirmation?.status,
      text: c.claim?.text
    })),
    evidence_needs: evidenceNeeds,
    evidence_results: evidenceResults,
    support: result?.facts?.confirmed || [],
    counter: result?.judgment?.['05_opposition']?.items || [],
    uncertainties: [
      ...(packet.unresolved || []),
      ...(result?.canonical_claims?.undetermined_count ? [`undetermined=${result.canonical_claims.undetermined_count}`] : [])
    ],
    contradictions: packet.conflicts || [],
    main8: result?.judgment?.order || null,
    material_excerpt: String(materialText || '').slice(0, 800),
    parser:
      result?.instruction_understanding?.parser
      || result?.request_model?.instruction_understanding?.parser
      || null,
    hard_blockers: packet.hard_blockers || [],
    false_confirm: hasFalseConfirmation(result)
  };
}

function domainOk(story, actualDomain, result) {
  const domain = actualDomain || resolvedDomain(story, result);
  const expected = story.domain_expected;
  const secondary = story.secondary_domains || [];
  if (domain === expected) return true;
  if (secondary.includes(domain)) return true;
  return false;
}

function scoreCriteria(story, result, actual) {
  const scores = {};
  const fail_reasons = [];
  const type = result?.type;
  const fc = story.expected_fail_closed_conditions || {};
  const mustFailClosed = fc.when === 'hard_blocker';
  const expectMain8 = story.expected_main8_characteristics?.all_eight_sections !== false;

  function fail(key, reason) {
    scores[key] = 'FAIL';
    fail_reasons.push(`${key}:${reason}`);
  }
  function pass(key) {
    scores[key] = 'PASS';
  }

  // A Intent
  if (type === 'cognitive_map' && result?.judgment?.['01_purpose']) pass('A_intent_purpose');
  else if (mustFailClosed && ['task_graph_blocked', 'clarification_needed'].includes(type)) pass('A_intent_purpose');
  else fail('A_intent_purpose', `type=${type}`);

  // B Task
  const minTasks = story.expected_tasks?.min_count ?? 1;
  const taskCount = actual.tasks.length;
  if (mustFailClosed) {
    if (taskCount >= 0) pass('B_task_decomposition');
  } else if (taskCount >= minTasks) pass('B_task_decomposition');
  else fail('B_task_decomposition', `task_count=${taskCount}<${minTasks}`);

  // C Premise
  const prem = result?.judgment?.['02_premise'];
  if (mustFailClosed || (prem && (prem.items?.length || prem.summary))) pass('C_premise');
  else fail('C_premise', 'missing_premise_section');

  // D Claim
  const minClaims = story.expected_claims?.min_count ?? 1;
  if (mustFailClosed || actual.claims.length >= minClaims) pass('D_claim');
  else fail('D_claim', `claims=${actual.claims.length}`);

  // E Evidence need
  const needsPlan = story.expected_evidence_needs?.requires_search_plan_when_claims;
  const hasNeed = actual.evidence_needs.length > 0
    || (result?.task_results || []).some((tr) => (tr?.canonical?.search_plan?.queries || []).length > 0);
  if (!needsPlan || hasNeed || mustFailClosed) pass('E_evidence_need');
  else fail('E_evidence_need', 'no_evidence_need_or_search_plan');

  // F Authority
  if (result?.decision_authority === 'EXTERNAL_ONLY') pass('F_authority');
  else fail('F_authority', String(result?.decision_authority));

  // G Support/counter
  const opp = result?.judgment?.['05_opposition'];
  if (mustFailClosed || opp?.items?.length || opp?.summary) pass('G_support_counter');
  else fail('G_support_counter', 'missing_opposition');

  // H Contradiction
  const tags = story.cross_cutting_tags || [];
  if (tags.includes('一次情報矛盾') || tags.includes('禁止付き')) {
    if (actual.contradictions.length || actual.hard_blockers.length || mustFailClosed) pass('H_contradiction');
    else fail('H_contradiction', 'contradiction_not_preserved');
  } else pass('H_contradiction');

  // I Uncertainty
  const needUnc = story.expected_uncertainties?.must_surface_unresolved_or_undetermined;
  const undetermined = (result?.canonical_claims?.undetermined_count ?? 0) > 0
    || actual.uncertainties.length > 0
    || (result?.judgment?.claim_state?.undetermined_claim_count ?? 0) > 0;
  if (!needUnc || undetermined || mustFailClosed) pass('I_uncertainty');
  else fail('I_uncertainty', 'uncertainty_not_preserved');

  // J Risk
  const crisis = result?.judgment?.['04_crisis'];
  if (mustFailClosed || crisis?.items?.length || crisis?.summary) pass('J_risk');
  else fail('J_risk', 'missing_crisis');

  // K Comparison
  const cmp = result?.judgment?.['06_comparison'];
  const normErr = type === 'cognitive_map' ? normativeViolation(result) : null;
  if (mustFailClosed) pass('K_comparison');
  else if (cmp && !normErr) pass('K_comparison');
  else fail('K_comparison', normErr || 'comparison_missing');

  // L False confirm
  if (!actual.false_confirm) pass('L_no_false_confirmation');
  else fail('L_no_false_confirmation', 'confirmed_without_evidence');

  // M No final decision
  if (type === 'cognitive_map' && normativeViolation(result)) fail('M_no_final_decision', normativeViolation(result));
  else if (mustFailClosed) pass('M_no_final_decision');
  else pass('M_no_final_decision');

  // N Main8
  if (mustFailClosed) {
    if (!main8Ok(result)) pass('N_main8_integrity');
    else fail('N_main8_integrity', 'main8_should_not_complete');
  } else if (expectMain8 && main8Ok(result)) pass('N_main8_integrity');
  else if (!expectMain8) pass('N_main8_integrity');
  else fail('N_main8_integrity', 'main8_incomplete');

  // O Fail closed
  if (mustFailClosed) {
    if (['task_graph_blocked', 'clarification_needed'].includes(type) && !main8Ok(result)) pass('O_fail_closed');
    else fail('O_fail_closed', `expected_fail_closed_got_${type}`);
  } else if (['task_graph_blocked', 'clarification_needed'].includes(type)) {
    fail('O_fail_closed', `unexpected_fail_closed:${type}`);
  } else pass('O_fail_closed');

  // Domain auxiliary (not pass gate alone)
  scores.domain_auxiliary = domainOk(story, actual.domain, result) ? 'PASS' : 'FAIL';
  if (scores.domain_auxiliary === 'FAIL') {
    const resolved = actual.domain || resolvedDomain(story, result);
    fail_reasons.push(`domain:expected=${story.domain_expected},actual=${resolved || 'null'}`);
  }

  const majorFail = CRITERIA.some((c) => scores[c] === 'FAIL');
  return {
    scores,
    overall: majorFail ? 'FAIL' : 'PASS',
    fail_reasons
  };
}

function resolveParserClient(useMock) {
  if (useMock) return createMockJapaneseParserClient();
  const command = process.env.ASTERA_JAPANESE_PARSER_COMMAND || DEFAULT_DJPMCP;
  if (isJapaneseParserConfigured({ mode: 'stdio', command })) {
    return new JapaneseParserMCPClient({ mode: 'stdio', command });
  }
  return null;
}

function isLiveEvidenceStory(story) {
  return /^G(0[1-9]|1[0-9]|2[0-9]|3[0-8])-01$/.test(String(story.story_id || ''));
}

function createEvidenceClientOrNull() {
  try {
    return new EvidenceSearchClient({});
  } catch {
    return null;
  }
}

function createEngine({ mockMcp, liveEvidence }) {
  const parserClient = resolveParserClient(mockMcp);
  const base = {
    poolSize: 2,
    logger: silentLogger,
    japaneseParserClient: parserClient || createMockJapaneseParserClient(),
    japaneseParserOptions: { command: process.env.ASTERA_JAPANESE_PARSER_COMMAND || DEFAULT_DJPMCP }
  };
  if (liveEvidence && !mockMcp) {
    const evidenceSearchClient = createEvidenceClientOrNull();
    if (!evidenceSearchClient) return { engine: new CanonicalAsteraEngine(base), liveEvidenceMode: 'UNAVAILABLE' };
    return {
      engine: new AsteraEngine({ ...base, evidenceSearchClient }),
      liveEvidenceMode: 'LIVE_FREE_PROJECTION'
    };
  }
  return { engine: new CanonicalAsteraEngine(base), liveEvidenceMode: 'RECORD_ONLY' };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(FIXTURE)) {
    console.error(`Missing fixture ${FIXTURE}`);
    process.exit(1);
  }

  const stories = buildCorpus();
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

  const realMcpAttempted = !args.mockMcp;
  let realMcpFailures = 0;
  const { engine, liveEvidenceMode: defaultLiveMode } = createEngine({ mockMcp: args.mockMcp, liveEvidence: false });

  const summary = {
    phase: args.phase,
    mock_mcp: args.mockMcp,
    fixture: FIXTURE,
    corpus: stories.length,
    ran: 0,
    pass: 0,
    fail: 0,
    criteria_pass: Object.fromEntries(CRITERIA.map((c) => [c, 0])),
    domain_correct: 0,
    live_evidence_domains: [],
    live_evidence_report: [],
    external_evidence_failures: [],
    real_mcp_e2e: { attempted: realMcpAttempted, parser_failures: 0, note: '' },
    mock_mcp_regression: args.mockRegression ? { ran: true, mode: 'mock_stdio' } : null,
    results: []
  };

  try {
    for (const story of stories) {
      summary.ran += 1;
      const input = {
        question: story.user_story,
        context: story.known_context || '',
        language: 'ja'
      };
      const liveEvidence = isLiveEvidenceStory(story) && !args.mockMcp;
      let storyEngine = engine;
      let liveMode = defaultLiveMode;
      if (liveEvidence) {
        const built = createEngine({ mockMcp: false, liveEvidence: true });
        storyEngine = built.engine;
        liveMode = built.liveEvidenceMode;
      }

      let out;
      let processError = null;
      try {
        out = await storyEngine.process(input, tenant);
      } catch (error) {
        processError = error;
        if (realMcpAttempted && /PARSER|Japanese Parser/i.test(String(error.message))) {
          realMcpFailures += 1;
        }
      }

      const result = out?.result || {};
      const actual = extractActual(story, result, out?.material?.text);
      if (processError) {
        actual.process_error = { message: processError.message, code: processError.code };
      }

      const scored = processError
        ? { scores: {}, overall: 'FAIL', fail_reasons: [`process_throw:${processError.code || processError.message}`] }
        : scoreCriteria(story, result, actual);

      if (scored.overall === 'PASS') summary.pass += 1;
      else summary.fail += 1;

      if (domainOk(story, actual.domain, result)) summary.domain_correct += 1;
      if (liveEvidence) {
        summary.live_evidence_domains.push(story.story_id);
        const evidenceRows = actual.evidence_results || [];
        const external = evidenceRows.some((row) => /403|timeout|EXTERNAL|FAILED|NOT_EXECUTED/i.test(String(row.search_state || row.source_status || '')));
        summary.live_evidence_report.push({
          story_id: story.story_id,
          domain: actual.domain,
          mode: liveMode,
          evidence_results: evidenceRows,
          external: external || liveMode === 'UNAVAILABLE'
        });
        if (external || liveMode === 'UNAVAILABLE') {
          summary.external_evidence_failures.push(story.story_id);
        }
      }
      if (liveEvidence && storyEngine !== engine && typeof storyEngine.destroy === 'function') {
        await storyEngine.destroy();
      }

      for (const c of CRITERIA) {
        if (scored.scores[c] === 'PASS') summary.criteria_pass[c] += 1;
      }

      const artifact = {
        story_id: story.story_id,
        input,
        expected: story,
        actual,
        domain: actual.domain,
        tasks: actual.tasks,
        claims: actual.claims,
        evidence_needs: actual.evidence_needs,
        evidence_results: actual.evidence_results,
        support: actual.support,
        counter: actual.counter,
        uncertainties: actual.uncertainties,
        contradictions: actual.contradictions,
        main8: actual.main8,
        score: scored.scores,
        overall: scored.overall,
        fail_reasons: scored.fail_reasons,
        live_evidence: liveEvidence
      };

      fs.writeFileSync(
        path.join(ARTIFACTS_DIR, `${story.story_id}.json`),
        JSON.stringify(artifact, null, 2)
      );
      summary.results.push({ story_id: story.story_id, overall: scored.overall, fail_reasons: scored.fail_reasons });
    }
  } finally {
    await engine.destroy();
  }

  summary.real_mcp_e2e.parser_failures = realMcpFailures;
  const djpmcpConfigured = isJapaneseParserConfigured({
    mode: 'stdio',
    command: process.env.ASTERA_JAPANESE_PARSER_COMMAND || DEFAULT_DJPMCP
  });
  summary.real_mcp_e2e.note = realMcpAttempted
    ? (args.mockMcp ? 'mock_mode' : (djpmcpConfigured ? 'stdio_djpmcp' : 'fallback_mock_no_djpmcp'))
    : 'mock_mode';

  let reportName = args.phase === 'final' ? 'summary-final.json' : 'summary-first-run.json';
  if (args.mockRegression) reportName = 'summary-mock-regression.json';
  fs.writeFileSync(path.join(ARTIFACTS_DIR, reportName), JSON.stringify(summary, null, 2));
  if (!args.mockMcp && summary.live_evidence_report.length) {
    fs.writeFileSync(
      path.join(ARTIFACTS_DIR, 'summary-live-evidence.json'),
      JSON.stringify({
        domains_targeted: 38,
        ran: summary.live_evidence_report.length,
        external_failures: summary.external_evidence_failures,
        rows: summary.live_evidence_report
      }, null, 2)
    );
  }

  console.log('RESULT:');
  console.log(`PHASE: ${summary.phase}`);
  console.log(`CORPUS: ${summary.corpus}`);
  console.log(`PASS: ${summary.pass}`);
  console.log(`FAIL: ${summary.fail}`);
  console.log(`DOMAIN_CORRECT: ${summary.domain_correct}`);
  console.log(`REAL_MCP: ${summary.real_mcp_e2e.note} failures=${realMcpFailures}`);
  console.log(`LIVE_EVIDENCE_STORIES: ${summary.live_evidence_domains.length}`);
  console.log(`ARTIFACTS: ${ARTIFACTS_DIR}`);

  process.exit(summary.fail > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
