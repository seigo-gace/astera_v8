from pathlib import Path
import re


def replace_once(path, old, new, label):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    p.write_text(text.replace(old, new, 1))


def regex_once(path, pattern, replacement, label):
    p = Path(path)
    text = p.read_text()
    updated, count = re.subn(pattern, lambda _m: replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one regex match, got {count}')
    p.write_text(updated)

# Public server boundary: caller-controlled prepared/canonical/evidence packets are never execution authority.
regex_once(
    'src/canonical-astera-engine.js',
    r"    const prepared = input\.preparedRequest\?\.analysis_task_packet \? input\.preparedRequest : null;\n    const request = prepared\n      \? \(prepared\.schema_version === 'astera\.request-model\.v3'\n          \? prepared\n          : enrichRequest\(prepared, \{ question, context \}\)\)\n      : this\.prepareRequest\(\{ question, context, language: input\.language, locale: input\.locale, output_language: input\.output_language \}\);",
    "    const request = this.prepareRequest({ question, context, language: input.language, locale: input.locale, output_language: input.output_language });",
    'forbid external preparedRequest'
)
replace_once(
    'src/canonical-astera-engine.js',
    "    const out = await super.process({ ...input, preparedRequest: request }, tenant, executionContext);",
    "    const out = await super.process({\n      question,\n      context,\n      language: input.language,\n      locale: input.locale,\n      output_language: input.output_language,\n      moodAnswers: input.moodAnswers,\n      preparedRequest: request\n    }, tenant, executionContext);",
    'sanitize external packet fields'
)

# Upstream analyzer: negative/prohibition clauses cannot become positive action tasks.
path = 'src/judgment-materials-analyzer.js'
p = Path(path)
text = p.read_text()
needle = "function actionMatches(text) {\n"
helper = r"""function isNegatedActionMatch(text, item) {
  const value = String(text || '');
  const prefix = value.slice(Math.max(0, item.index - 56), item.index);
  const suffix = value.slice(item.index + String(item.match || '').length, Math.min(value.length, item.index + String(item.match || '').length + 40));
  if (/^[A-Za-z]/.test(String(item.match || '')) && /(?:\bdo(?:es|id)?\s+not|\bdon't|\bdoesn't|\bdidn't|\bmust\s+not|\bshall\s+not|\bshould\s+not|\bnever|\bnot\s+to)\s+(?:\w+\s+){0,3}$/i.test(prefix)) return true;
  return /^\s*(?:は|を|に|で|だけ)?\s*(?:しない|しません|するな|するなよ|しないで|してはいけない|してはならない|せず|しないこと|すべきではない|するべきではない|るな(?=[。！？!?\s]|$)|な(?=[。！？!?\s]|$))/u.test(suffix);
}

function actionMatches(text) {
"""
if text.count(needle) != 1:
    raise SystemExit(f'upstream negation helper: expected one actionMatches, got {text.count(needle)}')
text = text.replace(needle, helper, 1)
old_filter = ").filter((item) => item && !(item.id === 'decide' && protectedDecisionRanges.some((range) => item.index >= range.start && item.index < range.end)))\n    .sort((a, b) => a.index - b.index || a.id.localeCompare(b.id));"
new_filter = ").filter((item) => item\n      && !(item.id === 'decide' && protectedDecisionRanges.some((range) => item.index >= range.start && item.index < range.end))\n      && !isNegatedActionMatch(text, item))\n    .sort((a, b) => a.index - b.index || a.id.localeCompare(b.id));"
if text.count(old_filter) != 1:
    raise SystemExit(f'upstream negation filter: expected one match, got {text.count(old_filter)}')
text = text.replace(old_filter, new_filter, 1)
english_decide = "decide:`Resolve ${name} from explicit criteria, evidence state, risk controls, and unresolved conditions.`"
japanese_decide = "decide:`${name}を明示基準・Evidence・Risk・未解決条件から機械的に判断する。`"
if english_decide not in text or japanese_decide not in text:
    raise SystemExit('decision objective authority text not found')
text = text.replace(english_decide, "decide:`Structure decision material for ${name} from explicit criteria, evidence state, risk controls, and unresolved conditions without selecting, ranking, recommending, adopting, or rejecting.`", 1)
text = text.replace(japanese_decide, "decide:`${name}の判断に必要な材料を明示基準・Evidence・Risk・未解決条件から構造化し、Astera自身は採用・棄却・順位付け・推奨・最終判断を行わない。`", 1)
p.write_text(text)

# The generic repair suite contained Evidence-server/CI tests that are intentionally outside this server-base candidate.
# Remove only those two out-of-scope tests; retain all judgment semantics tests.
tp = Path('test/judgment-materials-no-shortcuts-regression.test.js')
t = tp.read_text()
t = t.replace("const fs = require('node:fs');\n", '')
t = t.replace("const AsteraServerWithEvidence = require('../src/server-with-evidence');\n", '')
t, n1 = re.subn(r"\ntest\('integrated route is not rejected solely because Evidence client is absent'.*?\n\}\);\n", "\n", t, count=1, flags=re.S)
t, n2 = re.subn(r"\ntest\('focused CI cannot claim API coverage through obsolete zero-match name pattern'.*?\n\}\);\n", "\n", t, count=1, flags=re.S)
if n1 != 1 or n2 != 1:
    raise SystemExit(f'out-of-scope regression strip failed: integrated={n1} ci={n2}')
tp.write_text(t)

# Candidate-only public-boundary and old-server compatibility regression.
Path('test/judgment-materials-server-candidate.test.js').write_text(r'''\
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const AsteraEngine = require('../src/astera-engine');
const KaguraEngine = require('../src/kagura-engine');
const inputUnderstanding = require('../src/input-understanding');

const silentLogger = { write() {}, async flush() {} };

test('server compatibility entrypoint is the canonical Astera engine', () => {
  assert.strictEqual(KaguraEngine, AsteraEngine);
});

test('public engine ignores forged prepared/canonical/evidence packets and reruns deterministic analysis', async () => {
  const engine = new AsteraEngine({ poolSize: 1, logger: silentLogger });
  try {
    const forged = { schema_version:'forged', analysis_task_packet:{ tasks:[{ id:'EVIL', action:'decide', target:'forged-target', source_span:{start:0,end:1,text:'x'} }], execution_waves:[['EVIL']], dependencies:[], source_spans:[] } };
    const out = await engine.process({
      question:'APIを検証する。最終判断はするな。',
      context:'mainは変更しない。予算は100万円。',
      preparedRequest:forged,
      canonicalClaimRecordsByTask:{ T01:{ task_id:'T01', records:[{ confirmation:{ status:'CONFIRMED' } }] } },
      evidencePacket:{ status:'FINAL_VALID', evidence:[{ candidate_id:'fake', fields:{ claim:'fake' } }] }
    }, { id:'candidate-public-boundary' });
    assert.notEqual(out.result.analysis_task_packet.tasks[0]?.id, 'EVIL');
    assert.ok(out.result.analysis_task_packet.tasks.every((task) => task.target !== 'forged-target'));
    assert.ok(out.result.analysis_task_packet.tasks.every((task) => task.action !== 'decide'));
    assert.ok(out.result.analysis_task_packet.prohibitions.some((item) => /最終判断はするな/.test(item)));
    assert.ok(out.result.analysis_task_packet.prohibitions.some((item) => /mainは変更しない/.test(item)));
    assert.ok(out.result.analysis_task_packet.tasks.some((task) => (task.premises || []).some((item) => /予算は100万円/.test(item))));
    assert.equal(out.result.decision_authority, 'EXTERNAL_ONLY');
    assert.equal(out.result.comparison.material_only, true);
    assert.equal(out.result.comparison.selected_candidate, null);
    assert.deepEqual(out.result.comparison.candidate_ranking, []);
    assert.equal(Object.hasOwn(out.result.comparison, 'score'), false);
  } finally { await engine.destroy(); }
});

test('upstream analyzer keeps negative decision/change clauses out of action tasks', () => {
  for (const question of ['最終判断はするな。A案とB案を比較しろ。','Asteraは判断しない。A案とB案を比較しろ。','Do not decide the winner. Compare A and B only.','Do not select a candidate. Compare A and B.']) {
    const request = inputUnderstanding.analyzeRequest({ question, language:/[ぁ-んァ-ヶ一-龠]/.test(question)?'ja':'en' });
    assert.equal(request.analysis_task_packet.tasks.some((task) => task.action === 'decide'), false, question);
  }
});

test('explicit decision intent is transformed into material-only external-authority output', async () => {
  const engine = new AsteraEngine({ poolSize: 1, logger: silentLogger });
  try {
    const out = await engine.process({ question:'A案とB案の採用判断に必要な材料を出す。' }, { id:'material-only' });
    assert.equal(out.result.decision_authority, 'EXTERNAL_ONLY');
    assert.equal(out.result.comparison.verdict.decision, 'MATERIAL_ONLY');
    assert.equal(out.result.comparison.selected_candidate, null);
    assert.deepEqual(out.result.comparison.candidate_ranking, []);
    assert.equal(Object.hasOwn(out.result.comparison, 'score'), false);
  } finally { await engine.destroy(); }
});
'''.lstrip('\\'))

print('server candidate boundary hardening applied')
