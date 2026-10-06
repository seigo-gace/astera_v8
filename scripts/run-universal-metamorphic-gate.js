'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');
const { bootstrapRuntimeEnv } = require('../src/evidence-search/api/runtime-client');
const { JapaneseParserMCPClient, isJapaneseParserConfigured, resolveHttpUrl, resolveHttpApiKey } = require('../src/japanese-parser-mcp-client');
const { loadUniversalCorpus } = require('./universal-judgment-corpus-v1');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.env.ASTERA_UNIVERSAL_ARTIFACT_ROOT || path.join(ROOT, 'artifacts', 'universal-judgment-v1'));
const caller = { id: 'universal-metamorphic-gate', is_global: true, plan: 'admin' };
const logger = { write() {} };

function requestIds(text) {
  return [...new Set((String(text || '').match(/\bR\d{2,}\b/gu) || []))];
}

function normalized(s) {
  return String(s || '').normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();
}

function transformWhitespace(input) {
  return input
    .replace(/。/gu, '。\n')
    .replace(/\. /gu, '.\n')
    .replace(/\n{1,}/gu, '\n\n')
    .replace(/[ \t]+/gu, '  ');
}

function transformWrapper(input, language) {
  return language === 'ja'
    ? `参考メモ（内容の意味は変えない）\n---\n${input}\n---\n以上の入力について判断材料を返す。`
    : `Reference note (do not change the meaning of the content)\n---\n${input}\n---\nReturn judgment material for the input above.`;
}

function transformNumbering(input) {
  return input
    .replace(/第一の目的/gu, '【目的1】')
    .replace(/第二の目的/gu, '【目的2】')
    .replace(/第三の目的/gu, '【目的3】')
    .replace(/第四の目的/gu, '【目的4】')
    .replace(/第五の目的/gu, '【目的5】')
    .replace(/第六の目的/gu, '【目的6】')
    .replace(/第七の目的/gu, '【目的7】')
    .replace(/第八の目的/gu, '【目的8】')
    .replace(/第九の目的/gu, '【目的9】')
    .replace(/第十の目的/gu, '【目的10】')
    .replace(/第十一の目的/gu, '【目的11】')
    .replace(/第十二の目的/gu, '【目的12】')
    .replace(/Objective (one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve):?/giu, (_m, n) => `Objective-${n.toLowerCase()}:`);
}

function compare(base, variant) {
  const failures = [];
  const baseIds = requestIds(base.material);
  const variantIds = requestIds(variant.material);
  if (variantIds.length < baseIds.length) failures.push({ code: 'REQUEST_COUNT_DEGRADED', base: baseIds.length, variant: variantIds.length });
  if (variant.section_count !== base.section_count) failures.push({ code: 'MAIN8_SECTION_PARITY', base: base.section_count, variant: variant.section_count });
  if (base.task_count > 0 && variant.task_count === 0) failures.push({ code: 'TASKS_DISAPPEARED', base: base.task_count, variant: variant.task_count });
  return failures;
}

async function execute(engine, row, input) {
  const t0 = performance.now();
  try {
    const out = await engine.process({ question: input, language: row.language, deadline_ms: 15000 }, caller);
    const text = String(out?.material?.text || '');
    return {
      ok: true,
      duration_ms: Number((performance.now() - t0).toFixed(3)),
      material: text,
      section_count: text.split(/^---$/m).length,
      task_count: out?.result?.analysis_task_packet?.tasks?.length || 0,
      normalized_material: normalized(text)
    };
  } catch (error) {
    return { ok: false, duration_ms: Number((performance.now() - t0).toFixed(3)), error: error.message, material: '', section_count: 0, task_count: 0 };
  }
}

async function main() {
  bootstrapRuntimeEnv();
  const mode = String(process.env.ASTERA_JAPANESE_PARSER_MODE || '').trim().toLowerCase();
  const url = resolveHttpUrl();
  const apiKey = resolveHttpApiKey();
  if (mode !== 'http' || !isJapaneseParserConfigured({ mode: 'http', url, apiKey })) throw new Error('Real Parser HTTP runtime required.');

  const selectedIds = new Set([
    'known-noisy-multi-ja-1k',
    'known-noisy-multi-en-1k',
    'known-clean-ai-ja-5k',
    'known-clean-ai-en-5k',
    'G08-legal-ja',
    'G08-legal-en',
    'G29-software-ja',
    'G29-software-en'
  ]);
  const corpus = loadUniversalCorpus().filter((c) => selectedIds.has(c.id));
  const client = new JapaneseParserMCPClient({ mode: 'http', url, apiKey });
  const engine = new CanonicalAsteraEngine({ poolSize: 4, logger, japaneseParserClient: client, japaneseParserOptions: { mode: 'http', url, apiKey } });
  const results = [];

  try {
    for (const row of corpus) {
      const base = await execute(engine, row, row.input);
      const variants = [
        ['whitespace', transformWhitespace(row.input)],
        ['wrapper', transformWrapper(row.input, row.language)],
        ['numbering', transformNumbering(row.input)]
      ];
      for (const [name, transformed] of variants) {
        const variant = await execute(engine, row, transformed);
        const failures = [];
        if (!base.ok) failures.push({ code: 'BASE_PROCESS_ERROR', error: base.error });
        if (!variant.ok) failures.push({ code: 'VARIANT_PROCESS_ERROR', error: variant.error });
        if (base.ok && variant.ok) failures.push(...compare(base, variant));
        results.push({ case_id: row.id, language: row.language, transform: name, base, variant, pass: failures.length === 0, failures });
      }
    }
  } finally {
    await engine.destroy();
  }

  fs.mkdirSync(OUT, { recursive: true });
  const compact = results.map((r) => ({
    case_id: r.case_id,
    language: r.language,
    transform: r.transform,
    pass: r.pass,
    failures: r.failures,
    base: { ok: r.base.ok, duration_ms: r.base.duration_ms, section_count: r.base.section_count, task_count: r.base.task_count, request_ids: requestIds(r.base.material) },
    variant: { ok: r.variant.ok, duration_ms: r.variant.duration_ms, section_count: r.variant.section_count, task_count: r.variant.task_count, request_ids: requestIds(r.variant.material) }
  }));
  const failures = compact.filter((r) => !r.pass);
  fs.writeFileSync(path.join(OUT, 'metamorphic-results.json'), JSON.stringify(compact, null, 2));
  fs.writeFileSync(path.join(OUT, 'metamorphic-failures.json'), JSON.stringify(failures, null, 2));
  console.log(`METAMORPHIC_TOTAL=${compact.length}`);
  console.log(`METAMORPHIC_FAIL=${failures.length}`);
  if (failures.length) process.exit(1);
  console.log('UNIVERSAL_METAMORPHIC_GATE=PASS');
}

main().catch((error) => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'metamorphic-fatal.json'), JSON.stringify({ message: error.message, stack: error.stack }, null, 2));
  console.error(`UNIVERSAL_METAMORPHIC_FATAL=${error.message}`);
  process.exit(2);
});
