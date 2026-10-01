'use strict';

const ORDER = Object.freeze([
  '01_purpose','02_premise','03_facts','04_crisis',
  '05_opposition','06_comparison','07_evidence_status','08_reinstruction'
]);

const unique = (values = []) => [...new Set(values.map((v) => String(v || '').trim()).filter(Boolean))];
const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();

function langOf(judgment = {}) {
  return String(judgment.output_language || 'ja').split('-')[0] === 'ja' ? 'ja' : 'en';
}
function labelOf(judgment, key) {
  return judgment?.[key]?.label || judgment?.[key]?.canonical_label || key;
}
function stripTask(value) {
  return clean(value).replace(/^T\d+\[[^\]]+\]\s*/u, '').replace(/^T\d+:\s*/u, '').replace(/^(?:purpose|objective)=/iu, '');
}
function purposeText(judgment) {
  const section = judgment['01_purpose'] || {};
  return clean(section.user_goal || section.analysis_intent?.purpose || judgment.analysis_intent?.purpose)
    || stripTask((section.items || [])[0] || section.summary || '');
}
function candidateLabels(judgment) {
  return unique((judgment['06_comparison']?.comparison_candidates || []).map((v) =>
    typeof v === 'string' ? v : (v?.label || v?.candidate_id)
  )).filter((v) => v && !/^observable:/iu.test(v));
}
function dimensions(judgment) {
  const explicit = unique(judgment.observable_material?.dimensions || [])
    .filter((v) => !/^(?:主張の検証状態|claim verification status)$/iu.test(v));
  if (explicit.length) return explicit;
  if (!candidateLabels(judgment).length) return [];
  return unique(judgment['06_comparison']?.dimensions || [])
    .filter((v) => !/^(?:主張の検証状態|claim verification status)$/iu.test(v));
}
function observableClaims(judgment) {
  return unique(judgment.observable_material?.claim_texts || []);
}
function candidateObservations(judgment) {
  const labels = candidateLabels(judgment);
  const claims = observableClaims(judgment);
  const map = new Map(labels.map((label) => [label, []]));
  for (const item of judgment['06_comparison']?.candidate_materials || []) {
    const label = clean(item.label || item.candidate_id);
    if (map.has(label)) map.set(label, unique([...(map.get(label) || []), ...(item.observations || [])]));
  }
  for (const label of labels) map.set(label, unique([...(map.get(label) || []), ...claims.filter((c) => String(c).includes(label))]));
  return map;
}
function extractCandidateQuantities(judgment) {
  const out = [];
  for (const [label, observations] of candidateObservations(judgment)) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const value of observations) {
      const m = new RegExp(`${escaped}[^0-9０-９]{0,100}([0-9０-９]+(?:[.．][0-9０-９]+)?)\\s*(件|人|回|日|時間|分|秒|円|万円|台|個|社|本|枚|%|％)`, 'u').exec(String(value));
      if (!m) continue;
      const n = Number(m[1].replace(/[０-９]/g, (ch) => String(ch.charCodeAt(0) - 0xFF10)).replace('．', '.'));
      if (Number.isFinite(n)) { out.push({ label, number: n, unit: m[2], source: clean(value) }); break; }
    }
  }
  return out;
}
function premiseLine(value, lang) {
  const text = clean(value);
  const pairs = [
    [/^deadline=/iu, lang === 'ja' ? '期限' : 'Deadline'],
    [/^unresolved=/iu, lang === 'ja' ? '未確定事項' : 'Unresolved item'],
    [/^missing=/iu, lang === 'ja' ? '不足情報' : 'Missing information'],
    [/^hard_constraint=/iu, lang === 'ja' ? '必ず守る条件' : 'Hard constraint'],
    [/^premise=/iu, lang === 'ja' ? '入力前提' : 'Input premise'],
    [/^prohibition=/iu, lang === 'ja' ? '禁止条件' : 'Prohibition'],
    [/^condition=/iu, lang === 'ja' ? '成立条件' : 'Condition'],
    [/^exception=/iu, lang === 'ja' ? '例外条件' : 'Exception'],
    [/^priority=/iu, lang === 'ja' ? '優先条件' : 'Priority'],
    [/^conflict=/iu, lang === 'ja' ? '矛盾・要確認' : 'Conflict / check required']
  ];
  for (const [rx, label] of pairs) if (rx.test(text)) return `${label}: ${text.replace(rx, '')}`;
  const record = /^constraint\[([^\]]+)\]=(.*)$/iu.exec(text);
  if (record) return `${lang === 'ja' ? '制約' : 'Constraint'} (${record[1]}): ${record[2]}`;
  if (/^未確定条件\s*:/u.test(text)) return text;
  if (/^(?:T\d+|PARSER_|TASK_GRAPH|NO_EXECUTABLE_ACTION|SOURCE_ROLE|RECOVERED|FAIL_CLOSED)/iu.test(text)) return '';
  return text;
}
function premiseLines(judgment, lang) {
  return unique((judgment['02_premise']?.items || []).map((v) => premiseLine(v, lang)).filter(Boolean));
}
function factText(item) {
  if (!item) return '';
  if (typeof item === 'string') return clean(item.replace(/^T\d+:[^:]*:(?:CONFIRMED|UNDETERMINED):/u, ''));
  return clean(item.text || item.raw_text || item.claim?.raw_text || item.claim?.text || '');
}
function missingForDimension(dimension, lang) {
  const d = clean(dimension);
  if (lang === 'ja') {
    if (/作業時間|工数|時間|期間|納期/u.test(d)) return '候補ごとの1件あたり作業時間、レビュー時間、修正時間';
    if (/法務|契約|規約|コンプライアンス|legal/iu.test(d)) return '候補ごとの法務確認結果、問題になる条項・表現、未解決論点';
    if (/利用者理解|理解度|可読|分かり|ユーザー|user/iu.test(d)) return '対象利用者の理解度、問い合わせ網羅率、重複、読みやすさを同じ条件で比較した結果';
    if (/費用|コスト|価格|料金/u.test(d)) return '候補ごとの総費用と内訳を同じ前提で算出した値';
    if (/性能|速度|latency|throughput|精度/iu.test(d)) return '同一条件で測定した候補別の実測値と測定条件';
    if (/安全|リスク|risk/iu.test(d)) return '候補ごとの発生条件、影響範囲、回避条件、未確認事項';
    return `「${d}」を候補間で同じ条件で比較できる具体値・観測結果`;
  }
  if (/time|effort|duration|deadline/iu.test(d)) return 'per-item work time, review time, and rework time for each candidate';
  if (/legal|policy|contract|compliance/iu.test(d)) return 'legal review result per candidate, relevant wording or clauses, and unresolved legal points';
  if (/understand|readab|user/iu.test(d)) return 'measured user understanding, coverage, duplication, and readability under the same conditions';
  if (/cost|price|fee/iu.test(d)) return 'total cost and cost breakdown for each candidate under the same assumptions';
  if (/performance|speed|latency|throughput|accuracy/iu.test(d)) return 'candidate measurements under identical benchmark conditions';
  if (/risk|safety/iu.test(d)) return 'trigger conditions, impact, mitigations, and unresolved items per candidate';
  return `concrete measurements for “${d}” under the same comparison conditions`;
}
function quantityDifference(judgment, lang) {
  const values = extractCandidateQuantities(judgment);
  if (values.length !== 2 || values[0].unit !== values[1].unit) return null;
  const [a, b] = values;
  const high = a.number >= b.number ? a : b;
  const low = high === a ? b : a;
  const diff = Math.abs(a.number - b.number);
  const ratio = low.number > 0 ? high.number / low.number : null;
  const ratioText = ratio && Number.isFinite(ratio) ? ratio.toFixed(ratio >= 10 ? 1 : 2).replace(/\.00$/, '') : null;
  return lang === 'ja'
    ? `${a.label}=${a.number}${a.unit}、${b.label}=${b.number}${b.unit}。数量差は${diff}${a.unit}${ratioText ? `で、多い側は少ない側の約${ratioText}倍` : ''}。これは数量差だけを示し、作業時間・品質・法務安全性の優劣までは示さない。`
    : `${a.label}=${a.number}${a.unit}, ${b.label}=${b.number}${b.unit}. The difference is ${diff}${a.unit}${ratioText ? `; the larger count is about ${ratioText}x the smaller` : ''}. This establishes a quantity difference only, not superiority in effort, quality, or legal safety.`;
}
function usefulRisks(judgment) {
  const generic = new Set(['Data Loss','Downtime','互換性破壊','Security Regression','Rollback不能','幻覚・誤判定','Bias','Privacy Leak','Prompt Injection','過信・監査Gap','製品安全','誤表示','Recall','保証不履行','互換性問題','根拠なしの主張','弱いSource','矛盾','Source Laundering']);
  return (judgment['04_crisis']?.risks || []).filter((risk) => {
    const impact = clean(risk.impact || risk.failure_condition || risk.key);
    if (!impact || generic.has(impact)) return false;
    if (/PARSER_|TASK_GRAPH|MATERIAL_ONLY|INSUFFICIENT_|RETRIEVAL_FAILED|VERIFICATION_TARGET/iu.test(impact)) return false;
    return true;
  });
}
function evidenceEntries(judgment) {
  return Object.values(judgment['07_evidence_status']?.evidence_search || judgment.evidence_state?.per_task || {});
}
function section01(judgment, lang) {
  const purpose = purposeText(judgment);
  const candidates = candidateLabels(judgment);
  const dims = dimensions(judgment);
  const lines = [`- ${lang === 'ja' ? '今回の目的' : 'Purpose'}: ${purpose || (lang === 'ja' ? '入力内容を判断材料として整理する' : 'Organize the input into judgment material')}`];
  if (candidates.length) lines.push(`- ${lang === 'ja' ? '判断対象' : 'Candidates'}: ${candidates.join(' / ')}`);
  if (dims.length) lines.push(`- ${lang === 'ja' ? '比較する観点' : 'Comparison dimensions'}: ${dims.join(' / ')}`);
  lines.push(`- ${lang === 'ja' ? 'この結果で行うこと' : 'What this result provides'}: ${lang === 'ja' ? '候補を先に決めるのではなく、分かっている事実、足りない材料、守る条件、比較できる差を整理し、同じ材料から判断できる状態にする。' : 'Do not preselect a winner. Separate known facts, missing material, constraints, and comparable differences so the same material can support a later judgment.'}`);
  return lines.join('\n');
}
function section02(judgment, lang) {
  const items = premiseLines(judgment, lang);
  if (!items.length) return `- ${lang === 'ja' ? '明示された前提・制約・未確定事項を十分に抽出できていない。この不足を埋めずに判断すると、入力条件を落とす可能性がある。' : 'Explicit premises, constraints, and unresolved items were not sufficiently extracted. Deciding before filling this gap risks dropping user conditions.'}`;
  return [`- ${lang === 'ja' ? '判断中も変えてはいけない前提・制約・未確定事項' : 'Premises, constraints, and unresolved items that must remain fixed'}:`, ...items.map((v) => `  - ${v}`)].join('\n');
}
function section03(judgment, lang) {
  const section = judgment['03_facts'] || {};
  const supplied = observableClaims(judgment);
  const confirmed = unique((section.confirmed || []).map(factText).filter(Boolean));
  const diff = quantityDifference(judgment, lang);
  const lines = [];
  if (supplied.length) {
    lines.push(`- ${lang === 'ja' ? '入力で与えられた具体材料' : 'Concrete material supplied in the input'}:`);
    for (const value of supplied) lines.push(`  - ${clean(value)}`);
  }
  if (diff) lines.push(`- ${lang === 'ja' ? '入力値から直接計算できる差' : 'Difference directly calculable from supplied values'}: ${diff}`);
  if (confirmed.length) {
    lines.push(`- ${lang === 'ja' ? '外部根拠まで成立した事実' : 'Facts supported by accepted external evidence'}:`);
    for (const value of confirmed) lines.push(`  - ${value}`);
  }
  if (supplied.length && !confirmed.length) lines.push(`- ${lang === 'ja' ? '区別' : 'Boundary'}: ${lang === 'ja' ? '上記は利用者が与えた材料として保持する。外部事実として確認済みという意味ではない。' : 'The items above are preserved as user-supplied material; they are not automatically externally verified facts.'}`);
  if (!lines.length) lines.push(`- ${lang === 'ja' ? '現時点では、具体的な事実材料を判断に使える形で抽出できていない。' : 'No concrete factual material is currently available in a form usable for judgment.'}`);
  return lines.join('\n');
}
function section04(judgment, lang) {
  const premises = premiseLines(judgment, lang).join(' / ');
  const dims = dimensions(judgment);
  const lines = [`- ${lang === 'ja' ? '危機として見るのは「どちらが悪いか」ではなく、材料不足や条件違反のまま決めた場合に何を誤るか' : 'Risk means what could be decided incorrectly because material is missing or constraints are violated, not which candidate is “bad”'}:`];
  for (const risk of usefulRisks(judgment).slice(0, 6)) lines.push(`  - ${clean(risk.impact || risk.failure_condition || risk.key)}`);
  if (/未確定|未確認|未完了/u.test(premises) && dims.some((d) => /法務|legal/iu.test(d))) lines.push(`  - ${lang === 'ja' ? '法務確認が未完了なので、法務リスク軸でA/Bの優劣を確定すると未確認事項を事実扱いすることになる。' : 'Legal review is incomplete, so declaring a winner on legal risk would turn an unresolved item into an assumed fact.'}`);
  if (/変えない|維持|保持/u.test(premises)) lines.push(`  - ${lang === 'ja' ? '既存内容を変えない条件がある。抵触する候補は、好みや性能の比較以前に条件不一致として分けて扱う必要がある。' : 'A preserve constraint exists. A candidate that violates it must first be treated as condition-incompatible, before preference or performance is considered.'}`);
  if (quantityDifference(judgment, lang) && dims.some((d) => /作業時間|工数|時間|effort|time/iu.test(d))) lines.push(`  - ${lang === 'ja' ? '件数差は作業量の手掛かりにはなるが、1件あたり工数が不明なため、件数だけで総作業時間を断定すると誤る。' : 'Count is a workload clue, but per-item effort is unknown, so count alone cannot establish total work time.'}`);
  if (lines.length === 1) lines.push(`  - ${lang === 'ja' ? '未確認の事実を確定扱いしたり、比較条件の違う材料を同じ尺度として扱うと、判断を誤る。' : 'Treating unresolved facts as confirmed, or comparing material measured under different conditions, can produce a false judgment.'}`);
  return lines.join('\n');
}
function section05(judgment, lang) {
  const candidates = candidateLabels(judgment);
  const dims = dimensions(judgment);
  const observations = candidateObservations(judgment);
  const lines = [];
  if (candidates.length) {
    lines.push(`- ${lang === 'ja' ? '一方の案に都合のよい読み方だけをしないための確認' : 'Counter-checks that prevent reading the material in favor of only one candidate'}:`);
    for (const candidate of candidates) {
      const values = observations.get(candidate) || [];
      lines.push(`  - ${candidate}: ${values.length ? values.join(' / ') : (lang === 'ja' ? '候補固有の具体材料が不足している。' : 'Candidate-specific concrete material is missing.')}`);
      if (dims.length) lines.push(`    - ${lang === 'ja' ? '同じ条件で確認が必要な観点' : 'Dimensions that still need same-condition material'}: ${dims.join(' / ')}`);
    }
    const diff = quantityDifference(judgment, lang);
    if (diff) lines.push(`- ${lang === 'ja' ? '反対側からの読み方' : 'Counter-reading'}: ${diff}`);
    lines.push(`- ${lang === 'ja' ? '共通の反証条件' : 'Common falsification rule'}: ${lang === 'ja' ? '件数や単一指標だけで優劣を決めず、各観点で候補ごとの成立条件と不足材料が揃うまで結論を固定しない。' : 'Do not infer superiority from count or one metric; keep the conclusion open until comparable conditions and missing material are available for every dimension.'}`);
    return lines.join('\n');
  }
  const claim = observableClaims(judgment)[0] || purposeText(judgment);
  const entries = evidenceEntries(judgment);
  lines.push(`- ${lang === 'ja' ? '主張を支持する材料だけでなく、成立しない可能性も同じ強さで確認する' : 'Check the possibility that the claim is not established with the same rigor as supporting evidence'}:`);
  if (claim) lines.push(`  - ${lang === 'ja' ? '確認対象' : 'Claim under review'}: ${claim}`);
  lines.push(`  - ${lang === 'ja' ? '対象バージョン・時点・対象範囲・成立条件が一致しない根拠は、そのまま裏付けとして使わない。' : 'Evidence with a mismatched version, time scope, target scope, or conditions must not be treated as support for the claim.'}`);
  lines.push(`  - ${lang === 'ja' ? '支持根拠だけでなく、反証・例外・未成立条件も確認する。' : 'Check counter-evidence, exceptions, and failure conditions, not only supporting evidence.'}`);
  if (entries.some((e) => /NOT_EXECUTED|REJECTED|FAILED|ERROR/iu.test(`${e?.search_state || ''} ${e?.source_status || e?.state || ''}`))) lines.push(`  - ${lang === 'ja' ? '現在は外部根拠が成立していないため、主張を確認済みとして扱わない。' : 'External evidence is not currently established, so the claim must remain unresolved.'}`);
  return lines.join('\n');
}
function knownForDimension(dimension, judgment, lang) {
  const d = clean(dimension);
  const premises = premiseLines(judgment, lang);
  const parts = [];
  const diff = quantityDifference(judgment, lang);
  if (diff && /作業時間|工数|時間|期間|effort|time|duration/iu.test(d)) parts.push(diff);
  if (/法務|契約|規約|legal|policy|compliance/iu.test(d)) parts.push(...premises.filter((p) => /法務|契約|規約|返金|policy|legal|未確定|未確認|未完了/iu.test(p)));
  if (/利用者理解|理解度|可読|ユーザー|user|readab/iu.test(d) && diff) parts.push(lang === 'ja' ? '入力から分かるのは候補ごとの件数差までで、理解しやすさ・問い合わせ網羅率・読みやすさはまだ測定されていない。' : 'The input establishes a count difference only; it does not measure comprehension, coverage, or readability.');
  return unique(parts);
}
function section06(judgment, lang) {
  const candidates = candidateLabels(judgment);
  const dims = dimensions(judgment);
  if (!candidates.length) return `- ${lang === 'ja' ? '今回は複数候補の比較ではない。比較表を無理に作らず、事実・根拠成立状態・不足情報を使って対象主張を判断する。' : 'This request does not contain multiple candidates. Do not invent a comparison; judge the target claim from facts, evidence status, and missing information.'}`;
  const observations = candidateObservations(judgment);
  const lines = [`- ${lang === 'ja' ? '比較対象' : 'Candidates'}: ${candidates.join(' / ')}`];
  for (const candidate of candidates) {
    const values = observations.get(candidate) || [];
    lines.push(`- ${candidate} ${lang === 'ja' ? 'について現在ある材料' : 'material available now'}: ${values.length ? values.join(' / ') : (lang === 'ja' ? '候補固有の具体値なし' : 'no candidate-specific concrete value')}`);
  }
  lines.push(`- ${lang === 'ja' ? '各観点では「分かること」「まだ言えないこと」「追加で必要な材料」を分ける' : 'For every dimension, separate what is known, what is not yet justified, and what additional material is needed'}:`);
  for (const dimension of dims) {
    const known = knownForDimension(dimension, judgment, lang);
    lines.push(`  - ${lang === 'ja' ? '観点' : 'Dimension'}: ${dimension}`);
    lines.push(`    - ${lang === 'ja' ? '現在分かること' : 'Known now'}: ${known.length ? known.join(' / ') : (lang === 'ja' ? '候補間で同じ条件の具体値はまだない。' : 'No comparable same-condition value is available yet.')}`);
    lines.push(`    - ${lang === 'ja' ? 'まだ言えないこと' : 'Not yet justified'}: ${lang === 'ja' ? `${dimension}について、どちらが有利・不利かは現材料だけでは確定できない。` : `The current material does not establish which candidate is better or worse on ${dimension}.`}`);
    lines.push(`    - ${lang === 'ja' ? '追加で必要な材料' : 'Additional material needed'}: ${missingForDimension(dimension, lang)}`);
  }
  const diff = quantityDifference(judgment, lang);
  if (diff) lines.push(`- ${lang === 'ja' ? '数量だけで確実に言える差' : 'Difference established by quantity alone'}: ${diff}`);
  return lines.join('\n');
}
function evidenceExplanation(entry, lang) {
  const search = clean(entry?.search_state);
  const state = clean(entry?.source_status || entry?.state);
  if (search === 'NOT_REQUIRED') return lang === 'ja' ? '外部検索を必要としない利用者入力の条件として保持した。これは外部確認済みという意味ではない。' : 'Preserved as user-supplied material that does not require external search; this is not external confirmation.';
  if (search === 'NOT_EXECUTED') return lang === 'ja' ? '外部検索は実行されておらず、外部事実としては未確認のまま。' : 'External search was not executed, so external factual status remains unresolved.';
  if (/REJECTED|FAILED|ERROR/iu.test(`${state} ${search}`)) return lang === 'ja' ? '外部根拠の成立条件を満たしていない。根拠があることにせず、未成立のまま扱う。' : 'External evidence did not satisfy acceptance conditions; it remains unresolved rather than being promoted to confirmed.';
  if (/FINAL_VALID|CONFIRMED|FOUND/iu.test(`${state} ${search}`)) return lang === 'ja' ? '外部根拠候補は成立している。ただし個々の主張が確認済みかは主張ごとの確認状態と分けて読む。' : 'External evidence candidates were accepted; individual claim confirmation must still be checked separately.';
  return lang === 'ja' ? '外部根拠の状態を確認済みとみなせないため、未確定として保持する。' : 'The external evidence state cannot be treated as confirmed, so it remains unresolved.';
}
function section07(judgment, lang) {
  const section = judgment['07_evidence_status'] || {};
  const entries = evidenceEntries(judgment);
  const confirmed = Number(section.confirmed_claim_count || 0);
  const unresolved = Number(section.undetermined_claim_count || 0);
  const supplied = observableClaims(judgment);
  const candidates = candidateLabels(judgment);
  const dims = dimensions(judgment);
  const diff = quantityDifference(judgment, lang);
  const lines = [];
  if (supplied.length) {
    lines.push(`- ${lang === 'ja' ? '根拠状態を判定する対象になっている入力材料' : 'Input material whose evidence status is being evaluated'}:`);
    for (const value of supplied.slice(0, 6)) lines.push(`  - ${clean(value)}`);
  } else {
    const target = purposeText(judgment);
    if (target) lines.push(`- ${lang === 'ja' ? '根拠確認の対象' : 'Evidence target'}: ${target}`);
  }
  if (confirmed + unresolved > 0) lines.push(`- ${lang === 'ja' ? '主張の確認状態' : 'Claim confirmation'}: ${lang === 'ja' ? `${confirmed}件が外部根拠まで確認済み、${unresolved}件は未確定。確認済みと未確定を同じ事実として扱わない。` : `${confirmed} claims are externally confirmed; ${unresolved} remain unresolved. Confirmed and unresolved claims must not be treated as equivalent facts.`}`);
  for (const text of unique(entries.map((entry) => evidenceExplanation(entry, lang)))) lines.push(`- ${text}`);
  if (candidates.length) {
    lines.push(`- ${lang === 'ja' ? '現時点で判断材料としてそのまま使える範囲' : 'Material that can be used directly at this point'}: ${lang === 'ja' ? `${candidates.join(' / ')}について利用者入力で明示された内容と、そこから直接計算できる差まで。${diff || '外部確認を伴う追加事実は成立していない。'}` : `User-supplied observations for ${candidates.join(' / ')} and differences directly calculable from them. ${diff || 'No additional externally established fact is available.'}`}`);
    if (dims.length) lines.push(`- ${lang === 'ja' ? 'まだ根拠が成立していない判断軸' : 'Decision dimensions still lacking sufficient evidence'}: ${dims.map((d) => `${d}→${missingForDimension(d, lang)}`).join(' / ')}`);
    lines.push(`- ${lang === 'ja' ? 'この区別が判断に与える意味' : 'Why this boundary matters'}: ${lang === 'ja' ? '入力された件数や条件は比較の出発点として使えるが、作業時間・法務リスク・利用者理解など未測定の観点を入力値から推測して補ってはいけない。外部根拠が必要な事実は、成立した根拠が得られるまで未確定として残す。' : 'Supplied counts and conditions can be used as the starting point, but unmeasured dimensions must not be inferred from those values. Facts requiring external support remain unresolved until acceptable evidence exists.'}`);
  } else {
    lines.push(`- ${lang === 'ja' ? 'この根拠状態から直接言えること' : 'What follows directly from this evidence state'}: ${lang === 'ja' ? '成立した外部根拠がある主張だけを確認済みとして使用できる。成立していない、実行されていない、対象範囲や時点が一致しない根拠は、主張の裏付けとして使用しない。' : 'Only claims backed by accepted external evidence may be treated as confirmed. Missing, unexecuted, scope-mismatched, or time-mismatched evidence must not be used as support.'}`);
  }
  if (!lines.length) lines.push(`- ${lang === 'ja' ? '外部根拠の成立状態を示せる材料がないため、未確認の内容を確認済みとして扱わない。' : 'No concrete external-evidence status is available, so unverified material must not be treated as confirmed.'}`);
  lines.push(`- ${lang === 'ja' ? '判断時の区別' : 'Decision boundary'}: ${lang === 'ja' ? '「利用者入力として与えられた材料」「外部根拠まで成立した事実」「未確定」を混ぜない。根拠なしの場合は根拠なしのまま示し、不足部分を推測や一般論で補強しない。' : 'Keep user-supplied material, externally supported facts, and unresolved items separate. When evidence is absent, state that it is absent instead of filling the gap with assumptions or generic claims.'}`);
  return lines.join('\n');
}
function section08(judgment, lang) {
  const candidates = candidateLabels(judgment);
  const dims = dimensions(judgment);
  const premises = premiseLines(judgment, lang);
  const lines = [`- ${lang === 'ja' ? 'この材料から次に確認すること' : 'What to verify next from this material'}:`];
  if (premises.length) lines.push(`  - ${lang === 'ja' ? '判断中も固定する条件' : 'Conditions to preserve throughout judgment'}: ${premises.join(' / ')}`);
  if (candidates.length && dims.length) lines.push(`  - ${lang === 'ja' ? '候補を同じ条件で比べるために埋める材料' : 'Material to fill before comparing candidates under the same conditions'}: ${dims.map((d) => `${d}→${missingForDimension(d, lang)}`).join(' / ')}`);
  if (!candidates.length) lines.push(`  - ${lang === 'ja' ? '対象主張について、支持根拠だけでなく反証・例外・対象範囲・時点も確認し、根拠が成立しない場合は未確定のまま残す。' : 'For the target claim, check counter-evidence, exceptions, scope, and time as well as supporting evidence; leave it unresolved if evidence is not established.'}`);
  lines.push(`  - ${lang === 'ja' ? '未確定を0・問題なし・同等などに置き換えない。' : 'Do not replace unresolved material with zero, “no issue”, or equivalence.'}`);
  lines.push(`  - ${lang === 'ja' ? '必要材料が揃った後に、目的・制約・各比較観点を同時に照合して最終判断する。この出力自体は候補の採用・棄却・推奨を確定していない。' : 'After the required material is complete, check the purpose, constraints, and all relevant dimensions together before the final decision. This output has not selected, rejected, or recommended a candidate.'}`);
  return lines.join('\n');
}
function renderSections(judgment) {
  const lang = langOf(judgment);
  return {
    '01_purpose': section01(judgment, lang),
    '02_premise': section02(judgment, lang),
    '03_facts': section03(judgment, lang),
    '04_crisis': section04(judgment, lang),
    '05_opposition': section05(judgment, lang),
    '06_comparison': section06(judgment, lang),
    '07_evidence_status': section07(judgment, lang),
    '08_reinstruction': section08(judgment, lang)
  };
}
function renderUnifiedMain8(judgment) {
  const rendered = renderSections(judgment);
  const text = ORDER.map((key) => `${labelOf(judgment, key)}\n${rendered[key]}`).join('\n---\n');
  return {
    mode: 'judgment_material',
    target: 'user_ai',
    consumer_scope: 'HUMAN_AND_AI_SAME_MATERIAL',
    raw_policy: 'do_not_pass_raw_by_default',
    non_ai: true,
    decision_authority: 'EXTERNAL_ONLY',
    format: judgment.format,
    text,
    compact_text: ORDER.map((key) => `${labelOf(judgment, key)}: ${rendered[key].replace(/\n\s*/g, ' / ')}`).join('\n'),
    sections: ORDER.map((key) => ({ key, label: labelOf(judgment, key), text: rendered[key] }))
  };
}

module.exports = { renderUnifiedMain8, renderSections, extractCandidateQuantities, missingForDimension };
