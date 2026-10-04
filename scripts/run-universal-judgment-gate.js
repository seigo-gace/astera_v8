'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const AsteraEngine = require('../src/astera-engine');
const { TRACE_SCHEMA, REQUIRED_SPANS } = require('../src/runtime/runtime-trace');
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
const caller = { id: 'universal-judgment-gate', is_global: true, plan: 'admin' };
const silentLogger = { write() {} };

const INTERNAL_PUBLIC_PATTERNS = [
  /Task Wave/iu,
  /SearchExecution/iu,
  /EvidenceQuality/iu,
  /confirmed_claim_ids/iu,
  /support_evidence_refs/iu,
  /parser_overall_status/iu,
  /meaning_unresolved/iu,
  /candidate_id/iu,
  /binding_id/iu,
  /RETRIEVAL_FAILED/iu,
  /INSUFFICIENT_TRADE_OFF_MATERIAL/iu,
  /Alternative evidence angle/iu,
  /\b(?:PARSE|PARSER|TASK_GRAPH|SCOPE)_[A-Z0-9_]+\b/u,
  /stack trace/iu,
  /\bat\s+\S+\s+\([^\n)]+:\d+:\d+\)/u,
  /\/home\/[^\s]+/u
];

const FINAL_DECISION_PATTERNS = [
  /これが最適(?:です|だ)/u,
  /これを採用すべき/u,
  /最善(?:です|だ)/u,
  /the best option is/iu,
  /you should choose/iu,
  /we recommend choosing/iu,
  /must select/iu
];

const FALSE_EXTERNAL_FAILURE_PATTERNS = [
  /外部根拠(?:の取得|検索)?(?:に)?失敗/u,
  /外部Evidence(?:の取得|検索)?(?:に)?失敗/iu,
  /external evidence (?:search |retrieval )?failed/iu
];

function parseArgs(argv) {
  const out = { kind: null, caseId: null, maxCases: 0 };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--kind=')) out.kind = arg.slice(7).trim() || null;
    if (arg.startsWith('--case-id=')) out.caseId = arg.slice(10).trim() || null;
    if (arg.startsWith('--max-cases=')) out.maxCases = Number(arg.slice(12)) || 0;
  }
  return out;
}

function normalize(s) {
  return String(s || '').normalize('NFKC').toLowerCase();
}

function sectionCount(text) {
  return String(text || '').split(/^---$/m).length;
}

function section07(text) {
  const sections = String(text || '').split(/^---$/m);
  return sections[6] || '';
}

function uniqueRequestIds(text) {
  return [...new Set((String(text || '').match(/\bR\d{2,}\b/gu) || []))];
}

function countTerms(text, terms) {
  const n = normalize(text);
  return [...new Set((terms || []).filter((term) => n.includes(normalize(term))))];
}

function anchorCoverage(text, anchors) {
  if (!Array.isArray(anchors) || !anchors.length) return { matched: [], ratio: 1 };
  const matched = countTerms(text, anchors);
  return { matched, ratio: matched.length / anchors.length };
}

function patternMatches(pattern, text) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  return [...String(text || '').matchAll(re)].map((match) => String(match[0] || '')).filter(Boolean);
}

function novelPatternMatches(patterns, material, input) {
  const inputText = normalize(input);
  const found = [];
  for (const pattern of patterns) {
    const matches = patternMatches(pattern, material);
    if (matches.some((fragment) => !inputText.includes(normalize(fragment)))) found.push(pattern.source);
  }
  return found;
}

function validateRuntimeTrace(trace) {
  const spanNames = new Set((trace?.spans || []).map((span) => String(span?.name || '')).filter(Boolean));
  const missingSpans = REQUIRED_SPANS.filter((name) => !spanNames.has(name));
  const complete = Boolean(
    trace
    && trace.schema_version === TRACE_SCHEMA
    && trace.status === 'COMPLETE'
    && Array.isArray(trace.missing_spans)
    && trace.missing_spans.length === 0
    && missingSpans.length === 0
  );
  return {
    complete,
    schema_version: trace?.schema_version || null,
    status: trace?.status || null,
    span_count: spanNames.size,
    missing_spans: missingSpans
  };
}

function evaluateCase(testCase, out, durationMs) {
  const result = out?.result || {};
  const material = String(out?.material?.text || '');
  const tasks = result?.analysis_task_packet?.tasks || [];
  const requests = uniqueRequestIds(material);
  const expected = testCase.expected || {};
  const failures = [];

  const main8Sections = sectionCount(material);
  if (main8Sections !== 8) failures.push({ code: 'MAIN8_SECTION_COUNT', expected: 8, actual: main8Sections });

  if (expected.min_requests > 1) {
    if (requests.length < expected.min_requests) {
      failures.push({ code: 'REQUEST_COLLAPSE', expected_min: expected.min_requests, public_request_ids: requests, internal_task_count: tasks.length });
    }
  } else if (tasks.length < 1 && requests.length < 1) {
    failures.push({ code: 'NO_JUDGMENT_UNIT', internal_task_count: tasks.length, public_request_ids: requests });
  }

  const anchors = anchorCoverage(material, expected.anchors || []);
  if ((expected.anchors || []).length && anchors.ratio < 0.75) {
    failures.push({ code: 'SOURCE_ANCHOR_LOSS', required_ratio: 0.75, actual_ratio: Number(anchors.ratio.toFixed(3)), matched: anchors.matched });
  }

  const materialTerms = countTerms(material, expected.material_terms || []);
  if ((expected.material_terms || []).length && materialTerms.length < 2) {
    failures.push({ code: 'DOMAIN_MATERIAL_INSUFFICIENT', genre: expected.genre || null, matched_terms: materialTerms, expected_terms: expected.material_terms });
  }

  const leaked = novelPatternMatches(INTERNAL_PUBLIC_PATTERNS, material, testCase.input);
  if (leaked.length) failures.push({ code: 'INTERNAL_PUBLIC_LEAK', patterns: leaked });

  const finalDecision = novelPatternMatches(FINAL_DECISION_PATTERNS, material, testCase.input);
  if (finalDecision.length) failures.push({ code: 'FINAL_DECISION_AUTHORITY_VIOLATION', patterns: finalDecision });

  if (expected.evidence_requested === false) {
    const s07 = section07(material);
    const falseFailure = FALSE_EXTERNAL_FAILURE_PATTERNS.filter((re) => re.test(s07)).map((re) => re.source);
    if (falseFailure.length) failures.push({ code: 'FALSE_REQUEST_LEVEL_EXTERNAL_EVIDENCE_FAILURE', patterns: falseFailure });
  }

  const trace = result?.runtime_trace || result?.performance_trace || result?.trace?.runtime || null;
  const traceValidation = validateRuntimeTrace(trace);
  if (!traceValidation.complete) {
    failures.push({
      code: 'FULL_RUNTIME_TRACE_INCOMPLETE',
      expected_schema: TRACE_SCHEMA,
      expected_span_count: REQUIRED_SPANS.length,
      ...traceValidation
    });
  }

  return {
    case_id: testCase.id,
    pair: testCase.pair || null,
    kind: testCase.kind,
    language: testCase.language,
    genre: expected.genre || null,
    input_chars: testCase.input.length,
    duration_ms: Number(durationMs.toFixed(3)),
    main8_sections: main8Sections,
    internal_task_count: tasks.length,
    public_request_ids: requests,
    anchor_coverage: anchors,
    domain_material_terms_matched: materialTerms,
    runtime_trace_available: traceValidation.complete,
    runtime_trace_validation: traceValidation,
    runtime_trace: trace,
    pass: failures.length === 0,
    failures,
    material
  };
}

function summarizePairs(caseResults) {
  const groups = new Map();
  for (const r of caseResults) {
    if (!r.pair) continue;
    if (!groups.has(r.pair)) groups.set(r.pair, []);
    groups.get(r.pair).push(r);
  }
  const rows = [];
  for (const [pair, rowsInPair] of groups) {
    const ja = rowsInPair.find((r) => r.language === 'ja');
    const en = rowsInPair.find((r) => r.language === 'en');
    if (!ja || !en) continue;
    const requestDelta = Math.abs(ja.public_request_ids.length - en.public_request_ids.length);
    const sectionParity = ja.main8_sections === en.main8_sections;
    const passParity = ja.pass === en.pass;
    rows.push({ pair, request_count_delta: requestDelta, section_parity: sectionParity, pass_parity: passParity, ja_pass: ja.pass, en_pass: en.pass });
  }
  return rows;
}

function writeJson(name, value) {
  const target = path.join(ARTIFACT_ROOT, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(value, null, 2));
}

async function main() {
  bootstrapRuntimeEnv();
  const args = parseArgs(process.argv);
  let corpus = loadUniversalCorpus();
  if (args.kind) corpus = corpus.filter((c) => c.kind === args.kind);
  if (args.caseId) corpus = corpus.filter((c) => c.id === args.caseId);
  if (args.maxCases > 0) corpus = corpus.slice(0, args.maxCases);
  if (!corpus.length) throw new Error('Universal corpus selection is empty.');

  const mode = String(process.env.ASTERA_JAPANESE_PARSER_MODE || '').trim().toLowerCase();
  const url = resolveHttpUrl();
  const apiKey = resolveHttpApiKey();
  if (mode !== 'http' || !isJapaneseParserConfigured({ mode: 'http', url, apiKey })) {
    throw new Error('Universal gate requires the real Japanese Parser HTTP runtime; mock fallback is forbidden.');
  }

  const parserClient = new JapaneseParserMCPClient({ mode: 'http', url, apiKey });
  const engine = new AsteraEngine({
    poolSize: 4,
    logger: silentLogger,
    japaneseParserClient: parserClient,
    japaneseParserOptions: { mode: 'http', url, apiKey },
    evidenceSearchClient: null
  });

  const results = [];
  try {
    for (const testCase of corpus) {
      const started = performance.now();
      let out = null;
      try {
        out = await engine.process({
          question: testCase.input,
          language: testCase.language,
          deadline_ms: testCase.kind === 'stress' ? 20000 : 12000
        }, caller);
        const duration = performance.now() - started;
        results.push(evaluateCase(testCase, out, duration));
      } catch (error) {
        results.push({
          case_id: testCase.id,
          pair: testCase.pair || null,
          kind: testCase.kind,
          language: testCase.language,
          genre: testCase.expected?.genre || null,
          input_chars: testCase.input.length,
          duration_ms: Number((performance.now() - started).toFixed(3)),
          runtime_trace_available: false,
          runtime_trace_validation: { complete: false, schema_version: null, status: null, span_count: 0, missing_spans: [...REQUIRED_SPANS] },
          runtime_trace: null,
          pass: false,
          failures: [{ code: 'PROCESS_ERROR', message: error.message, error_code: error.code || null }],
          material: ''
        });
      }
    }
  } finally {
    await engine.destroy();
  }

  const failures = results.filter((r) => !r.pass);
  const byKind = {};
  const byLanguage = {};
  const byGenre = {};
  for (const r of results) {
    byKind[r.kind] = byKind[r.kind] || { total: 0, pass: 0, fail: 0 };
    byKind[r.kind].total += 1; byKind[r.kind][r.pass ? 'pass' : 'fail'] += 1;
    byLanguage[r.language] = byLanguage[r.language] || { total: 0, pass: 0, fail: 0 };
    byLanguage[r.language].total += 1; byLanguage[r.language][r.pass ? 'pass' : 'fail'] += 1;
    if (r.genre) {
      byGenre[r.genre] = byGenre[r.genre] || { total: 0, pass: 0, fail: 0 };
      byGenre[r.genre].total += 1; byGenre[r.genre][r.pass ? 'pass' : 'fail'] += 1;
    }
  }

  const durations = results.map((r) => r.duration_ms).sort((a, b) => a - b);
  const percentile = (p) => durations.length ? durations[Math.min(durations.length - 1, Math.floor((durations.length - 1) * p))] : 0;
  const pairSummary = summarizePairs(results);
  const traceAvailableCount = results.filter((r) => r.runtime_trace_available).length;

  const summary = {
    schema: 'astera.universal-judgment-gate.v1',
    total: results.length,
    pass: results.length - failures.length,
    fail: failures.length,
    by_kind: byKind,
    by_language: byLanguage,
    by_genre: byGenre,
    pair_summary: pairSummary,
    latency_ms: { p50: percentile(0.50), p95: percentile(0.95), max: durations[durations.length - 1] || 0 },
    full_runtime_stage_trace: {
      schema_version: TRACE_SCHEMA,
      required_span_count: REQUIRED_SPANS.length,
      cases_with_trace: traceAvailableCount,
      total_cases: results.length,
      status: traceAvailableCount === results.length ? 'AVAILABLE' : 'NOT_YET_COMPLETE'
    },
    acceptance: {
      semantic_failures_must_be_zero: true,
      full_runtime_trace_required: true,
      ja_en_required: true,
      g01_g38_required: true,
      known_1k_5k_failures_required: true,
      stress_10k_required: true,
      internal_public_leak_allowed: false,
      final_decision_authority_allowed: false
    }
  };

  const runtimeTraceArtifact = {
    schema: 'astera.universal-runtime-trace-artifact.v1',
    trace_schema: TRACE_SCHEMA,
    required_spans: [...REQUIRED_SPANS],
    total_cases: results.length,
    cases_with_complete_trace: traceAvailableCount,
    status: traceAvailableCount === results.length ? 'COMPLETE' : 'PARTIAL',
    cases: results.map((r) => ({
      case_id: r.case_id,
      kind: r.kind,
      language: r.language,
      genre: r.genre || null,
      validation: r.runtime_trace_validation || null,
      trace: r.runtime_trace || null
    }))
  };

  writeJson('summary.json', summary);
  writeJson('runtime-trace.json', runtimeTraceArtifact);
  writeJson('failures.json', failures.map(({ material, ...rest }) => rest));
  writeJson('case-results.json', results);
  for (const r of results) writeJson(`cases/${r.case_id}.json`, r);

  console.log(`UNIVERSAL_TOTAL=${summary.total}`);
  console.log(`UNIVERSAL_PASS=${summary.pass}`);
  console.log(`UNIVERSAL_FAIL=${summary.fail}`);
  console.log(`UNIVERSAL_JA_FAIL=${summary.by_language.ja?.fail || 0}`);
  console.log(`UNIVERSAL_EN_FAIL=${summary.by_language.en?.fail || 0}`);
  console.log(`UNIVERSAL_G38_COVERAGE=${Object.keys(summary.by_genre).length}/38`);
  console.log(`UNIVERSAL_LATENCY_P50_MS=${summary.latency_ms.p50}`);
  console.log(`UNIVERSAL_LATENCY_P95_MS=${summary.latency_ms.p95}`);
  console.log(`UNIVERSAL_FULL_RUNTIME_TRACE=${summary.full_runtime_stage_trace.status}`);
  console.log(`UNIVERSAL_RUNTIME_TRACE_CASES=${traceAvailableCount}/${results.length}`);
  console.log(`UNIVERSAL_ARTIFACT_ROOT=${ARTIFACT_ROOT}`);

  if (failures.length) {
    for (const f of failures.slice(0, 20)) console.error(`UNIVERSAL_FAIL_CASE=${f.case_id} CODES=${f.failures.map((x) => x.code).join(',')}`);
    process.exit(1);
  }
  console.log('UNIVERSAL_JUDGMENT_GATE=PASS');
}

main().catch((error) => {
  fs.mkdirSync(ARTIFACT_ROOT, { recursive: true });
  fs.writeFileSync(path.join(ARTIFACT_ROOT, 'fatal.json'), JSON.stringify({ message: error.message, stack: error.stack }, null, 2));
  console.error(`UNIVERSAL_JUDGMENT_GATE_FATAL=${error.message}`);
  process.exit(2);
});
