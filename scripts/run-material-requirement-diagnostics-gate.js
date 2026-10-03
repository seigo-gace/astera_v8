'use strict';

const fs = require('node:fs');
const path = require('node:path');
const AsteraEngine = require('../src/astera-engine');
const { diagnoseMaterialRequirementGraph } = require('../src/runtime/material-requirement-diagnostics');
const { bootstrapRuntimeEnv } = require('../src/evidence-search/api/runtime-client');
const {
  JapaneseParserMCPClient,
  isJapaneseParserConfigured,
  resolveHttpUrl,
  resolveHttpApiKey
} = require('../src/japanese-parser-mcp-client');
const { loadUniversalCorpus } = require('./universal-judgment-corpus-v1');

const ROOT = path.resolve(__dirname, '..');
const ARTIFACT_ROOT = path.resolve(process.env.ASTERA_UNIVERSAL_ARTIFACT_ROOT || path.join(ROOT, 'artifacts', 'universal-judgment-v1'));
const silentLogger = { write() {} };

function increment(target, key, amount = 1) {
  if (!key) return;
  target[key] = (target[key] || 0) + amount;
}

function mergeCounts(target, source) {
  for (const [key, value] of Object.entries(source || {})) increment(target, key, Number(value) || 0);
}

function writeJson(name, value) {
  fs.mkdirSync(ARTIFACT_ROOT, { recursive: true });
  fs.writeFileSync(path.join(ARTIFACT_ROOT, name), JSON.stringify(value, null, 2));
}

async function main() {
  bootstrapRuntimeEnv();
  const corpus = loadUniversalCorpus();
  if (!corpus.length) throw new Error('Universal corpus is empty.');

  const mode = String(process.env.ASTERA_JAPANESE_PARSER_MODE || '').trim().toLowerCase();
  const url = resolveHttpUrl();
  const apiKey = resolveHttpApiKey();
  if (mode !== 'http' || !isJapaneseParserConfigured({ mode: 'http', url, apiKey })) {
    throw new Error('Material Requirement diagnostics require the real Japanese Parser HTTP runtime; mock fallback is forbidden.');
  }

  const parserClient = new JapaneseParserMCPClient({ mode: 'http', url, apiKey });
  const engine = new AsteraEngine({
    poolSize: 4,
    logger: silentLogger,
    japaneseParserClient: parserClient,
    japaneseParserOptions: { mode: 'http', url, apiKey },
    evidenceSearchClient: null
  });

  const cases = [];
  try {
    for (const testCase of corpus) {
      try {
        const prepared = await engine.prepareRequest({
          question: testCase.input,
          language: testCase.language,
          deadline_ms: testCase.kind === 'stress' ? 20000 : 12000
        });
        const graph = prepared?.analysis_task_packet?.material_requirement_graph || null;
        const diagnostic = diagnoseMaterialRequirementGraph(graph, {
          expectedMinRequests: testCase.expected?.min_requests || 1
        });
        cases.push({
          case_id: testCase.id,
          pair: testCase.pair || null,
          kind: testCase.kind,
          language: testCase.language,
          genre: testCase.expected?.genre || null,
          expected_min_requests: testCase.expected?.min_requests || 1,
          ...diagnostic
        });
      } catch (error) {
        cases.push({
          case_id: testCase.id,
          pair: testCase.pair || null,
          kind: testCase.kind,
          language: testCase.language,
          genre: testCase.expected?.genre || null,
          expected_min_requests: testCase.expected?.min_requests || 1,
          pass: false,
          present: false,
          accounting_complete: false,
          decision_ready: false,
          request_count: 0,
          node_count: 0,
          gap_count: 0,
          gaps_by_kind: {},
          gaps_by_status: {},
          failures: [{ code: 'MATERIAL_REQUIREMENT_PREPARE_ERROR', message: error.message, error_code: error.code || null }],
          requests: []
        });
      }
    }
  } finally {
    await engine.destroy();
  }

  const structuralFailures = cases.filter((entry) => !entry.pass);
  const gapsByKind = {};
  const gapsByStatus = {};
  const nodesByKind = {};
  const byLanguage = {};
  const byGenre = {};
  for (const entry of cases) {
    mergeCounts(gapsByKind, entry.gaps_by_kind);
    mergeCounts(gapsByStatus, entry.gaps_by_status);
    mergeCounts(nodesByKind, entry.nodes_by_kind);
    byLanguage[entry.language] = byLanguage[entry.language] || { total: 0, structural_pass: 0, structural_fail: 0, accounting_complete: 0, decision_ready: 0 };
    const lang = byLanguage[entry.language];
    lang.total += 1;
    lang[entry.pass ? 'structural_pass' : 'structural_fail'] += 1;
    if (entry.accounting_complete) lang.accounting_complete += 1;
    if (entry.decision_ready) lang.decision_ready += 1;
    if (entry.genre) {
      byGenre[entry.genre] = byGenre[entry.genre] || { total: 0, structural_pass: 0, structural_fail: 0, accounting_complete: 0, decision_ready: 0 };
      const genre = byGenre[entry.genre];
      genre.total += 1;
      genre[entry.pass ? 'structural_pass' : 'structural_fail'] += 1;
      if (entry.accounting_complete) genre.accounting_complete += 1;
      if (entry.decision_ready) genre.decision_ready += 1;
    }
  }

  const summary = {
    schema: 'astera.material-requirement-diagnostics-gate.v1',
    purpose: 'Verify that decision-backward Material Requirement Graphs exist, cover Requests, and account for every required node. MISSING/UNRESOLVED/CONFLICTING material is diagnostic content, not an integrity failure by itself.',
    total_cases: cases.length,
    cases_with_graph: cases.filter((entry) => entry.present).length,
    structural_pass: cases.length - structuralFailures.length,
    structural_fail: structuralFailures.length,
    accounting_complete_cases: cases.filter((entry) => entry.accounting_complete).length,
    decision_ready_cases: cases.filter((entry) => entry.decision_ready).length,
    total_nodes: cases.reduce((sum, entry) => sum + Number(entry.node_count || 0), 0),
    total_gaps: cases.reduce((sum, entry) => sum + Number(entry.gap_count || 0), 0),
    nodes_by_kind: nodesByKind,
    gaps_by_kind: gapsByKind,
    gaps_by_status: gapsByStatus,
    by_language: byLanguage,
    by_genre: byGenre,
    acceptance: {
      every_case_has_graph: true,
      every_case_structurally_valid: true,
      every_case_accounting_complete: true,
      missing_information_is_allowed_when_explicitly_accounted: true,
      decision_ready_required: false,
      domain_refinement_required_for_integrity: false
    }
  };

  writeJson('material-requirement-summary.json', summary);
  writeJson('material-requirement-cases.json', cases);
  writeJson('material-requirement-structural-failures.json', structuralFailures);

  console.log(`MATERIAL_REQUIREMENT_TOTAL=${summary.total_cases}`);
  console.log(`MATERIAL_REQUIREMENT_GRAPH_COVERAGE=${summary.cases_with_graph}/${summary.total_cases}`);
  console.log(`MATERIAL_REQUIREMENT_STRUCTURAL_PASS=${summary.structural_pass}`);
  console.log(`MATERIAL_REQUIREMENT_STRUCTURAL_FAIL=${summary.structural_fail}`);
  console.log(`MATERIAL_REQUIREMENT_ACCOUNTING_COMPLETE=${summary.accounting_complete_cases}/${summary.total_cases}`);
  console.log(`MATERIAL_REQUIREMENT_DECISION_READY=${summary.decision_ready_cases}/${summary.total_cases}`);
  console.log(`MATERIAL_REQUIREMENT_TOTAL_GAPS=${summary.total_gaps}`);
  console.log(`MATERIAL_REQUIREMENT_GAPS_BY_KIND=${JSON.stringify(summary.gaps_by_kind)}`);
  console.log(`MATERIAL_REQUIREMENT_GAPS_BY_STATUS=${JSON.stringify(summary.gaps_by_status)}`);
  console.log(`MATERIAL_REQUIREMENT_ARTIFACT_ROOT=${ARTIFACT_ROOT}`);

  if (structuralFailures.length || summary.cases_with_graph !== summary.total_cases || summary.accounting_complete_cases !== summary.total_cases) {
    process.exit(1);
  }
  console.log('MATERIAL_REQUIREMENT_DIAGNOSTICS_GATE=PASS');
}

main().catch((error) => {
  fs.mkdirSync(ARTIFACT_ROOT, { recursive: true });
  fs.writeFileSync(path.join(ARTIFACT_ROOT, 'material-requirement-fatal.json'), JSON.stringify({ message: error.message, stack: error.stack }, null, 2));
  console.error(`MATERIAL_REQUIREMENT_DIAGNOSTICS_FATAL=${error.message}`);
  process.exit(2);
});
