'use strict';

const ACTIONS = [
  ['verify', /検証|確認|監査|調査|分析|解析|評価|verify|validate|audit|investigat|analy[sz]|evaluate|check/i],
  ['compare', /比較|比べ|選択肢|compare|versus|\bvs\b/i],
  ['decide', /判断|選定|選ぶ|決め|採用|decid|select|choose|recommend/i],
  ['improve', /改善|改良|修正|直(?:す|せ|し)|最適化|強化|精度.{0,8}(?:上げ|向上)|improv|optimi[sz]e|fix|refactor|strengthen/i],
  ['implement', /実装|作成|構築|開発|組み立て|追加|implement|build|create|develop|add/i],
  ['integrate', /統合|接続|連携|組み込|当てはめ|integrat|connect|link|incorporat/i],
  ['migrate', /移行|置換|切替|入れ替|migrat|replace|switch/i],
  ['remove', /削除|除去|外す|remove|delete|eliminate/i],
  ['preserve', /維持|保持|残す|壊さず|変えず|そのまま|keep|preserve|retain/i],
  ['explain', /説明|教え|解説|explain|describe|tell me/i]
].map(([id, re]) => ({ id, re }));

const STOP = new Set([
  'これ','それ','あれ','ここ','そこ','もの','こと','ため','よう','について','として',
  'する','した','して','いる','ある','ない','です','ます','から','まで',
  'the','and','for','with','from','this','that','what','how','please','into','using','use','then'
]);

const RX = {
  order: /^(?:その後|次に|続いて|最後に|完了後|終わったら|終えてから|してから|確認後|検証後|then|after|afterward|finally|next)\b/i,
  parallel: /^(?:並行して|並列で|同時に|parallel|concurrently|at the same time)\b/i,
  condition: /(?:場合|とき|時に|なら|ならば|であれば|を条件に|if\b|when\b|provided that|unless)/i,
  exception: /(?:ただし|例外|除く|を除き|except|however|but only)/i,
  deadline: /(?:期限|までに|今日中|明日まで|今週中|deadline|by\s+\w+|before\s+\w+)/i,
  priority: /(?:最優先|優先|先に|まず|第一に|priority|first|before)/i,
  success: /(?:成功条件|完了条件|合格条件|acceptance(?: criteria)?|success(?: criteria)?)(?:は|:|=)?\s*(.*)/i,
  verify: /(?:検証|確認|test|verify|validate|assert|check)/i,
  prohibit: /(?:禁止|するな|しない|しないで|してはいけ|勝手に|must not|do not|never|without changing)/i,
  preserve: /(?:維持|保持|残す|壊さず|変えず|そのまま|keep|preserve|retain|without breaking)/i,
  replace: /(?:置換|差し替|入れ替|変更対象|変更|replace|swap|change)/i,
  evidence: /(?:根拠|証拠|Evidence|source|出典|公式|一次資料|事実確認|ファクトチェック|fact.?check|audit|current|latest|現在|最新|価格|料金|法令|規約|外部仕様)/i,
  internalTest: /(?:テスト|試験|build|CI|lint|unit test|integration test|runtime test|smoke test|回帰|動作確認|ビルド|コンパイル)/i
};

const norm = (value) => String(value || '').normalize('NFKC').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim();
const unique = (items) => [...new Set((items || []).map((item) => String(item || '').trim()).filter(Boolean))];
const language = (text) => /[ぁ-んァ-ヶ一-龠々]/.test(String(text || '')) ? 'ja' : 'en';
const clean = (value) => norm(value)
  .replace(/^[「『“"\s]+|[」』”"\s]+$/g, '')
  .replace(/^(?:まず|次に|さらに|あと|そして|また|その後|最後に|please|could you|can you|then|next)\s*/i, '')
  .replace(/^[、,;:\s]+/, '')
  .replace(/[。！？!?]+$/g, '')
  .trim();

function terms(text) {
  const n = norm(text);
  const ascii = n.match(/[A-Za-z][A-Za-z0-9_.:/-]{1,}|\d+(?:\.\d+){0,3}/g) || [];
  const ja = n.match(/[一-龠々ァ-ヶぁ-ん]{2,18}/g) || [];
  return unique([...ascii, ...ja]).map((item) => item.toLowerCase()).filter((item) => !STOP.has(item) && item.length >= 2).slice(0, 64);
}

function actionMatches(text) {
  return ACTIONS.map((entry) => {
    const match = entry.re.exec(text);
    return match ? { id: entry.id, match: match[0], index: match.index } : null;
  }).filter(Boolean).sort((a, b) => a.index - b.index || a.id.localeCompare(b.id));
}

function action(text) {
  const matches = actionMatches(text);
  return matches.find((item) => item.id !== 'preserve') || matches[0] || { id: 'analyze', match: '', index: -1 };
}

function clauseType(text) {
  if (/訂正|撤回|前言|ではなく|じゃなく|違う|correct|withdraw|retract|instead/i.test(text)) return 'correction';
  if (RX.prohibit.test(text)) return 'prohibition';
  if (RX.preserve.test(text)) return 'preserve';
  if (RX.verify.test(text)) return 'verification';
  if (/決定|採用|選定|判断|decide|select|choose|adopt/i.test(text)) return 'decision';
  if (/[?？]$|教え|どう|何を|なぜ|why|how|what/i.test(text)) return 'question';
  if (/実装|作成|構築|変更|修正|改善|分析|解析|比較|移行|削除|統合|接続|行え|しろ|せよ|してください|implement|build|change|fix|analy[sz]|compare|migrate|remove|integrate/i.test(text)) return 'instruction';
  return 'statement';
}

function spanPart(segment, raw, start, end, source) {
  const part = raw.slice(start, end);
  const left = part.length - part.trimStart().length;
  const right = part.length - part.trimEnd().length;
  return { start: segment.start + start + left, end: segment.start + end - right, text: source.slice(segment.start + start + left, segment.start + end - right) };
}

function segment(input) {
  const text = String(input || '');
  const base = [];
  let start = 0;
  let quote = null;
  let code = false;
  const push = (end) => {
    const raw = text.slice(start, end);
    const left = raw.length - raw.trimStart().length;
    const right = raw.length - raw.trimEnd().length;
    const begin = start + left;
    const finish = end - right;
    if (finish > begin) base.push({ start: begin, end: finish, text: text.slice(begin, finish) });
    start = end;
  };
  for (let index = 0; index < text.length; index += 1) {
    if (text.slice(index, index + 3) === '```') { code = !code; index += 2; continue; }
    if (code) continue;
    const char = text[index];
    if (!quote && ['「','『','“','"'].includes(char)) quote = char;
    else if (quote && ((quote === '「' && char === '」') || (quote === '『' && char === '』') || (quote === '“' && char === '”') || (quote === '"' && char === '"'))) quote = null;
    if (!quote && /[。！？!?\n;]/.test(char)) push(index + 1);
  }
  if (start < text.length) push(text.length);
  const output = [];
  for (const item of base) {
    const raw = text.slice(item.start, item.end);
    let last = 0;
    for (let index = 0; index < raw.length; index += 1) {
      if (!['、', ','].includes(raw[index])) continue;
      const left = raw.slice(last, index);
      const right = raw.slice(index + 1);
      if (actionMatches(left).length && (actionMatches(right).length || RX.order.test(right.trimStart()) || RX.parallel.test(right.trimStart()))) {
        output.push(spanPart(item, raw, last, index + 1, text));
        last = index + 1;
      }
    }
    output.push(spanPart(item, raw, last, raw.length, text));
  }
  return output.filter((item) => clean(item.text));
}

const splitSentences = (value) => segment(norm(value)).map((item) => item.text);
function collect(text, regex) { return unique(segment(norm(text)).filter((item) => regex.test(item.text)).map((item) => clean(item.text))).slice(0, 24); }
function success(text) {
  const output = [];
  for (const item of segment(norm(text))) {
    const match = RX.success.exec(item.text);
    if (match && clean(match[1])) output.push(clean(match[1]));
    else if (/(?:必ず|must\b|without\b|せずに|できること|であること)/i.test(item.text) && !RX.prohibit.test(item.text)) output.push(clean(item.text));
  }
  return unique(output);
}
const constraints = (text) => unique([...collect(text, /必ず|のみ|限定|守る|責務分離|非AI|決定論|変更せず|without|must\b|only\b|separate|deterministic/i), ...collect(text, RX.condition)]).slice(0, 24);
const prohibitions = (text) => collect(text, RX.prohibit);
const preserves = (text) => collect(text, RX.preserve);
const verifications = (text) => collect(text, RX.verify);
const conditions = (text) => collect(text, RX.condition);
const exceptions = (text) => collect(text, RX.exception);
const deadlines = (text) => collect(text, RX.deadline);
const replacements = (text) => segment(norm(text)).filter((item) => RX.replace.test(item.text) && !RX.prohibit.test(item.text)).map((item) => clean(item.text)).slice(0, 24);

function target(text, detectedAction = action(text)) {
  if (detectedAction.index > 0) {
    const before = text.slice(0, detectedAction.index);
    const explicit = before.match(/([^。！？!?\n、,]{1,100}?)(?:を|について|に対して)\s*$/i);
    if (explicit) {
      let candidate = clean(explicit[1]).split(/(?:したまま|のまま|ながら|つつ|してから|した上で)/i).pop();
      candidate = clean(candidate).replace(/^(?:これ|それ|あれ)$/u, '').replace(/(?:は|が|の)$/u, '').trim();
      if (candidate) return candidate;
    }
  }
  const named = /(?:対象|target)(?:は|:|=)\s*([^。！？!?\n]{1,140})/i.exec(text);
  if (named) return clean(named[1]);
  if (detectedAction.index > 0) {
    let prefix = clean(text.slice(0, detectedAction.index))
      .replace(/を(?:公式)?根拠で$/u, '')
      .replace(/(?:を|について|に対して|から|で|の)$/u, '')
      .replace(/^(?:これ|それ|あれ)(?:を|について)?$/u, '')
      .replace(/(?:は|が|を|で|の)$/u, '')
      .trim();
    if (prefix && prefix.length <= 120) return prefix;
  }
  const fallback = terms(text).filter((item) => !ACTIONS.some((entry) => entry.re.test(item))).slice(0, 4).join('・');
  return (fallback || (language(text) === 'ja' ? '入力対象' : 'input target')).replace(/(?:は|が|を|で|の)$/u, '');
}

function objective(targetName, actionName, lang) {
  const name = targetName || (lang === 'ja' ? '対象' : 'the target');
  if (lang === 'en') {
    const map = { verify:`Verify ${name} by separating supported facts, unresolved claims, risks, and evidence gaps.`, compare:`Compare viable options for ${name} under the same explicit criteria and preserve rejection reasons.`, decide:`Resolve ${name} from explicit criteria, evidence state, risk controls, and unresolved conditions.`, improve:`Improve ${name} while preserving stated constraints and acceptance conditions.`, implement:`Build ${name} while preserving constraints, dependencies, and verification conditions.`, integrate:`Integrate ${name} while preserving boundaries, dependencies, and failure handling.`, migrate:`Move ${name} without losing required behavior, compatibility, or rollback.`, remove:`Remove the identified element from ${name} without breaking preserved behavior or dependencies.`, preserve:`Preserve ${name} while other changes proceed.`, explain:`Explain ${name} using explicit facts, constraints, and decision implications.`, analyze:`Structure ${name} into facts, uncertainty, risks, and alternatives.` };
    return map[actionName] || map.analyze;
  }
  const map = { verify:`${name}の確認済み事実・未確認・Risk・Evidence不足を分離して検証する。`, compare:`${name}の候補を同一基準で比較し、採用条件と不採用理由を保持する。`, decide:`${name}を明示基準・Evidence・Risk・未解決条件から機械的に判断する。`, improve:`${name}を改善し、制約・維持条件・合格条件を保持する。`, implement:`${name}を制約・依存・検証条件を守って実装する。`, integrate:`${name}の責務境界・依存・失敗処理を保って統合する。`, migrate:`${name}の機能・互換性・Rollbackを維持して移行する。`, remove:`${name}の必要動作と依存を壊さず除去する。`, preserve:`${name}の維持条件を固定して他変更で破壊しない。`, explain:`${name}の仕組み・制約・判断影響を明示根拠で説明する。`, analyze:`${name}の事実・未確認・Risk・代替案を判断材料へ構造化する。` };
  return map[actionName] || map.analyze;
}

function makeTask(sourceSpan, index, lang, globalSuccess) {
  const text = clean(sourceSpan.text);
  const detected = action(text);
  const type = clauseType(text);
  const taskTarget = target(text, detected);
  const actionable = detected.id !== 'analyze' || ['verification','decision'].includes(type);
  const taskSuccess = unique([...success(text), ...globalSuccess.filter((item) => text.includes(item))]);
  return { id:`T${String(index + 1).padStart(2, '0')}`, source_span:{start:sourceSpan.start,end:sourceSpan.end,text}, raw_text:norm(sourceSpan.text), clause_type:type, actionable, action:detected.id, target:taskTarget, objective:objective(taskTarget,detected.id,lang), deliverables:[], premises:[], constraints:constraints(text), prohibitions:prohibitions(text), preserve:preserves(text), replace:replacements(text), conditions:conditions(text), exceptions:exceptions(text), deadlines:deadlines(text), priority:RX.priority.test(text)?'high':'normal', order:index+1, depends_on:[], parallelizable:true, success_criteria:taskSuccess, verification:verifications(text), completion_criteria:taskSuccess, unresolved:[], evidence_need:{required:RX.evidence.test(text),reasons:[],queries:terms(text).slice(0,12)}, external_action:['implement','improve','integrate','migrate','remove'].includes(detected.id), hard_blockers:[] };
}

function attach(tasks, others) {
  if (!tasks.length) return;
  for (const clause of others) {
    const text = clause.source_span.text;
    const taskSuccess=success(text), taskConstraints=constraints(text), taskProhibitions=prohibitions(text), taskPreserves=preserves(text), taskReplacements=replacements(text), taskConditions=conditions(text), taskExceptions=exceptions(text), taskVerifications=verifications(text), premises=['statement','question'].includes(clause.clause_type)?[clean(text)]:[];
    const global = taskProhibitions.length || taskSuccess.length;
    const targets = global ? tasks : [tasks.slice().reverse().find((task)=>task.source_span.start<clause.source_span.start)||tasks[0]];
    for (const task of targets) {
      task.success_criteria=unique([...task.success_criteria,...taskSuccess]); task.completion_criteria=unique([...task.completion_criteria,...taskSuccess]); task.constraints=unique([...task.constraints,...taskConstraints]); task.prohibitions=unique([...task.prohibitions,...taskProhibitions]); task.preserve=unique([...task.preserve,...taskPreserves]); task.replace=unique([...task.replace,...taskReplacements]); task.conditions=unique([...task.conditions,...taskConditions]); task.exceptions=unique([...task.exceptions,...taskExceptions]); task.verification=unique([...task.verification,...taskVerifications]); task.premises=unique([...task.premises,...premises]); if(RX.evidence.test(text)) task.evidence_need.required=true;
    }
  }
}

function resolveRefs(tasks) {
  for (const task of tasks) {
    if (!/^(?:入力対象|input target)$/.test(task.target || '')) continue;
    const premise=(task.premises||[]).find((item)=>!RX.success.test(item)), match=premise&&clean(premise).match(/^(.{1,100}?)(?:は|が|について|を)/);
    if(match&&clean(match[1])) { task.target=clean(match[1]); task.objective=objective(task.target,task.action,language(task.source_span.text)); task.unresolved=task.unresolved.filter((item)=>item!=='target'); }
  }
}

function inferDeps(tasks) {
  const dependencies=[];
  for(let index=0;index<tasks.length;index+=1){const task=tasks[index],raw=task.raw_text||task.source_span.text;if(index>0&&(RX.order.test(raw)||/(?:後|終わったら|完了したら|してから|確認してから|検証してから|after|once .* complete)/i.test(raw))){task.depends_on.push(tasks[index-1].id);task.parallelizable=false;dependencies.push({from:tasks[index-1].id,to:task.id,type:'ORDER_AFTER',reason:'explicit_order'});}if(RX.parallel.test(raw))task.parallelizable=true;}
  return dependencies;
}

function buildExecutionWaves(tasks=[],dependencies=[]){const ids=new Set(tasks.map((task)=>task.id)),incoming=new Map(tasks.map((task)=>[task.id,new Set()]));for(const dependency of dependencies)if(ids.has(dependency.from)&&ids.has(dependency.to))incoming.get(dependency.to).add(dependency.from);const remaining=new Set(ids),waves=[];while(remaining.size){const ready=[...remaining].filter((id)=>[...incoming.get(id)].every((parent)=>!remaining.has(parent))).sort();if(!ready.length){waves.push([...remaining].sort());break;}waves.push(ready);ready.forEach((id)=>remaining.delete(id));}return waves;}

function analyzeRequest({question='',context=''}={}){const q=norm(question),ctx=norm(context),lang=language(q),spans=segment(q),globalSuccess=success(q),clauses=spans.map((sourceSpan,index)=>makeTask(sourceSpan,index,lang,globalSuccess));let tasks=clauses.filter((item)=>item.actionable);const others=clauses.filter((item)=>!item.actionable);if(!tasks.length&&q){tasks=[makeTask(spans[0]||{start:0,end:q.length,text:q},0,lang,globalSuccess)];tasks[0].actionable=true;}tasks=tasks.map((task,index)=>({...task,id:`T${String(index+1).padStart(2,'0')}`,order:index+1}));attach(tasks,others);resolveRefs(tasks);const dependencies=inferDeps(tasks),globalConstraints=constraints(q),globalProhibitions=prohibitions(q),globalPreserves=preserves(q),globalReplacements=replacements(q),globalVerification=verifications(q),conflicts=[];if(globalProhibitions.some((prohibition)=>globalReplacements.some((replacement)=>tokenOverlap(prohibition,replacement)>=0.5)))conflicts.push({type:'PROHIBITION_REPLACE_OVERLAP',note:'同一対象に禁止と変更指示が重なる可能性がある。'});for(const task of tasks){if(!task.target||/^(?:入力対象|input target)$/.test(task.target))task.unresolved.push('target');if(!task.success_criteria.length&&['implement','improve','migrate','integrate','remove'].includes(task.action))task.unresolved.push('completion_criteria');}const unresolved=unique(tasks.flatMap((task)=>task.unresolved.map((item)=>`${task.id}:${item}`))),hardBlockers=unique(conflicts.map((item)=>item.type)),packet={schema_version:'astera.analysis-task-packet.v1',intent:tasks[0]?.action||'analyze',tasks,dependencies,execution_waves:buildExecutionWaves(tasks,dependencies),constraints:globalConstraints,prohibitions:globalProhibitions,preserve:globalPreserves,replace:globalReplacements,verification:globalVerification,completion_criteria:globalSuccess,unresolved,conflicts,hard_blockers:hardBlockers,source_spans:tasks.map((task)=>({task_id:task.id,...task.source_span}))},primary=tasks[0];return{schema_version:'astera.request-model.v2',language:lang,normalized_question:q,target:primary?.target||'',target_confidence:primary?.unresolved?.includes('target')?'low':'high',action:primary?.action||'analyze',objective:primary?.objective||objective('','analyze',lang),success_criteria:globalSuccess,constraints:globalConstraints,prohibitions:globalProhibitions,preserve:globalPreserves,replace:globalReplacements,verification:globalVerification,query_terms:terms(`${q}\n${ctx}`),context_present:Boolean(ctx),context_length:ctx.length,instruction_map:{clause_count:clauses.length,task_count:tasks.length,correction_count:clauses.filter((item)=>item.clause_type==='correction').length,prohibition_count:globalProhibitions.length,preserve_count:globalPreserves.length,verification_count:globalVerification.length},instruction_understanding:{mode:'INTERNAL_DETERMINISTIC',parser:null,execution_allowed:hardBlockers.length===0,blocked_reasons:hardBlockers},analysis_task_packet:packet};}

function deriveEvidenceNeed(task={},domain={}){const reasons=unique(task.evidence_need?.reasons||[]),domainEvidence=Array.isArray(domain.primary?.evidence_to_collect)?domain.primary.evidence_to_collect:[],overlays=(domain.overlays||[]).map((item)=>item.id),explicitEvidenceText=[...(task.verification||[]),...(task.success_criteria||[]),...(task.completion_criteria||[]),...(task.conditions||[]),task.target||'',task.objective||''].join(' '),internalVerification=RX.internalTest.test(explicitEvidenceText),externalEvidenceSignal=RX.evidence.test(explicitEvidenceText),explicitEvidenceOverlay=overlays.includes('current_information')||overlays.includes('evidence_strict');if(task.evidence_need?.required)reasons.push('task_contract_requires_evidence');if(externalEvidenceSignal)reasons.push('task_criteria_requires_external_evidence');if(explicitEvidenceOverlay)reasons.push(overlays.includes('current_information')?'overlay:current_information':'overlay:evidence_strict');if(['verify','compare','decide'].includes(task.action)&&domainEvidence.length&&(externalEvidenceSignal||explicitEvidenceOverlay)&&!internalVerification)reasons.push(`action:${task.action}:external_evidence`);const required=reasons.length>0,queries=required?unique([...(task.evidence_need?.queries||[]),task.target||'',task.objective||'',...domainEvidence,...(task.verification||[]),...(task.conditions||[])]).slice(0,20):[];return{required,reasons:unique(reasons),queries};}

function evidenceClaim(item){return norm(item?.fields?.claim||item?.excerpt||item?.title||item?.canonical_record_id||'');}
function emptyEvidencePacket(state='NOT_PROVIDED'){return Object.freeze({schema_version:'astera.evidence-packet.compact.v2',state,source_status:null,eligibility_reasons:Object.freeze([]),quality_score_bp:null,quality_gate_bp:9500,initial_quality_score_bp:null,initial_quality_gate_bp:8000,final_phase:null,reinforcement_attempt_count:0,reinforcement_fulfilled_count:0,new_corroboration_count:0,unique_evidence_count:0,coverage_state:'UNKNOWN',conflict_detected:false,result_hash:null,evidence:Object.freeze([]),provider_failures:Object.freeze([]),role_counts:Object.freeze({}),distinct_authority_count:0,distinct_source_family_count:0});}
function normalizeEvidencePacket(packet){if(!packet||typeof packet!=='object'||Array.isArray(packet))return emptyEvidencePacket();const source=packet.result&&packet.schema_version==='astera.evidence-search.module-response.v1'?packet.result:packet,status=String(source.status||'UNKNOWN').toUpperCase();if(status==='NOT_REQUIRED')return Object.freeze({...emptyEvidencePacket('NOT_REQUIRED'),source_status:status});const initialQuality=source.quality?.initial||{},finalQuality=source.quality?.final||{},initialScore=Number.isInteger(initialQuality.score_bp)?initialQuality.score_bp:null,initialGate=Number.isInteger(initialQuality.gates?.initial_minimum_bp)?initialQuality.gates.initial_minimum_bp:8000,finalScore=Number.isInteger(finalQuality.score_bp)?finalQuality.score_bp:null,finalGate=Number.isInteger(finalQuality.gates?.final_minimum_bp)?finalQuality.gates.final_minimum_bp:9500,initialPhase=String(initialQuality.phase||'').toUpperCase()||null,finalPhase=String(finalQuality.phase||'').toUpperCase()||null,reinforcementAttemptCount=Number.isInteger(source.quality?.reinforcement_attempt_count)?source.quality.reinforcement_attempt_count:0,newCorroborationCount=Number.isInteger(source.quality?.new_corroboration_count)?source.quality.new_corroboration_count:0,evidence=(Array.isArray(source.evidence)?source.evidence:[]).map((item)=>Object.freeze({id:String(item.candidate_id||item.canonical_record_id||''),canonical_record_id:String(item.canonical_record_id||''),content_hash:String(item.content_hash||''),claim:evidenceClaim(item),source_role:String(item.source_role||'').toUpperCase(),source_family_id:String(item.source_family_id||''),authority_id:String(item.authority_id||item.publisher?.id||''),publisher_id:String(item.publisher?.id||''),source_id:String(item.source_id||item.provider_id||''),provider_id:String(item.provider_id||''),url:item.canonical_locator?.url||null,replayable:item.canonical_locator?.replayable===true,updated_at:item.updated_at||item.published_at||null,version:item.version||null,fields:Object.freeze({...item.fields||{}})})).filter((item)=>item.claim||item.id),initialRuns=Array.isArray(source.provider_execution?.initial)?source.provider_execution.initial:[],reinforcementRuns=Array.isArray(source.provider_execution?.reinforcement)?source.provider_execution.reinforcement:[],failures=[...initialRuns,...reinforcementRuns].filter((item)=>item.status&&item.status!=='FULFILLED').map((item)=>({provider_id:item.provider_id||'',error_code:item.error_code||'PROVIDER_FAILED'})),reinforcementFulfilledCount=reinforcementRuns.filter((item)=>String(item.status||'').toUpperCase()==='FULFILLED').length,evidenceIdentities=new Set(evidence.map((item)=>item.content_hash||item.canonical_record_id||item.id||item.url).filter(Boolean)),blockingReasons=unique(finalQuality.blocking_reasons||[]),eligibilityReasons=[];if(status==='FINAL_VALID'){if(String(source.schema_version||'')!=='astera.evidence-search.result.v1')eligibilityReasons.push('EVIDENCE_SCHEMA_INVALID');if(!String(source.result_hash||'').trim())eligibilityReasons.push('RESULT_HASH_MISSING');if(String(initialQuality.status||'').toUpperCase()!=='REINFORCEMENT_REQUIRED')eligibilityReasons.push('INITIAL_QUALITY_STATUS_INVALID');if(initialPhase!=='INITIAL')eligibilityReasons.push('INITIAL_QUALITY_PHASE_INVALID');if(initialScore==null||initialScore<initialGate||initialScore<8000)eligibilityReasons.push('INITIAL_QUALITY_BELOW_80');if(String(finalQuality.status||'').toUpperCase()!=='FINAL_VALID')eligibilityReasons.push('FINAL_QUALITY_STATUS_INVALID');if(finalPhase!=='FINAL')eligibilityReasons.push('FINAL_QUALITY_PHASE_INVALID');if(finalScore==null||finalScore<finalGate||finalScore<9500)eligibilityReasons.push('FINAL_QUALITY_BELOW_95');if(reinforcementAttemptCount!==1)eligibilityReasons.push('REINFORCEMENT_COUNT_INVALID');if(reinforcementFulfilledCount<1)eligibilityReasons.push('REINFORCEMENT_EXECUTION_MISSING');if(newCorroborationCount<1)eligibilityReasons.push('NEW_CORROBORATION_MISSING');if(evidenceIdentities.size<newCorroborationCount+1)eligibilityReasons.push('CORROBORATION_EVIDENCE_MISMATCH');if(!evidence.length)eligibilityReasons.push('EVIDENCE_EMPTY');if(source.ai_used!==false)eligibilityReasons.push('AI_USED_CONTRACT_INVALID');if(source.payment_executed!==false)eligibilityReasons.push('PAYMENT_EXECUTION_CONTRACT_INVALID');if(blockingReasons.length)eligibilityReasons.push(...blockingReasons.map((item)=>`QUALITY_BLOCK:${item}`));}const valid=status==='FINAL_VALID'&&eligibilityReasons.length===0,state=valid?'VALID':status==='FINAL_VALID'||status.startsWith('REJECTED')||status==='ERROR'?'REJECTED':'PARTIAL',roleCounts=evidence.reduce((acc,item)=>{const key=item.source_role||'UNKNOWN';acc[key]=(acc[key]||0)+1;return acc;},{}),authorities=new Set(evidence.map((item)=>item.authority_id||item.publisher_id).filter(Boolean)),families=new Set(evidence.map((item)=>item.source_family_id).filter(Boolean));return Object.freeze({schema_version:'astera.evidence-packet.compact.v2',state,source_status:status,eligibility_reasons:Object.freeze(unique(eligibilityReasons)),quality_score_bp:finalScore,quality_gate_bp:finalGate,initial_quality_score_bp:initialScore,initial_quality_gate_bp:initialGate,quality_criterion_scores:Object.freeze({...finalQuality.criterion_scores||{}}),final_phase:finalPhase,reinforcement_attempt_count:reinforcementAttemptCount,reinforcement_fulfilled_count:reinforcementFulfilledCount,new_corroboration_count:newCorroborationCount,unique_evidence_count:evidenceIdentities.size,coverage_state:String(source.coverage?.discovery_scope_state||source.coverage?.registry_coverage_state||'UNKNOWN'),conflict_detected:blockingReasons.some((item)=>/CONFLICT/i.test(item)),effective_as_of:source.effective_as_of||null,result_hash:source.result_hash||null,evidence:Object.freeze(evidence),provider_failures:Object.freeze(failures),role_counts:Object.freeze(roleCounts),distinct_authority_count:authorities.size,distinct_source_family_count:families.size});}
function characterGrams(text){const compact=norm(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');if(!compact)return[];if(compact.length<=3)return[compact];const grams=[];for(let index=0;index<=compact.length-3;index+=1)grams.push(compact.slice(index,index+3));return unique(grams);}
function tokenOverlap(left,right){const a=norm(left).toLowerCase(),b=norm(right).toLowerCase();if(!a||!b)return 0;if(a.includes(b)||b.includes(a))return 1;const x=new Set(characterGrams(a)),y=new Set(characterGrams(b));if(!x.size||!y.size)return 0;let hits=0;for(const gram of x)if(y.has(gram))hits+=1;return hits/Math.max(1,Math.min(x.size,y.size));}
function matchingEvidence(text,packet,threshold=0.25){return(packet?.evidence||[]).map((item)=>({item,overlap:tokenOverlap(text,item.claim)})).filter((entry)=>entry.overlap>=threshold).sort((a,b)=>b.overlap-a.overlap);}

module.exports={analyzeRequest,normalizeEvidencePacket,normalizeText:norm,splitSentences,segmentSource:segment,extractTerms:terms,matchingEvidence,tokenOverlap,unique,deriveEvidenceNeed,buildExecutionWaves};