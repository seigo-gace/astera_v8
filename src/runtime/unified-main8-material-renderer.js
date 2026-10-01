'use strict';

const ORDER = Object.freeze([
  '01_purpose',
  '02_premise',
  '03_facts',
  '04_crisis',
  '05_opposition',
  '06_comparison',
  '07_evidence_status',
  '08_reinstruction'
]);

const unique = (values = []) => [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();

function langOf(judgment = {}) {
  return String(judgment.output_language || 'ja').split('-')[0] === 'ja' ? 'ja' : 'en';
}

function labelOf(judgment, key) {
  return judgment?.[key]?.label || judgment?.[key]?.canonical_label || key;
}

function stripInternalPrefix(value) {
  return clean(value)
    .replace(/^T\d+\[[^\]]+\]\s*/u, '')
    .replace(/^T\d+:\s*/u, '')
    .replace(/^(?:purpose|objective)=/iu, '')
    .trim();
}

function purposeText(judgment) {
  const section = judgment['01_purpose'] || {};
  const direct = clean(section.user_goal || section.analysis_intent?.purpose || judgment.analysis_intent?.purpose);
  if (direct) return direct;
  return stripInternalPrefix((section.items || [])[0] || section.summary || '');
}

function candidateLabels(judgment) {
  const section = judgment['06_comparison'] || {};
  return unique((section.comparison_candidates || []).map((candidate) =>
    typeof candidate === 'string' ? candidate : (candidate?.label || candidate?.candidate_id)
  )).filter((value) => value && !/^observable:/iu.test(value));
}

function dimensions(judgment) {
  return unique(judgment['06_comparison']?.dimensions || []).filter((value) => !/^主張の検証状態$/u.test(value));
}

function observableClaims(judgment) {
  return unique(judgment.observable_material?.claim_texts || []);
}

function candidateObservations(judgment) {
  const section = judgment['06_comparison'] || {};
  const claims = observableClaims(judgment);
  const map = new Map();
  for (const label of candidateLabels(judgment)) map.set(label, []);
  for (const material of section.candidate_materials || []) {
    const label = clean(material.label || material.candidate_id);
    if (!map.has(label)) continue;
    map.set(label, unique([...(map.get(label) || []), ...(material.observations || [])]));
  }
  for (const label of map.keys()) {
    map.set(label, unique([...(map.get(label) || []), ...claims.filter((claim) => String(claim).includes(label))]));
  }
  return map;
}

function extractCandidateQuantities(judgment) {
  const map = candidateObservations(judgment);
  const out = [];
  for (const [label, values] of map.entries()) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const value of values) {
      const match = new RegExp(`${escaped}[^0-9０-９]{0,100}([0-9０-９]+(?:[.．][0-9０-９]+)?)\\s*(件|人|回|日|時間|分|秒|円|万円|台|個|社|本|枚|%|％)`, 'u').exec(String(value));
      if (!match) continue;
      const normalized = match[1].replace(/[０-９]/g, (ch) => String(ch.charCodeAt(0) - 0xFF10)).replace('．', '.');
      const number = Number(normalized);
      if (Number.isFinite(number)) {
        out.push({ label, number, unit: match[2], source: clean(value) });
        break;
      }
    }
  }
  return out;
}

function premiseLine(value, lang) {
  const text = clean(value);
  const rules = [
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
  for (const [pattern, label] of rules) {
    if (pattern.test(text)) return `${label}: ${text.replace(pattern, '')}`;
  }
  const record = /^constraint\[([^\]]+)\]=(.*)$/iu.exec(text);
  if (record) return `${lang === 'ja' ? '制約' : 'Constraint'} (${record[1]}): ${record[2]}`;
  if (/^未確定条件\s*:/u.test(text)) return text;
  if (/^(?:T\d+|PARSER_|TASK_GRAPH|NO_EXECUTABLE_ACTION|SOURCE_ROLE|RECOVERED|FAIL_CLOSED)/iu.test(text)) return '';
  return text;
}

function premiseLines(judgment, lang) {
  return unique((judgment['02_premise']?.items || []).map((item) => premiseLine(item, lang)).filter(Boolean));
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
  if (/legal|policy|contract|compliance/iu.test(d)) return 'legal review result per candidate, relevant wording/clauses, and unresolved legal points';
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
  return {
    values,
    sentence: lang === 'ja'
      ? `${a.label}=${a.number}${a.unit}、${b.label}=${b.number}${b.unit}。数量差は${diff}${a.unit}${ratioText ? `で、多い側は少ない側の約${ratioText}倍` : ''}。これは件数差であり、作業時間・品質・法務安全性の優劣そのものではない。`
      : `${a.label}=${a.number}${a.unit}, ${b.label}=${b.number}${b.unit}. The difference is ${diff}${a.unit}${ratioText ? `; the larger count is about ${ratioText}x the smaller` : ''}. This is a count difference, not proof of superiority in time, quality, or legal safety.`
  };
}

function section01(judgment, lang) {
  const purpose = purposeText(judgment);
  const candidates = candidateLabels(judgment);
  const dims = dimensions(judgment);
  const lines = [`- ${lang === 'ja' ? '目的' : 'Purpose'}: ${purpose || (lang === 'ja' ? '入力内容を判断材料として整理する' : 'Organize the input into judgment material')}`];
  if (candidates.length) lines.push(`- ${lang === 'ja' ? '判断対象' : 'Candidates'}: ${candidates.join(' / ')}`);
  if (dims.length) lines.push(`- ${lang === 'ja' ? '比較する観点' : 'Comparison dimensions'}: ${dims.join(' / ')}`);
  lines.push(`- ${lang === 'ja' ? 'この結果が答える範囲' : 'What this result answers'}: ${lang === 'ja' ? '候補を決めるのではなく、何が分かっていて、何が不足し、どの条件を守り、各観点で何を比べれば判断できるかを示す。' : 'It does not choose a candidate; it shows what is known, what is missing, what constraints must hold, and what must be compared on each dimension.'}`);
  return lines.join('\n');
}

function section02(judgment, lang) {
  const items = premiseLines(judgment, lang);
  if (!items.length) return `- ${lang === 'ja' ? '明示された前提・制約・未確定事項を十分に抽出できていない。ここを補わずに判断すると、入力条件を落とす可能性がある。' : 'Explicit premises, constraints, and unresolved items were not sufficiently extracted; deciding without them risks dropping user conditions.'}`;
  return [
    `- ${lang === 'ja' ? '判断時に固定して扱う条件' : 'Conditions that must remain fixed during judgment'}:`,
    ...items.map((item) => `  - ${item}`)
  ].join('\n');
}

function section03(judgment, lang) {
  const section = judgment['03_facts'] || {};
  const confirmed = unique((section.confirmed || []).map(factText).filter(Boolean));
  const supplied = observableClaims(judgment);
  const diff = quantityDifference(judgment, lang);
  const lines = [];
  if (supplied.length) {
    lines.push(`- ${lang === 'ja' ? '入力で与えられた具体材料' : 'Concrete material supplied in the input'}:`);
    for (const value of supplied) lines.push(`  - ${clean(value)}`);
  }
  if (diff) lines.push(`- ${lang === 'ja' ? '入力値から直接計算できる差' : 'Difference directly calculable from supplied values'}: ${diff.sentence}`);
  if (confirmed.length) {
    lines.push(`- ${lang === 'ja' ? '外部根拠まで成立した事実' : 'Facts supported by accepted external evidence'}:`);
    for (const value of confirmed) lines.push(`  - ${value}`);
  }
  if (supplied.length && !confirmed.length) lines.push(`- ${lang === 'ja' ? '注意' : 'Caution'}: ${lang === 'ja' ? '上記は利用者入力として保持する材料であり、外部事実として確認済みという意味ではない。' : 'The items above are preserved as user-supplied material; that does not make them externally verified facts.'}`);
  if (!lines.length) lines.push(`- ${lang === 'ja' ? '判断に使える具体的な事実材料をまだ抽出できていない。' : 'No concrete fact material is currently available for judgment.'}`);
  return lines.join('\n');
}

function section04(judgment, lang) {
  const risks = judgment['04_crisis']?.risks || [];
  const premises = premiseLines(judgment, lang).join(' / ');
  const dims = dimensions(judgment);
  const lines = [`- ${lang === 'ja' ? 'ここで危険なのは「どの案が悪いか」ではなく、材料不足のまま何を決めてしまうか' : 'The risk here is not which candidate is “bad”, but what could be decided while material is still missing'}:`];
  for (const risk of risks.slice(0, 8)) {
    const impact = clean(risk.impact || risk.failure_condition || risk.key);
    if (impact) lines.push(`  - ${impact}`);
  }
  if (/未確定|未確認|未完了/u.test(premises) && dims.some((d) => /法務|legal/iu.test(d))) {
    lines.push(`  - ${lang === 'ja' ? '法務確認が未完了なので、法務リスク軸でA/Bの優劣を確定すると未確認事項を事実扱いすることになる。' : 'Legal review is incomplete, so declaring a winner on the legal-risk dimension would turn an unresolved item into an assumed fact.'}`);
  }
  if (/変えない|維持|保持/u.test(premises)) {
    lines.push(`  - ${lang === 'ja' ? '既存内容を変えない条件があるため、その条件に抵触する候補は「良し悪し」以前に条件不一致として分けて扱う必要がある。' : 'A preserve constraint exists; any candidate that violates it must be separated as condition-incompatible before discussing preference.'}`);
  }
  const diff = quantityDifference(judgment, lang);
  if (diff && dims.some((d) => /作業時間|工数|時間|effort|time/iu.test(d))) {
    lines.push(`  - ${lang === 'ja' ? '件数差は作業量の手掛かりにはなるが、1件あたり工数が不明なため、件数だけで作業時間を断定すると誤る。' : 'Count is a workload clue, but per-item effort is unknown, so count alone cannot establish total work time.'}`);
  }
  return unique(lines).join('\n');
}

function section05(judgment, lang) {
  const candidates = candidateLabels(judgment);
  const observations = candidateObservations(judgment);
  const dims = dimensions(judgment);
  const lines = [];
  if (candidates.length) {
    lines.push(`- ${lang === 'ja' ? '候補ごとに、都合のよい解釈を避けるために確認する点' : 'Counter-checks for each candidate to avoid favorable assumptions'}:`);
    for (const candidate of candidates) {
      const values = observations.get(candidate) || [];
      lines.push(`  - ${candidate}: ${values.length ? values.join(' / ') : (lang === 'ja' ? '候補固有の具体材料が不足している。' : 'Candidate-specific concrete material is missing.')}`);
      if (dims.length) lines.push(`    - ${lang === 'ja' ? '未確認のまま残っている観点' : 'Dimensions still requiring comparable material'}: ${dims.join(' / ')}`);
    }
    const diff = quantityDifference(judgment, lang);
    if (diff) lines.push(`- ${lang === 'ja' ? '反対側からの読み方' : 'Counter-reading'}: ${diff.sentence}`);
    lines.push(`- ${lang === 'ja' ? '共通の反証条件' : 'Common falsification condition'}: ${lang === 'ja' ? '件数や単一指標だけで優劣を決めず、各比較軸で候補ごとの成立条件と不足材料が埋まるまで結論を固定しない。' : 'Do not infer superiority from count or one metric; keep the conclusion open until comparable conditions and missing material are filled for every dimension.'}`);
  } else {
    const perspectives = judgment['05_opposition']?.expanded_perspectives || judgment['05_opposition']?.perspectives || [];
    const focuses = unique(perspectives.map((item) => clean(Array.isArray(item.focus) ? item.focus.join(' / ') : item.focus)).filter(Boolean));
    lines.push(`- ${lang === 'ja' ? '別の見方として確認する点' : 'Alternative viewpoints to check'}:`);
    if (focuses.length) for (const focus of focuses.slice(0, 8)) lines.push(`  - ${focus}`);
    else lines.push(`  - ${lang === 'ja' ? '反対視点を具体化するだけの材料が不足している。' : 'There is not enough material to make the opposing view concrete.'}`);
  }
  return lines.join('\n');
}

function dimensionKnownMaterial(dimension, judgment, lang) {
  const d = clean(dimension);
  const diff = quantityDifference(judgment, lang);
  const premises = premiseLines(judgment, lang);
  const supplied = observableClaims(judgment);
  const parts = [];
  if (diff && /作業時間|工数|時間|期間|effort|time|duration/iu.test(d)) parts.push(diff.sentence);
  if (/法務|契約|規約|legal|policy|compliance/iu.test(d)) {
    parts.push(...premises.filter((item) => /法務|契約|規約|返金|policy|legal|未確定|未確認|未完了/iu.test(item)));
  }
  if (/利用者理解|理解度|可読|ユーザー|user|readab/iu.test(d)) {
    if (diff) parts.push(lang === 'ja' ? '入力から分かるのは候補ごとの件数差までで、理解しやすさや問い合わせ網羅率そのものは測定されていない。' : 'The input establishes a count difference only; it does not measure comprehension, readability, or coverage.');
  }
  if (!parts.length) parts.push(...supplied.filter((value) => value.includes(d)).slice(0, 4));
  return unique(parts);
}

function section06(judgment, lang) {
  const candidates = candidateLabels(judgment);
  const dims = dimensions(judgment);
  const observations = candidateObservations(judgment);
  if (!candidates.length) return `- ${lang === 'ja' ? '比較対象が具体化されていないため、候補間の差を判断材料として組み立てられない。' : 'No concrete comparison candidates were extracted, so candidate differences cannot yet be assembled.'}`;
  const lines = [
    `- ${lang === 'ja' ? '比較対象' : 'Candidates'}: ${candidates.join(' / ')}`,
    `- ${lang === 'ja' ? '比較方法' : 'Comparison method'}: ${lang === 'ja' ? '各観点について「現在分かること」「まだ言えないこと」「判断に追加で必要な材料」を分ける。' : 'For each dimension, separate what is known, what cannot yet be concluded, and what additional material is needed.'}`
  ];
  for (const candidate of candidates) {
    const values = observations.get(candidate) || [];
    lines.push(`- ${candidate} ${lang === 'ja' ? 'の入力材料' : 'input material'}: ${values.length ? values.join(' / ') : (lang === 'ja' ? '候補固有の具体値なし' : 'no candidate-specific concrete value')}`);
  }
  for (const dimension of dims.length ? dims : [lang === 'ja' ? '主張の検証状態' : 'claim verification status']) {
    const known = dimensionKnownMaterial(dimension, judgment, lang);
    lines.push(`- ${lang === 'ja' ? '観点' : 'Dimension'}: ${dimension}`);
    lines.push(`  - ${lang === 'ja' ? '現在分かること' : 'Known now'}: ${known.length ? known.join(' / ') : (lang === 'ja' ? '候補間で比較できる同条件の具体値はまだない。' : 'No comparable same-condition values are available yet.')}`);
    lines.push(`  - ${lang === 'ja' ? 'まだ言えないこと' : 'Not yet justified'}: ${lang === 'ja' ? `${dimension}について、どちらが有利・不利かは現材料だけでは確定できない。` : `The current material does not establish which candidate is better or worse on ${dimension}.`}`);
    lines.push(`  - ${lang === 'ja' ? '追加で必要な材料' : 'Additional material needed'}: ${missingForDimension(dimension, lang)}`);
  }
  const diff = quantityDifference(judgment, lang);
  if (diff) lines.push(`- ${lang === 'ja' ? '数量だけで確実に言える差' : 'Difference established by quantity alone'}: ${diff.sentence}`);
  return lines.join('\n');
}

function evidenceExplanation(entry, lang) {
  const searchState = clean(entry?.search_state);
  const status = clean(entry?.source_status || entry?.state);
  if (searchState === 'NOT_REQUIRED') return lang === 'ja' ? '外部検索を必要としない入力条件として扱った。これは「外部確認済み」とは別で、利用者が与えた条件として保持する。' : 'Treated as user-supplied material that does not require external search. This is not the same as external verification.';
  if (searchState === 'NOT_EXECUTED') return lang === 'ja' ? '外部検索は実行されていない。外部事実としては未確認のまま。' : 'External search was not executed; external factual status remains unverified.';
  if (/REJECTED|FAILED|ERROR/iu.test(status + ' ' + searchState)) return lang === 'ja' ? '外部根拠の成立条件を満たしていない。根拠があることにせず、未成立のまま扱う。' : 'External evidence did not satisfy acceptance conditions; it remains unestablished rather than being promoted.';
  if (/FINAL_VALID|CONFIRMED|FOUND/iu.test(status + ' ' + searchState)) return lang === 'ja' ? '外部根拠候補は成立している。ただし個々のClaimが確認済みかはClaim状態と分けて読む。' : 'External evidence candidates were accepted; individual claim confirmation must still be read separately.';
  return lang === 'ja' ? `外部根拠状態は ${searchState || status || '未確定'}。確認済みとみなさず状態を保持する。` : `External evidence state is ${searchState || status || 'undetermined'}; do not treat it as confirmed without claim-level confirmation.`;
}

function section07(judgment, lang) {
  const section = judgment['07_evidence_status'] || {};
  const perTask = section.evidence_search || judgment.evidence_state?.per_task || {};
  const lines = [];
  const total = Number(section.confirmed_claim_count || 0) + Number(section.undetermined_claim_count || 0);
  if (total > 0) lines.push(`- ${lang === 'ja' ? 'Claim確認状態' : 'Claim confirmation'}: ${section.confirmed_claim_count || 0}/${total} ${lang === 'ja' ? '件が確認済み、' : 'confirmed; '}${section.undetermined_claim_count || 0}${lang === 'ja' ? '件は未確定。' : ' remain undetermined.'}`);
  for (const entry of Object.values(perTask)) lines.push(`- ${evidenceExplanation(entry, lang)}`);
  if (!lines.length) lines.push(`- ${lang === 'ja' ? '外部根拠の成立状態を具体的に示せる材料がないため、未確認の内容を確認済みとして扱わない。' : 'No concrete external-evidence state is available, so unverified content must not be treated as confirmed.'}`);
  lines.push(`- ${lang === 'ja' ? '読み方' : 'How to read this'}: ${lang === 'ja' ? '「入力で与えられた材料」「外部根拠が成立した事実」「未確定」を混ぜずに判断する。' : 'Keep user-supplied material, externally supported facts, and unresolved items separate when deciding.'}`);
  return unique(lines).join('\n');
}

function section08(judgment, lang) {
  const dims = dimensions(judgment);
  const premises = premiseLines(judgment, lang);
  const candidates = candidateLabels(judgment);
  const lines = [`- ${lang === 'ja' ? '次に判断する人またはAIが行うこと' : 'What the next human or AI decision-maker should do'}:`];
  if (premises.length) lines.push(`  - ${lang === 'ja' ? 'まず固定する条件' : 'First preserve these conditions'}: ${premises.join(' / ')}`);
  if (candidates.length && dims.length) lines.push(`  - ${lang === 'ja' ? '同じ比較条件で埋める不足材料' : 'Fill the missing material under the same comparison conditions'}: ${dims.map((d) => `${d}→${missingForDimension(d, lang)}`).join(' / ')}`);
  lines.push(`  - ${lang === 'ja' ? '未確定は未確定のまま残し、0・問題なし・同等などに置き換えない。' : 'Keep unresolved items unresolved; do not replace them with zero, “no issue”, or equivalence.'}`);
  lines.push(`  - ${lang === 'ja' ? '材料が揃った後に、目的・制約・各比較軸を同時に満たすかを照合して最終判断する。Asteraの出力自体は候補の採用・棄却・推奨を確定していない。' : 'After the material is complete, check the purpose, constraints, and every comparison dimension together before the final decision. Astera itself has not selected, rejected, or recommended a candidate.'}`);
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
  const compactText = ORDER.map((key) => `${labelOf(judgment, key)}: ${rendered[key].replace(/\n\s*/g, ' / ')}`).join('\n');
  return {
    mode: 'judgment_material',
    target: 'user_ai',
    consumer_scope: 'HUMAN_AND_AI_SAME_MATERIAL',
    raw_policy: 'do_not_pass_raw_by_default',
    non_ai: true,
    decision_authority: 'EXTERNAL_ONLY',
    format: judgment.format,
    text,
    compact_text: compactText,
    sections: judgment.order?.map((key) => ({ key, label: labelOf(judgment, key), text: rendered[key] })) || []
  };
}

module.exports = { renderUnifiedMain8, renderSections, extractCandidateQuantities, missingForDimension };
