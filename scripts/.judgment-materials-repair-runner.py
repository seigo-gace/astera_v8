from pathlib import Path
import re

BRANCH = 'feature/evidence-search-v2-4'


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


# First make the existing canonical repair generator deterministic and literal-safe.
repair_path = Path('scripts/.judgment-materials-repair.py')
source = repair_path.read_text()
changes = [
    (
        "    new, count = re.subn(pattern, repl, text, count=1, flags=re.S)",
        "    new, count = re.subn(pattern, lambda _match: repl, text, count=1, flags=re.S)",
        'literal regex replacement'
    ),
    (
        "test_content = r'''\\\n'use strict';",
        "test_content = r'''\n'use strict';",
        'adversarial test leading backslash'
    )
]
for old, new, label in changes:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    source = source.replace(old, new, 1)
repair_path.write_text(source)

# Apply the broad Notion-canonical P0/P1/P2 repair into this workflow worktree.
exec(compile(source, str(repair_path), 'exec'), {'__name__': '__main__', '__file__': str(repair_path)})

# Root fix 1: English article removal must never eat the A in an acronym such as API.
replace_once(
    'src/deterministic-task-decomposer.js',
    "replace(/^(?:\\s+the|\\s+an?|\\s+)/i, '')",
    "replace(/^\\s+(?:(?:the|an?)\\s+)?/i, '')",
    'English article boundary'
)

# Root fix 2: upstream analyzer must classify verification actions itself; downstream cannot recover a task that vanished upstream.
analyzer_actions = r"""const ACTIONS = [
  ['verify', /検証|確認|監査|調査|分析|解析|評価|テスト|試験|動作確認|回帰テスト|\b(?:verify|verifies|verified|verifying|validate|validates|validated|validating|audit|audits|audited|auditing|investigate|investigates|investigated|investigating|analyze|analyzes|analyzed|analyzing|analyse|analyses|analysed|analysing|evaluate|evaluates|evaluated|evaluating|check|checks|checked|checking|test|tests|tested|testing)\b/i],
  ['compare', /比較|比べ|選択肢|\b(?:compare|compares|compared|comparing|versus|vs)\b/i],
  ['decide', /判断|選定|選ぶ|決め|採用|\b(?:decide|decides|decided|deciding|select|selects|selected|selecting|choose|chooses|chose|chosen|choosing|recommend|recommends|recommended|recommending)\b/i],
  ['improve', /改善|改良|修正|直(?:す|せ|し)|最適化|強化|精度.{0,8}(?:上げ|向上)|\b(?:improve|improves|improved|improving|optimize|optimizes|optimized|optimizing|optimise|optimises|optimised|optimising|fix|fixes|fixed|fixing|refactor|refactors|refactored|refactoring|strengthen|strengthens|strengthened|strengthening)\b/i],
  ['implement', /実装|作成|構築|開発|組み立て|追加|\b(?:implement|implements|implemented|implementing|build|builds|built|building|create|creates|created|creating|develop|develops|developed|developing|add|adds|added|adding)\b/i],
  ['integrate', /統合|接続|連携|組み込|当てはめ|\b(?:integrate|integrates|integrated|integrating|connect|connects|connected|connecting|link|links|linked|linking|incorporate|incorporates|incorporated|incorporating)\b/i],
  ['migrate', /移行|置換|切替|入れ替|\b(?:migrate|migrates|migrated|migrating|replace|replaces|replaced|replacing|switch|switches|switched|switching)\b/i],
  ['remove', /削除|除去|外す|\b(?:remove|removes|removed|removing|delete|deletes|deleted|deleting|eliminate|eliminates|eliminated|eliminating)\b/i],
  ['preserve', /維持|保持|残す|壊さず|変えず|そのまま|\b(?:keep|keeps|kept|keeping|preserve|preserves|preserved|preserving|retain|retains|retained|retaining)\b/i],
  ['explain', /説明|教え|解説|\b(?:explain|explains|explained|explaining|describe|describes|described|describing)\b|\btell\s+me\b/i]
].map(([id, re]) => ({ id, re }));"""
regex_once(
    'src/judgment-materials-analyzer.js',
    r"const ACTIONS = \[.*?\]\.map\(\(\[id, re\]\) => \(\{ id, re \}\)\);",
    analyzer_actions,
    'upstream analyzer action registry'
)
replace_once(
    'src/judgment-materials-analyzer.js',
    "verify: /(?:検証|確認|test|verify|validate|assert|check)/i,",
    "verify: /(?:検証|確認|テスト|試験|動作確認|回帰テスト|\\btest\\b|\\bverify\\b|\\bvalidate\\b|\\bassert\\b|\\bcheck\\b)/i,",
    'upstream verification clause recognition'
)

# Root fix 3: compare candidate identity and comparison criteria are separate structures.
compare_helpers = r"""function explicitComparisonCandidates(task = {}) {
  const target = String(task.target || '').trim();
  if (!target) return [];
  let candidateTarget = target;
  const jpSuffix = /^(.{1,80}?と.{1,80}?)\s*を\s*[^、。！？!?]{1,80}?(?:で)?$/u.exec(candidateTarget);
  if (jpSuffix) candidateTarget = jpSuffix[1].trim();
  const enSuffix = /^(.{1,80}?(?:\band\b|\bvs\.?\b|\bversus\b).{1,80}?)\s+(?:by|on|across|using)\s+[^.;!?]{1,80}$/i.exec(candidateTarget);
  if (enSuffix) candidateTarget = enSuffix[1].trim();
  const match = /^(.{1,80}?)\s*(?:と|\band\b|\bvs\.?\b|\bversus\b)\s*(.{1,80}?)$/i.exec(candidateTarget);
  if (!match) return [];
  const clean = (value) => String(value || '').trim().replace(/^(?:候補|option)\s*/i, '').replace(/\s*(?:を|について)$/u, '');
  const labels = uniqueStrings([clean(match[1]), clean(match[2])]);
  if (labels.length < 2) return [];
  return labels.map((label, index) => ({ candidate_id: `C${String(index + 1).padStart(2, '0')}`, label, source: 'EXPLICIT_COMPARE_TARGET' }));
}

function explicitComparisonDimensions(task = {}) {
  const raw = uniqueStrings([task.source_span?.text, task.raw_text, task.target]).join(' ');
  const values = [];
  const jp = /を\s*([^、。！？!?]{1,80}?)\s*で\s*(?:比較|比べ)/u.exec(raw);
  if (jp) values.push(...String(jp[1]).split(/\s*(?:と|、|,|\/)\s*/u));
  const en = /\b(?:compare|compares|compared|comparing)\b[^.;!?]{0,180}?\b(?:by|on|across|using)\s+([^.;!?]{1,80})/i.exec(raw);
  if (en) values.push(...String(en[1]).split(/\s*(?:,|\/|\band\b)\s*/i));
  return uniqueStrings(values).map((value) => ({ value, sources: [{ source: 'TASK_COMPARE_CRITERIA', task_id: task.id || null }] }));
}

function candidateMatchesText"""
regex_once(
    'src/v4-canonical/lanes.js',
    r"function explicitComparisonCandidates\(task = \{\}\) \{.*?\n\}\n\nfunction candidateMatchesText",
    compare_helpers,
    'candidate and comparison criteria separation'
)
replace_once(
    'src/v4-canonical/lanes.js',
    "  const dimensions = lensPlanEntries(domain, 'compare');",
    "  const dimensions = [...new Map([...lensPlanEntries(domain, 'compare'), ...explicitComparisonDimensions(task)].map((entry) => [String(entry.value || '').trim().toLowerCase(), entry])).values()];",
    'explicit comparison dimensions'
)

# Root fix 4: a task execution failure is a fail-closed high-risk projection, never an ordinary UNDETERMINED lane pass.
failure_projection = r"""function projectCanonicalFailure({ task, error }) {
  const canonical = buildFailureCanonical(task, error);
  const lanes = fallbackFailureLanes(task, canonical, error);
  const perspectiveExpansion = failurePerspective(task, canonical, error);
  return {
    canonical,
    lanes,
    perspective_expansion: perspectiveExpansion,
    execution_failure: { code: taskErrorCode(error), fail_closed: true }
  };
}

module.exports"""
regex_once(
    'src/canonical-task-projection.js',
    r"function projectCanonicalFailure\(\{ task, error \}\) \{.*?\n\}\n\nmodule\.exports",
    failure_projection,
    'fail-closed task failure projection'
)

# Strengthen the generated regression suite so passing means semantics, not only field presence.
test_path = Path('test/judgment-materials-no-shortcuts-regression.test.js')
test_text = test_path.read_text()
test_text = test_text.replace(
    "assert.deepEqual(out.result.comparison.comparison_candidates.map((item) => item.label), ['A案','B案を費用と安全性で']);",
    "assert.deepEqual(out.result.comparison.comparison_candidates.map((item) => item.label), ['A案','B案']);"
)
extra = r"""

test('English articles and acronyms preserve exact target semantics across compound actions', () => {
  const cases = [
    ['Implement API then test it.', 'API'],
    ['Implement an API then test it.', 'API'],
    ['Implement the API; then validate it.', 'API']
  ];
  for (const [question, expectedTarget] of cases) {
    const request = understand(question);
    const actions = request.analysis_task_packet.tasks.map((task) => task.action);
    assert.ok(actions.includes('implement'), question);
    assert.ok(actions.includes('verify'), question);
    const first = request.analysis_task_packet.tasks.find((task) => task.action === 'implement');
    assert.equal(first.target, expectedTarget, question);
  }
});

test('Japanese test and trial wording survive upstream analysis as verification tasks', () => {
  for (const question of ['APIを実装する。その後テストする。', 'APIを実装して、その後試験する。']) {
    const request = understand(question);
    const actions = request.analysis_task_packet.tasks.map((task) => task.action);
    assert.ok(actions.includes('implement'), question);
    assert.ok(actions.includes('verify'), question);
  }
});

test('Compare separates candidate identity from explicit criteria and carries both into Main8 06', async () => {
  const engine = new CanonicalAsteraEngine({ poolSize: 1, logger: silentLogger });
  try {
    const out = await engine.process({ question:'A案とB案を費用と安全性で比較する。' }, { id:'compare-criteria', is_global:true, plan:'admin' });
    assert.deepEqual(out.result.comparison.comparison_candidates.map((item) => item.label), ['A案','B案']);
    assert.ok(out.result.comparison.dimensions.includes('費用'));
    assert.ok(out.result.comparison.dimensions.includes('安全性'));
    const main06 = out.result.judgment['06_comparison'];
    const serialized = JSON.stringify(main06);
    for (const required of ['A案','B案','費用','安全性']) assert.ok(serialized.includes(required), required);
    assert.equal(main06.selected_candidate, null);
    assert.deepEqual(main06.candidate_ranking, []);
    assert.deepEqual(main06.rejected_candidates, []);
  } finally { await engine.destroy(); }
});

test('Task execution failure is explicit fail-closed high risk and cannot be rendered as ordinary success material', () => {
  const task = { id:'T01', target:'API', action:'verify', constraints:[], prohibitions:[], preserve:[], canonical_plan:{ task_id:'T01', search_plan:{ task_id:'T01', queries:[], planned_query_roles:[] }, claims:[{ claim_id:'C01', raw_text:'APIは有効である。' }], policy_by_claim_id:{ C01:{ required_scope_fields:[] } } } };
  const out = projectCanonicalFailure({ task, error:Object.assign(new Error('boom'), { code:'WORKER_BROKEN' }) });
  assert.equal(out.execution_failure.fail_closed, true);
  assert.equal(out.execution_failure.code, 'WORKER_BROKEN');
  assert.equal(out.canonical.records[0].confirmation.status, 'UNDETERMINED');
  assert.ok(out.canonical.records[0].confirmation.reasons.some((reason) => reason.includes('TASK_EXECUTION_FAILURE:WORKER_BROKEN')));
  assert.equal(out.lanes.risk.source, 'TASK_EXECUTION_FAILURE');
  assert.equal(out.lanes.risk.level, 'high');
  assert.equal(out.lanes.compare.selected_candidate, null);
  assert.deepEqual(out.lanes.compare.candidate_ranking, []);
});
"""
if "English articles and acronyms preserve exact target semantics" in test_text:
    raise SystemExit('strengthened adversarial tests already present unexpectedly')
test_path.write_text(test_text.rstrip() + extra + '\n')

print('judgment-materials canonical repair and strengthened adversarial suite applied')
